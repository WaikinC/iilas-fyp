import{assertBusinessCodeKind}from'./businessCodes.js';
import{validateRecordCreationInput,validateRecordCreationOutcome,recordCreationCanonical}from'./recordCreation.js';
async function observe(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No confirmed response within 35 seconds. Check the saved creation before retrying.')),35000);})]);}finally{clearTimeout(timer);}}
export function createRecordCreationClient({storage,context,command,isCurrent}){
 if(!context||!['uid','scope','environmentKey'].every(k=>typeof context[k]==='string'&&context[k].length>0&&context[k].length<=256)||typeof command!=='function'||typeof isCurrent!=='function')throw Error('A current approved creation context is required.');
 let active=true,epoch=0;const inflight=new Set();
 const current=()=>{if(!active||!isCurrent())throw Error('The original creation account or view changed. Recover saved work with its original account.');};
 const key=kind=>{assertBusinessCodeKind(kind);return 'iilas.recordCreation.'+JSON.stringify([context.environmentKey,context.scope,context.uid,kind]);};
 function pending(kind){current();const raw=storage.getItem(key(kind));if(raw===null||raw===undefined)return null;try{const value=validateRecordCreationInput(JSON.parse(raw));if(value.kind!==kind)throw Error();return value;}catch{throw Error('Saved creation needs reconciliation. Keep the saved data.');}}
 async function send(kind,data,intent){
  current();assertBusinessCodeKind(kind);if(inflight.has(kind))throw Error('A creation request is already running.');let request=pending(kind);
  if(data!==undefined){if(request)throw Error('Recover the saved creation before starting another.');request=validateRecordCreationInput({operationId:crypto.randomUUID(),kind,data});const body=JSON.stringify({action:'createBusinessRecord',input:request});if(new TextEncoder().encode(body).length>126000)throw Error('This record is too large to send. Reduce the product image size before saving.');storage.setItem(key(kind),JSON.stringify(request));const read=pending(kind);if(!read||recordCreationCanonical(read)!==recordCreationCanonical(request))throw Error('Saved creation could not be read back. Nothing was sent.');}
  if(!request)throw Error('No saved creation to recover.');const started=epoch;inflight.add(kind);
  try{const result=validateRecordCreationOutcome(await observe(command(intent?'resolveBusinessRecordCreation':'createBusinessRecord',intent?{creation:request,intent}:request)),request);if(started!==epoch)throw Error('The original creation view changed. Recover the saved request.');current();const latest=pending(kind);if(!latest||recordCreationCanonical(latest)!==recordCreationCanonical(request))throw Error('The saved creation changed. Retain it for reconciliation.');if(result.state!=='NotFound')storage.removeItem(key(kind));return result;}finally{inflight.delete(kind);}
 }
 return{activate(){active=true;epoch++;},dispose(){active=false;epoch++;},pending,start:({kind,data})=>send(kind,data),retry:kind=>send(kind),check:kind=>send(kind,undefined,'Check'),cancel:kind=>send(kind,undefined,'Cancel')};
}
