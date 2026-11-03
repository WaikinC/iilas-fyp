import {validateDemoReorderReviewInput,validateDemoReorderOutcome} from './inventoryDemoReorder.js';
import {canonicalInventoryAI} from './inventoryAI.js';
async function observe(command){let timer;try{return await Promise.race([command,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No confirmed response within 35 seconds. Recover the same saved demo review.')),35000);})]);}finally{clearTimeout(timer);}}
export function createInventoryDemoReorderClient({storage,context,command,isCurrent}){
 if(!context||!['uid','scope'].every(k=>typeof context[k]==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(context[k]))||typeof command!=='function'||typeof isCurrent!=='function')throw Error('A current demo review account context is required.');
 const key=`iilas.inventoryAI.${context.scope}.${context.uid}.demoReorderReview`;let inFlight=false,active=true,epoch=0;
 const current=()=>{if(!active)throw Error('The original demo review view closed. Recover the saved review in the current view.');if(!isCurrent())throw Error('The active account changed. Return to the original account to recover the demo review.');};
 function pending(){current();const raw=storage.getItem(key);if(raw===null||raw===undefined)return null;try{return validateDemoReorderReviewInput(JSON.parse(raw));}catch{throw Error('Saved demo review needs administrator reconciliation. Keep the saved data.');}}
 async function send(input,resolve=false){
  current();if(inFlight)throw Error('A demo review request is already running.');
  let request=pending();
  if(input){if(request)throw Error('Recover the saved demo review before starting another.');request=validateDemoReorderReviewInput({...input,operationId:crypto.randomUUID()});storage.setItem(key,JSON.stringify(request));}
  if(!request)throw Error('No saved demo review to recover.');
  const startedEpoch=epoch;inFlight=true;
  try{
   const result=validateDemoReorderOutcome(await observe(command(resolve?'resolveInventoryDemoReorderReview':'reviewInventoryDemoReorder',request)),request);if(startedEpoch!==epoch)throw Error('The original demo review view changed. Recover its saved review.');current();
   const latest=pending();if(!latest||canonicalInventoryAI(latest)!==canonicalInventoryAI(request))throw Error('The saved demo review changed. Its outcome could not be confirmed.');
   storage.removeItem(key);return result;
  }finally{inFlight=false;}
 }
 return {activate:()=>{active=true;epoch++;},dispose:()=>{active=false;epoch++;},pending,start:input=>send(input),retry:()=>send(null),resolve:()=>send(null,true)};
}
