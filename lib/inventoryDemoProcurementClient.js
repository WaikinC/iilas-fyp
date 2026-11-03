import {validateDemoProcurementInput,validateDemoProcurementOutcome} from './inventoryDemoProcurement.js';
import {canonicalInventoryAI} from './inventoryAI.js';
async function observe(command){let timer;try{return await Promise.race([command,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No confirmed response within 35 seconds. Recover the same saved demo purchase.')),35000);})]);}finally{clearTimeout(timer);}}
export function createInventoryDemoProcurementClient({storage,context,command,isCurrent}){
 if(!context||!['uid','scope'].every(k=>typeof context[k]==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(context[k]))||typeof command!=='function'||typeof isCurrent!=='function')throw Error('A current demo purchase account context is required.');
 const key=`iilas.inventoryAI.${context.scope}.${context.uid}.demoProcurement`;let inFlight=false,active=true,epoch=0;
 const current=()=>{if(!active)throw Error('The original demo purchase view closed. Recover the saved purchase operation in the current view.');if(!isCurrent())throw Error('The active account changed. Return to the original account to recover the demo purchase.');};
 function pending(){current();const raw=storage.getItem(key);if(raw===null||raw===undefined)return null;try{return validateDemoProcurementInput(JSON.parse(raw));}catch{throw Error('Saved demo purchase needs administrator reconciliation. Keep the saved data.');}}
 async function send(input,resolve=false){
  current();if(inFlight)throw Error('A demo purchase request is already running.');
  let request=pending();
  if(input){if(request)throw Error('Recover the saved demo purchase before starting another.');request=validateDemoProcurementInput({...input,...(input.kind==='Create'?{contractVersion:2}:{}),operationId:crypto.randomUUID()});storage.setItem(key,JSON.stringify(request));if(canonicalInventoryAI(pending())!==canonicalInventoryAI(request))throw Error('The saved demo purchase could not be read back. Nothing was sent.');}
  if(!request)throw Error('No saved demo purchase to recover.');
  const startedEpoch=epoch;inFlight=true;
  try{
   const result=validateDemoProcurementOutcome(await observe(command(resolve?'resolveInventoryDemoProcurement':'submitInventoryDemoProcurement',request)),request);if(startedEpoch!==epoch)throw Error('The original demo purchase view changed. Recover its saved purchase operation.');current();
   const latest=pending();if(!latest||canonicalInventoryAI(latest)!==canonicalInventoryAI(request))throw Error('The saved demo purchase changed. Its outcome could not be confirmed.');
   storage.removeItem(key);return result;
  }finally{inFlight=false;}
 }
 return {activate:()=>{active=true;epoch++;},dispose:()=>{active=false;epoch++;},pending,start:input=>send(input),retry:()=>send(null),resolve:()=>send(null,true)};
}
