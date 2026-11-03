import {prepareBusinessCode} from './businessCodeAllocation.mjs';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createHash,randomUUID} from 'node:crypto';
import {approvedTransaction,ROLES} from './access.mjs';
import {assertInventoryLocalEmulators} from './inventoryExperimentLifecycle.mjs';
import {captureDemoProductSource} from './inventoryDemoProductFacts.mjs';
import {canonicalInventoryAI} from './inventoryAI.js';
import {validatePurchaseCommand} from './procurementValidation.js';
import {preparePurchaseTransition,writePurchaseTransition} from './purchaseOrderWorkflow.mjs';
import {DEMO_PROCUREMENT_POLICY,validateDemoProcurementInput,validateDemoProcurementOutcome,verifyAcceptedDemoProcurementSource,decodeDemoProcurementSource,decodeDemoProcurementLink,decodeExpectedReplenishment} from './inventoryDemoProcurement.js';
const fail=(message,code='failed-precondition')=>{throw Object.assign(new Error(message),{code});};
const sha=value=>createHash('sha256').update(canonicalInventoryAI(value)).digest('hex');
const ref=(kind,id)=>getFirestore().collection(kind).doc(id),stamp=()=>FieldValue.serverTimestamp();
const eq=(a,b)=>canonicalInventoryAI(a)===canonicalInventoryAI(b);
export function demoProcurementCapabilityEnabled(){assertInventoryLocalEmulators();return ['IILAS_STOCK_DEMO_PRODUCTS','IILAS_STOCK_DEMO_REORDERS','IILAS_STOCK_DEMO_PROCUREMENT'].every(key=>process.env[key]==='enabled');}
export function assertDemoProcurementCapability(){if(!demoProcurementCapabilityEnabled())fail('New demo purchase creation is disabled in this local profile.','unavailable');}
const roles=input=>input.kind==='Action'&&['Approve','Reject'].includes(input.purchase.step)?['Admin','Manager']:input.kind==='Action'&&input.purchase.step==='Receive'?['Admin','Manager','Inventory','Warehouse']:['Admin','Manager','Inventory'];
async function sourceFor(tx,scope,id){
 const [alert,requirement,experiment]=await Promise.all(['inventoryDemoRiskAlerts','inventoryDemoReorderRequirements','inventoryAIExperiments'].map(kind=>tx.get(ref(kind,id))));
 if([alert,requirement,experiment].some(s=>!s.exists||s.data().ownerId!==scope))fail('The accepted original demo source is unavailable.');
 const r=requirement.data(),eventId=r.review?.eventId;
 if(typeof eventId!=='string'||!/^[a-f0-9-]{36}$/.test(eventId))fail('The accepted review event needs reconciliation.');
 const event=await tx.get(ref('inventoryDemoReorderEvents',eventId));if(!event.exists)fail('The accepted review event is unavailable.');
 return verifyAcceptedDemoProcurementSource({id,alert:alert.data(),requirement:r,experiment:experiment.data(),event:event.data()});
}
function checkOrderSource(order,source){if(!eq(order.demoReorderSource,source)||!Array.isArray(order.items)||order.items.length!==1||order.items[0].productId!==source.basis.sourceProduct.productId)fail('The linked order source needs reconciliation.');}
async function checkExpected(snapshot,old,orderId,scope,source){
 const required=['Issued','PartReceived','Received'].includes(old.status);
 if(!required){if(snapshot.exists)fail('An unissued order has inconsistent expected incoming.');return;}
 if(!snapshot.exists)fail('The linked expected incoming record is missing.');
 const decoded=await decodeExpectedReplenishment(snapshot.data(),orderId);if(decoded.kind!=='expected')fail('The expected incoming record needs reconciliation.');
 const e=decoded.record,line=old.items[0];
 if(e.ownerId!==scope||e.requirementId!==source.requirementId||e.sourceSha256!==sha(source)||!eq(e.source,source)||e.orderVersion!==old.version||e.orderedQuantity!==line.quantity||e.receivedQuantity!==line.received||e.expectedDate!==old.expectedDate||!eq(e.product,{productId:line.productId,name:line.name,sku:line.sku})||!eq(e.supplier,{supplierId:old.supplierId,name:old.supplierName,contact:old.supplierContact})||e.state!==(old.status==='Issued'?'Expected':old.status))fail('Expected incoming and the linked purchase order differ.');
}
function expectedFor(prepared,source,previous){
 const order=prepared.result,line=order.items[0],receivedQuantity=line.received,outstandingQuantity=line.quantity-receivedQuantity;
 return {version:1,ownerId:prepared.s,purchaseOrderId:prepared.key,requirementId:source.requirementId,source,sourceSha256:sha(source),product:{productId:line.productId,name:line.name,sku:line.sku},supplier:{supplierId:order.supplierId,name:order.supplierName,contact:order.supplierContact},orderedQuantity:line.quantity,receivedQuantity,outstandingQuantity,expectedDate:order.expectedDate,orderVersion:order.version,state:receivedQuantity===0?'Expected':outstandingQuantity===0?'Received':'PartReceived',createdAt:previous?.createdAt||stamp(),updatedAt:stamp(),dataOrigin:'demonstration-test'};
}
export function createInventoryDemoProcurementCommands({stockWrite,clock=Date.now}){
 const run=(auth,scope,input,work)=>approvedTransaction(auth,roles(input),async(tx,config,member)=>{if(scope!==config.dataScopeId)fail('The shared data source cannot be changed.','permission-denied');return work(tx,member);});
 const receipt=(auth,scope,input)=>ref('inventoryDemoProcurementRequests',sha({action:'inventoryDemoProcurement',scope,actor:auth.uid,operationId:input.operationId}));
 function replay(saved,auth,scope,input){
  const keys=['version','ownerId','actor','input','commandHash','state','result','createdAt','requestedAtMs'];
  if(!saved||Object.keys(saved).length!==keys.length||keys.some(k=>!Object.hasOwn(saved,k))||saved.version!==1||saved.ownerId!==scope||saved.actor!==auth.uid||saved.commandHash!==sha(input)||!eq(saved.input,input)||!['Completed','Cancelled'].includes(saved.state)||saved.state!==saved.result?.state)fail('This saved purchase operation differs or needs reconciliation.');
  return {...validateDemoProcurementOutcome(saved.result,input),replayed:true};
 }
 async function submitInventoryDemoProcurement(auth,scope,value){
  assertInventoryLocalEmulators();const input=validateDemoProcurementInput(value),receiptRef=receipt(auth,scope,input),orderId=input.kind==='Create'?randomUUID():input.purchase.id;
  return run(auth,scope,input,async(tx,member)=>{
   const saved=await tx.get(receiptRef);if(saved.exists)return replay(saved.data(),auth,scope,input);
   if(input.kind==='Create'&&input.contractVersion!==2)fail('Historical creation is recovery-only. Refresh for an automatic purchase reference.');
   let allocation,command;const snapshot=await tx.get(ref('purchaseOrders',orderId)),old=snapshot.exists?snapshot.data():null;
   let source;
   if(input.kind==='Create'){
    assertDemoProcurementCapability();if(old)fail('The new purchase identity is already registered.');source=await sourceFor(tx,scope,input.requirementId);
    if(source.review.eventId!==input.acceptedEventId||input.expectedRequirementVersion!==2)fail('The accepted requirement changed. Refresh its evidence.');
    const linked=await tx.get(ref('inventoryDemoProcurementLinks',input.requirementId));
    if(linked.exists){
     const decoded=decodeDemoProcurementLink(linked.data(),input.requirementId);if(decoded.kind!=='link'||decoded.record.ownerId!==scope||decoded.record.sourceSha256!==sha(source))fail('The permanent purchase link needs reconciliation.');
     const existing=await tx.get(ref('purchaseOrders',decoded.record.purchaseOrderId));if(!existing.exists||existing.data().ownerId!==scope)fail('The linked purchase is unavailable. Retain its evidence.');checkOrderSource(existing.data(),source);
     const order=existing.data(),result=validateDemoProcurementOutcome({state:'Completed',operationId:input.operationId,kind:'Create',purchaseOrderId:existing.id,eventId:existing.id+'_'+order.version,status:order.status,version:order.version,replayed:false,reference:order.reference},input);
     tx.create(receiptRef,{version:1,ownerId:scope,actor:auth.uid,input,commandHash:sha(input),state:'Completed',result,createdAt:stamp(),requestedAtMs:clock()});return result;
    }
    allocation=await prepareBusinessCode(tx,{scope,kind:'purchaseOrders',recordId:orderId,actor:auth.uid,operationId:input.operationId});command=validatePurchaseCommand({...input.purchase,reference:allocation.code});
    const current=await captureDemoProductSource(tx,scope,source.basis.sourceProduct.productId,source.basis.sourceProduct.observedAtMs);
    if(current.productVersion!==source.basis.sourceProduct.productVersion||current.factsSha256!==source.basis.sourceProduct.factsSha256)fail('The demo product changed. Run a fresh analysis and independent review before creating a purchase.');
    if(command.items[0].productId!==source.basis.sourceProduct.productId)fail('The linked product cannot be substituted.');
   }else{
    command=validatePurchaseCommand(input.purchase);
    if(!old||old.ownerId!==scope||!Object.hasOwn(old,'demoReorderSource'))fail('A scoped linked demo purchase order is required.');
    await decodeDemoProcurementSource(old.demoReorderSource);source=await sourceFor(tx,scope,old.demoReorderSource.requirementId);checkOrderSource(old,source);
    const snapshot=await tx.get(ref('inventoryDemoProcurementLinks',source.requirementId)),link=snapshot.exists?decodeDemoProcurementLink(snapshot.data(),source.requirementId):null;
    if(link?.kind!=='link'||link.record.ownerId!==scope||link.record.purchaseOrderId!==orderId||link.record.sourceSha256!==sha(source))fail('The permanent purchase link needs reconciliation.');
    if(command.step==='Resubmit'&&command.items[0].productId!==source.basis.sourceProduct.productId)fail('The linked product cannot be substituted.');
   }
   const expectedRef=ref('expectedReplenishments',orderId),expected=await tx.get(expectedRef);
   if(old)await checkExpected(expected,old,orderId,scope,source);else if(expected.exists)fail('The new purchase has inconsistent expected incoming.');
   const prepared=await preparePurchaseTransition(tx,{scope,actor:auth.uid,member,command,orderId,old,codeAllocation:allocation});prepared.result.demoReorderSource=source;
   const incoming=['Issue','Receive'].includes(command.step)?expectedFor(prepared,source,expected.exists?expected.data():null):null;
   if(input.kind==='Create')assertDemoProcurementCapability();else assertInventoryLocalEmulators();
   const outcome=writePurchaseTransition(tx,prepared,{stockWrite});
   if(allocation)allocation.apply();
   if(input.kind==='Create')tx.create(ref('inventoryDemoProcurementLinks',source.requirementId),{version:1,ownerId:scope,requirementId:source.requirementId,purchaseOrderId:orderId,sourceSha256:sha(source),createdBy:auth.uid,createdAt:stamp(),dataOrigin:'demonstration-test'});
   if(incoming){if(command.step==='Issue')tx.create(expectedRef,incoming);else tx.set(expectedRef,incoming);}
   const result={state:'Completed',operationId:input.operationId,kind:input.kind,purchaseOrderId:outcome.id,eventId:`${outcome.id}_${outcome.version}`,status:outcome.status,version:outcome.version,replayed:false,...(input.contractVersion===2?{reference:prepared.result.reference}:{})};
   tx.create(receiptRef,{version:1,ownerId:scope,actor:auth.uid,input,commandHash:sha(input),state:'Completed',result,createdAt:stamp(),requestedAtMs:clock()});return result;
  });
 }
 async function resolveInventoryDemoProcurement(auth,scope,value){
  assertInventoryLocalEmulators();const input=validateDemoProcurementInput(value),receiptRef=receipt(auth,scope,input);
  return run(auth,scope,input,async tx=>{
   const saved=await tx.get(receiptRef);if(saved.exists)return replay(saved.data(),auth,scope,input);
   assertInventoryLocalEmulators();const result={state:'Cancelled',operationId:input.operationId,kind:input.kind,purchaseOrderId:null,eventId:null,status:null,version:null,replayed:false,...(input.contractVersion===2?{reference:null}:{})};
   tx.create(receiptRef,{version:1,ownerId:scope,actor:auth.uid,input,commandHash:sha(input),state:'Cancelled',result,createdAt:stamp(),requestedAtMs:clock()});return result;
  });
 }
 async function getInventoryDemoProcurementAvailability(auth,scope,input){
  assertInventoryLocalEmulators();if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)fail('Availability accepts no input fields.');
  return approvedTransaction(auth,ROLES,async(_tx,config)=>{if(scope!==config.dataScopeId)fail('The shared data source cannot be changed.','permission-denied');const enabled=demoProcurementCapabilityEnabled();return {enabled,policyVersion:enabled?DEMO_PROCUREMENT_POLICY:null};});
 }
 return {submitInventoryDemoProcurement,resolveInventoryDemoProcurement,getInventoryDemoProcurementAvailability};
}
