import {validateExperimentInput,validateScenario,canonicalInventoryAI} from './inventoryAI.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function observe(command){
 let timer;
 try{return await Promise.race([command,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No confirmed response within 35 seconds. The request may still be processing. Check the saved experiment outcome or retry the same saved experiment.')),35000);})]);}
 finally{clearTimeout(timer);}
}
export function createInventoryAIClient({storage,context,command,isCurrent}){
 if(!context||!['uid','scope'].every(k=>typeof context[k]==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(context[k]))||typeof isCurrent!=='function'||typeof command!=='function')throw Error('A current stock account context is required.');
 const key=`iilas.inventoryAI.${context.scope}.${context.uid}.experiment`;let inFlight=false;
 const current=()=>{if(!isCurrent())throw Error('The active account changed. Return to the original account to recover this request.');};
 function pending(){current();const raw=storage.getItem(key);if(!raw)return null;try{return validateExperimentInput(JSON.parse(raw));}catch{throw Error('Saved stock experiment needs administrator reconciliation. Keep the saved data.');}}
 async function send(scenario,resolve=false){
  current();if(inFlight)throw Error('A stock experiment request is already running.');
  const old=pending();let request=old;
  if(!request){if(!scenario)throw Error('No saved stock experiment to recover.');request=validateExperimentInput({operationId:crypto.randomUUID(),scenario:validateScenario(scenario)});storage.setItem(key,JSON.stringify(request));}
  else if(scenario&&canonicalInventoryAI(validateScenario(scenario))!==canonicalInventoryAI(request.scenario))throw Error('Recover the saved scenario before entering a different one.');
  inFlight=true;
  try{
   // The observation deadline does not cancel server work. A late reply only
   // settles the losing race promise and cannot clear or replace saved intent.
   const result=await observe(command(resolve?'resolveInventoryExperiment':'startInventoryExperiment',request));current();
   if(!result||Object.keys(result).sort().join(',')!=='experimentId,operationId,replayed,state'||result.operationId!==request.operationId||typeof result.replayed!=='boolean'||!['Predicted','Unavailable','Pending','Cancelled'].includes(result.state)||(['Predicted','Unavailable'].includes(result.state)?typeof result.experimentId!=='string'||!UUID.test(result.experimentId):result.experimentId!==null))throw Error('The outcome could not be confirmed. Recover the same saved stock experiment.');
   if(result.state!=='Pending'){
    // Do not erase a request replaced by another tab or a newer account context.
    const latest=pending();if(!latest||canonicalInventoryAI(latest)!==canonicalInventoryAI(request))throw Error('The saved request changed. Its outcome could not be confirmed.');
    storage.removeItem(key);
   }
   return result;
  }finally{inFlight=false;}
 }
 return {pending,start:scenario=>send(scenario),retry:()=>send(null),resolve:()=>send(null,true)};
}
