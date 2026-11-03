import {createInventoryAIClient} from './inventoryAIClient.js';
import {createInventoryContextAIClient} from './inventoryContextAIClient.js';
import {validateDemoProductInput,verifyDemoProductSource} from './inventoryContextAI.js';
import {canonicalInventoryAI} from './inventoryAI.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function observe(command){
 let timer;
 try{return await Promise.race([command,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No confirmed response within 35 seconds. Recover the same saved stock experiment.')),35000);})]);}
 finally{clearTimeout(timer);}
}
export function createInventoryStockAIClient(options){
 const {storage,context,command,isCurrent}=options;
 const legacy=createInventoryAIClient(options),manual=createInventoryContextAIClient(options);
 const key=`iilas.inventoryAI.${context.scope}.${context.uid}.demoProductExperiment`;let inFlight=false;
 const current=()=>{if(!isCurrent())throw Error('The active account changed. Return to the original account to recover this request.');};
 function demoPending(){
  current();const raw=storage.getItem(key);if(!raw)return null;
  try{return validateDemoProductInput(JSON.parse(raw));}catch{throw Error('Saved stock experiment needs administrator reconciliation. Keep the saved data.');}
 }
 function pending(){
  current();return [{kind:'legacy',input:legacy.pending()},{kind:'context',input:manual.pending()},{kind:'demo-product',input:demoPending()}].filter(item=>item.input);
 }
 async function guarded(work){
  current();if(inFlight)throw Error('A stock experiment request is already running.');
  inFlight=true;try{return await work();}finally{inFlight=false;}
 }
 function noPending(){if(pending().length)throw Error('Recover the saved stock experiment before starting a new one.');}
 async function sendDemo(input,resolve=false){
  const result=await observe(command(resolve?'resolveInventoryDemoProductExperiment':'startInventoryDemoProductExperiment',input));current();
  if(!result||Object.keys(result).sort().join(',')!=='experimentId,operationId,replayed,state'||result.operationId!==input.operationId||typeof result.replayed!=='boolean'||!['Predicted','Unavailable','Pending','Cancelled'].includes(result.state)||(['Predicted','Unavailable'].includes(result.state)?typeof result.experimentId!=='string'||!UUID.test(result.experimentId):result.experimentId!==null))throw Error('The outcome could not be confirmed. Recover the same saved stock experiment.');
  if(result.state!=='Pending'){
   const latest=demoPending();if(!latest||canonicalInventoryAI(latest)!==canonicalInventoryAI(input))throw Error('The saved request changed. Its outcome could not be confirmed.');
   storage.removeItem(key);
  }
  return result;
 }
 async function recover(kind,resolve){
  return guarded(async()=>{
   const first=pending()[0];if(!first||first.kind!==kind)throw Error('Recover the first saved experiment through its original source.');
   if(kind==='legacy')return resolve?legacy.resolve():legacy.retry();
   if(kind==='context')return resolve?manual.resolve():manual.retry();
   return sendDemo(first.input,resolve);
  });
 }
 return {
  pending,
  async preview(productId){
   current();if(typeof productId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(productId))throw Error('Choose a valid demo product.');
   const source=await verifyDemoProductSource(await command('getInventoryDemoProductContext',{productId}));current();
   if(source.productId!==productId)throw Error('The product preview could not be verified.');return source;
  },
  startContext:scenario=>guarded(async()=>{noPending();return manual.start(scenario);}),
  startDemo:input=>guarded(async()=>{noPending();const request=validateDemoProductInput({operationId:crypto.randomUUID(),...input});storage.setItem(key,JSON.stringify(request));return sendDemo(request);}),
  retry:kind=>recover(kind,false),resolve:kind=>recover(kind,true),
 };
}
