import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createHash,randomUUID} from 'node:crypto';
import {approvedTransaction} from './access.mjs';
import {assertInventoryLocalEmulators} from './inventoryExperimentLifecycle.mjs';
import {DEMO_REORDER_POLICY,isDemoRiskLabel,validateDemoReorderReviewInput,validateDemoReorderOutcome,verifyDemoReorderLineage} from './inventoryDemoReorder.js';
import {captureDemoProductSource} from './inventoryDemoProductFacts.mjs';
import {INVENTORY_CONTEXT_PROVENANCE,contextFeaturesForScenario,contextFeaturePayload,demoProductFactsPayload,demoScenarioFor,validateContextPrediction} from './inventoryContextAI.js';
import {canonicalInventoryAI} from './inventoryAI.js';

const fail=(message,code='failed-precondition')=>{throw Object.assign(new Error(message),{code});};
const sha=value=>createHash('sha256').update(value).digest('hex');
const ref=(kind,id)=>getFirestore().collection(kind).doc(id);
const stamp=()=>FieldValue.serverTimestamp();
export function demoReorderCapabilityEnabled(){
 assertInventoryLocalEmulators();return process.env.IILAS_STOCK_DEMO_PRODUCTS==='enabled'&&process.env.IILAS_STOCK_DEMO_REORDERS==='enabled';
}
export function assertDemoReorderCapability(){if(!demoReorderCapabilityEnabled())fail('Demo AI reorder review is disabled in this local profile.','unavailable');}
export function writeDemoReorderResult(tx,{experimentId,saved,status,prediction}){
 if(saved.demoReorderPolicy!==DEMO_REORDER_POLICY||status!=='Predicted'||!isDemoRiskLabel(prediction?.label))return;
 const scenario=demoScenarioFor(saved.sourceProduct,saved.input.facts),features=contextFeaturesForScenario(scenario);
 if(canonicalInventoryAI(scenario)!==canonicalInventoryAI(saved.scenario)||canonicalInventoryAI(features)!==canonicalInventoryAI(saved.features)||sha(contextFeaturePayload(features))!==saved.inputSha256||sha(demoProductFactsPayload(saved.sourceProduct))!==saved.sourceProduct.factsSha256)fail('Frozen demo reorder facts need reconciliation.','unavailable');
 validateContextPrediction(prediction,{...saved.binding,requestId:saved.nonce,inputSha256:saved.inputSha256,features});
 const basis={experimentId,experimentActor:saved.actor,operationId:saved.input.operationId,sourceProduct:saved.sourceProduct,scenario,features,inputSha256:saved.inputSha256,prediction,source:saved.binding,requestedAtMs:saved.startedAtMs};
 const common={ownerId:saved.ownerId,basis,policyVersion:DEMO_REORDER_POLICY,createdAt:stamp(),version:1,...INVENTORY_CONTEXT_PROVENANCE};
 tx.create(ref('inventoryDemoRiskAlerts',experimentId),{...common,requirementId:experimentId});
 tx.create(ref('inventoryDemoReorderRequirements',experimentId),{...common,alertId:experimentId,status:'Pending',review:null});
}
export function createInventoryDemoReorderCommands({clock=Date.now}={}){
 const run=(auth,scope,work)=>approvedTransaction(auth,['Admin','Manager'],async(tx,config)=>{
  if(scope!==config.dataScopeId)fail('The shared system data source cannot be changed.','permission-denied');return work(tx);
 });
 const receipt=(auth,scope,data)=>ref('inventoryDemoReorderRequests',sha(canonicalInventoryAI({action:'inventoryDemoReorderReview',scope,actor:auth.uid,operationId:data.operationId})));
 function replay(saved,auth,scope,data){
  if(saved.ownerId!==scope||saved.actor!==auth.uid||saved.commandHash!==sha(canonicalInventoryAI(data)))fail('This demo review operation belongs to different input.');
  if(!['Completed','Cancelled'].includes(saved.state)||saved.result?.state!==saved.state)fail('The saved demo review needs reconciliation.','unavailable');
  return {...validateDemoReorderOutcome(saved.result,data),replayed:true};
 }
 async function reviewInventoryDemoReorder(auth,scope,input){
  assertInventoryLocalEmulators();const data=validateDemoReorderReviewInput(input),receiptRef=receipt(auth,scope,data);
  return run(auth,scope,async tx=>{
   const old=await tx.get(receiptRef);if(old.exists)return replay(old.data(),auth,scope,data);
   assertDemoReorderCapability();
   const id=data.requirementId,[requirement,alert,experiment]=await Promise.all(['inventoryDemoReorderRequirements','inventoryDemoRiskAlerts','inventoryAIExperiments'].map(kind=>tx.get(ref(kind,id))));
   if([requirement,alert,experiment].some(snapshot=>!snapshot.exists))fail('The original demo reorder evidence is unavailable.','not-found');
   if([requirement,alert,experiment].some(snapshot=>snapshot.data().ownerId!==scope))fail('The demo requirement belongs to another data source.','permission-denied');
   const graph=await verifyDemoReorderLineage({id,requirement:requirement.data(),alert:alert.data(),experiment:experiment.data()}),saved=graph.requirement;
   if(saved.status!=='Pending'||saved.version!==data.expectedVersion)fail('The demo requirement changed or has already been reviewed. Refresh its history.');
   if(saved.basis.experimentActor===auth.uid)fail('A different Admin or Manager must review your own demo requirement.','permission-denied');
   if(data.decision==='Accept'){
    const current=await captureDemoProductSource(tx,scope,saved.basis.sourceProduct.productId,saved.basis.sourceProduct.observedAtMs);
    if(current.productVersion!==saved.basis.sourceProduct.productVersion||current.factsSha256!==saved.basis.sourceProduct.factsSha256)fail('The demo product changed. Refresh its facts and run a new experiment before acceptance.');
   }
   assertDemoReorderCapability();
   const eventId=randomUUID(),result={state:'Completed',operationId:data.operationId,requirementId:id,eventId,decision:data.decision,replayed:false};
   const summary={operationId:data.operationId,eventId,decision:data.decision,notes:data.notes,reviewedBy:auth.uid,reviewedAt:stamp()};
   tx.update(ref('inventoryDemoReorderRequirements',id),{status:data.decision==='Accept'?'Accepted':'Rejected',review:summary,version:2});
   tx.create(ref('inventoryDemoReorderEvents',eventId),{ownerId:scope,requirementId:id,experimentId:id,operationId:data.operationId,actor:auth.uid,decision:data.decision,notes:data.notes,fromVersion:1,toVersion:2,at:stamp(),version:1,...INVENTORY_CONTEXT_PROVENANCE});
   tx.create(receiptRef,{ownerId:scope,actor:auth.uid,input:data,commandHash:sha(canonicalInventoryAI(data)),state:'Completed',result,createdAt:stamp(),requestedAtMs:clock(),version:1});
   tx.create(ref('auditLogs','inventoryDemoReorder_'+receiptRef.path.split('/').at(-1)),{ownerId:scope,actor:auth.uid,kind:'inventoryDemoReorderRequirements',recordId:id,action:'DemoReview',version:2,label:'Demo replenishment review only: '+data.decision,at:stamp()});
   return result;
  });
 }
 async function resolveInventoryDemoReorderReview(auth,scope,input){
  assertInventoryLocalEmulators();const data=validateDemoReorderReviewInput(input),receiptRef=receipt(auth,scope,data);
  return run(auth,scope,async tx=>{
   const old=await tx.get(receiptRef);if(old.exists)return replay(old.data(),auth,scope,data);
   const result={state:'Cancelled',operationId:data.operationId,requirementId:data.requirementId,eventId:null,decision:null,replayed:false};
   tx.create(receiptRef,{ownerId:scope,actor:auth.uid,input:data,commandHash:sha(canonicalInventoryAI(data)),state:'Cancelled',result,createdAt:stamp(),requestedAtMs:clock(),version:1});return result;
  });
 }
 async function getInventoryDemoReorderAvailability(auth,scope,input){
  assertInventoryLocalEmulators();
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)fail('No input fields are accepted for demo workflow availability.');
  return approvedTransaction(auth,['Admin','Manager','Inventory','Warehouse','Logistics','Driver','Viewer'],async(_tx,config)=>{
   if(scope!==config.dataScopeId)fail('The shared system data source cannot be changed.','permission-denied');
   const enabled=demoReorderCapabilityEnabled();return {enabled,policyVersion:enabled?DEMO_REORDER_POLICY:null};
  });
 }
 return {getInventoryDemoReorderAvailability,reviewInventoryDemoReorder,resolveInventoryDemoReorderReview};
}
const commands=createInventoryDemoReorderCommands();
export const getInventoryDemoReorderAvailability=(...args)=>commands.getInventoryDemoReorderAvailability(...args);
export const reviewInventoryDemoReorder=(...args)=>commands.reviewInventoryDemoReorder(...args);
export const resolveInventoryDemoReorderReview=(...args)=>commands.resolveInventoryDemoReorderReview(...args);
