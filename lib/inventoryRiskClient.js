import {validateCaptureInput,validateReviewInput,canonicalInventoryRisk} from './inventoryRisk.js';

export function createInventoryRiskClient({storage,context,command,isCurrent}){
 if(!context||!['uid','scope'].every(k=>typeof context[k]==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(context[k]))||typeof isCurrent!=='function')throw new Error('A current inventory account context is required.');
 const prefix=`iilas.inventoryRisk.${context.scope}.${context.uid}`;let inFlight=false;
 const valid={capture:validateCaptureInput,review:validateReviewInput};
 function current(){if(!isCurrent())throw new Error('The active account changed. Return to the original account to recover this request.');}
 function pending(kind){current();const raw=storage.getItem(`${prefix}.${kind}`);if(!raw)return null;try{return valid[kind](JSON.parse(raw));}catch{throw new Error('Saved inventory review data cannot be read. Keep it for administrator reconciliation.');}}
 async function send(kind,input,resolve=false,retry=false){
  current();if(inFlight)throw new Error('An inventory review request is already running.');
  const saved=pending(kind);if((resolve||retry)&&!saved)throw new Error('There is no saved inventory request to recover.');
  let request=saved;
  if(!request){request=valid[kind]({...input,operationId:crypto.randomUUID()});storage.setItem(`${prefix}.${kind}`,JSON.stringify(request));}
  else if(input){const attempted=valid[kind]({...input,operationId:request.operationId});if(canonicalInventoryRisk(attempted)!==canonicalInventoryRisk(request))throw new Error('Recover the saved request before entering a different one.');}
  inFlight=true;
  try{
   const result=await command(kind==='review'?(resolve?'resolveInventoryReview':'reviewInventorySnapshot'):resolve?'resolveInventorySnapshot':'captureInventorySnapshot',request);current();
   const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
   const reviewValid=result&&result.snapshotId===request.snapshotId&&typeof result.replayed==='boolean'&&(result.state==='Cancelled'?result.version===null&&result.reviewId===null:result.version===request.version+1&&id(result.reviewId));
   if(kind==='capture'?!result||typeof result.replayed!=='boolean'||!(result.state==='Captured'&&id(result.snapshotId)||result.state==='Cancelled'&&result.snapshotId===null):!reviewValid)throw new Error('The outcome could not be confirmed. Recover the same saved request.');
   storage.removeItem(`${prefix}.${kind}`);return result;
  }finally{inFlight=false;}
 }
 return {pendingCapture:()=>pending('capture'),capture:input=>send('capture',input),resolveCapture:()=>send('capture',null,true),pendingReview:()=>pending('review'),review:input=>send('review',input),retryReview:()=>send('review',null,false,true),resolveReview:()=>send('review',null,true)};
}
