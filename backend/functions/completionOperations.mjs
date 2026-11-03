import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {approvedTransaction,ROLES} from './access.mjs';
import {completionCanonical,completionIdentifier,validateCompletionIntent,validateCompletionOutcome,completionExact} from './completionWorkflow.js';
import {completionUUID} from './completionWorkflow.js';
import {trustedDemoEnvironment} from './demoEnvironment.mjs';
const fail=(message,code='failed-precondition')=>{throw Object.assign(Error(message),{code});};
const sha=value=>createHash('sha256').update(value).digest('hex');
export function completionReceiptId({scope,actor,action,operationId}){
 completionIdentifier(scope);completionIdentifier(actor);completionIdentifier(action);completionUUID(operationId);
 return sha(completionCanonical({scope,actor,action,operationId}));
}
export function assertCompletionLocal(){
 if(['spark-msi','spark-loopback-test'].includes(process.env.IILAS_DEMO_MODE)){trustedDemoEnvironment();return;}
 if(process.env.IILAS_DEMO_MODE==='cloud-demo'){trustedDemoEnvironment();return;}
 const project='fyp-inventory-and-logistics',expected={FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:project,GOOGLE_CLOUD_PROJECT:project,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',IILAS_FYP_COMPLETION_MODE:'local-demo'};
 if(Object.entries(expected).some(([key,value])=>process.env[key]!==value))fail('This workflow requires the configured local FYP demonstration profile.','unavailable');
}
export async function runCompletionOperation({auth,scope,action,input,roles,resolveOnly=false,work}){
 assertCompletionLocal();completionIdentifier(scope);completionIdentifier(auth?.uid);completionIdentifier(action);
 const data=validateCompletionIntent(input),commandHash=sha(completionCanonical(data)),receiptId=completionReceiptId({scope,actor:auth.uid,action,operationId:data.operationId});
 if(!Array.isArray(roles)||!roles.length||roles.some(role=>!ROLES.includes(role)))fail('A staff operation policy is required.');
 const db=getFirestore(),receipt=db.collection('completionRequests').doc(receiptId);
 // Current account authority is checked inside every retry, including replay.
 // A changed staff role can recover the original terminal receipt, but cannot
 // start fresh work or cancel an unknown operation without its action role.
 return approvedTransaction(auth,ROLES,async(tx,config,member)=>{
  if(config.dataScopeId!==scope)fail('The shared system data source cannot be changed.','permission-denied');
  const old=await tx.get(receipt);
  if(old.exists){
   const saved=old.data();if(saved.actor!==auth.uid||saved.ownerId!==scope||saved.action!==action||saved.commandHash!==commandHash||completionCanonical(saved.input)!==completionCanonical(data))fail('This operation belongs to different input.');
   const result=validateCompletionOutcome(saved.result,{action,input:data});if(result.state!==saved.state)fail('The saved operation needs reconciliation.','unavailable');return {...result,replayed:true};
  }
  if(!roles.includes(member.role))fail('Your role cannot start this operation.','permission-denied');
  let result,apply;
  if(resolveOnly)result={state:'Cancelled',operationId:data.operationId,action,recordId:null,version:null,replayed:false};
  else {
   const prepared=await work(tx,member);if(!prepared||typeof prepared.apply!=='function')fail('The operation could not be prepared.');
   const fields=completionExact(prepared.result,['recordId','version']);
   result={state:'Completed',operationId:data.operationId,action,...fields,replayed:false};apply=prepared.apply;
  }
  result=validateCompletionOutcome(result,{action,input:data});assertCompletionLocal();
  if(apply){const returned=apply();if(returned&&typeof returned.then==='function')fail('Operation apply must only enqueue synchronous transaction writes.');}
  const at=FieldValue.serverTimestamp();
  tx.create(receipt,{ownerId:scope,actor:auth.uid,action,input:data,commandHash,state:result.state,result,createdAt:at,version:1});
  if(result.state==='Completed')tx.create(db.collection('auditLogs').doc('completion_'+receiptId),{ownerId:scope,actor:auth.uid,action,kind:'completionOperations',recordId:result.recordId,version:result.version,label:'Local demonstration operation completed',at});
  return result;
 });
}
