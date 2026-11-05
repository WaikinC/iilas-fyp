import {sparkRecoveryKey} from './sparkRuntime.js';
const fail=message=>{throw Error(message);};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
export function createEvidenceTransport({profile,auth,command,transport,storage,legacy}){
 const spark=['spark-msi','spark-loopback-test'].includes(profile?.mode);if(!spark&&!['local-emulator','cloud-demo'].includes(profile?.mode))fail('The configured evidence service is unavailable.');
 const owner=c=>{if(!c.member?.uid||auth?.currentUser?.uid!==c.member.uid||!c.isCurrent())fail('Your account or shipment view changed. Keep pending proof work for its original account.');};
 const storageKey=c=>sparkRecoveryKey(profile,c.member.uid,`proof.${c.member.workspaceId}.${c.shipment.id}.${c.declaration.stage}`);
 function pending(c){owner(c);if(!spark)return null;const raw=storage.getItem(storageKey(c));if(!raw)return null;let p;try{p=JSON.parse(raw);}catch{fail('Saved proof work needs reconciliation. Do not clear browser storage.');}if(p.schema!=='iilas-msi-web-proof-1.0'||p.actor!==c.member.uid||p.scope!==c.member.workspaceId||p.shipmentId!==c.shipment.id||p.apiOrigin!==profile.apiOrigin)fail('Saved proof work belongs to a different account or backend.');return p;}
 async function register(c,p){owner(c);if(!p.prepared)fail('Select the same proof file to finish its original upload.');const result=await command('registerEvidence',{id:p.id,shipmentId:p.shipmentId,path:p.prepared.path,name:p.name,...p.declaration,intentId:p.prepared.intentId});owner(c);storage.removeItem(storageKey(c));return result;}
 return {pending,async recover(c){const p=pending(c);if(!p)fail('There is no saved proof operation.');const result=await command('reconcileEvidenceUpload',{operationId:p.operationId,shipmentId:p.shipmentId,evidenceId:p.id,...(p.prepared?{intentId:p.prepared.intentId}:{})});owner(c);const current=pending(c);if(!current||current.operationId!==p.operationId||current.id!==p.id)fail('The saved proof changed; keep its original operation.');if(result?.state==='Cancelled'){storage.removeItem(storageKey(c));return {state:'Cancelled'};}if(result?.state==='Registered'){if(result.result?.id!==p.id||result.result.sha256!==p.sha256)fail('The recorded proof does not match its saved operation.');storage.removeItem(storageKey(c));return result.result;}if(!['Prepared','Uploaded'].includes(result?.state)||!result.prepared)fail('Proof reconciliation could not be confirmed.');p.prepared=result.prepared;storage.setItem(storageKey(c),JSON.stringify(p));if(result.state==='Prepared')fail('Select the same proof file to finish its original upload.');return register(c,p);},
 async download(record,signal){
  signal?.throwIfAborted();
  const blob=await (spark?transport.download(record.id,signal):legacy.download(record.path));
  signal?.throwIfAborted();
  return blob;
 },
 async uploadAndRegister(c){
  owner(c);const file=c.file;if(!file||file.size<1||file.size>10485760)fail('Choose a proof file no larger than10MiB.');
  if(!spark){const id=crypto.randomUUID(),path=`evidence/${c.member.workspaceId}/${c.shipment.id}/${id}`;await legacy.upload(path,file,{actor:c.member.uid,stage:c.declaration.stage,evidenceType:c.declaration.type,captureSource:c.declaration.captureSource,capturedAtClient:c.declaration.capturedAtClient??''});owner(c);return command('registerEvidence',{id,shipmentId:c.shipment.id,path,name:file.name,...c.declaration});}
  const sha256=await hash(await file.arrayBuffer());owner(c);let p=pending(c);if(p){if(p.sha256!==sha256||p.bytes!==file.size||p.contentType!==file.type||p.name!==file.name||JSON.stringify(p.declaration)!==JSON.stringify(c.declaration))fail('A different proof operation is pending. Recover it before selecting another file.');}
  else{p={schema:'iilas-msi-web-proof-1.0',actor:c.member.uid,scope:c.member.workspaceId,shipmentId:c.shipment.id,expectedVersion:c.shipment.version,apiOrigin:profile.apiOrigin,operationId:crypto.randomUUID(),id:crypto.randomUUID(),name:file.name,bytes:file.size,contentType:file.type,sha256,declaration:c.declaration,prepared:null};storage.setItem(storageKey(c),JSON.stringify(p));}
  if(!p.prepared){p.prepared=await command('prepareEvidenceUpload',{operationId:p.operationId,shipmentId:p.shipmentId,expectedVersion:p.expectedVersion,evidenceId:p.id,stage:p.declaration.stage,evidenceType:p.declaration.type,contentType:p.contentType,bytes:p.bytes,sha256:p.sha256,captureSource:p.declaration.captureSource,capturedAtClient:p.declaration.capturedAtClient});owner(c);storage.setItem(storageKey(c),JSON.stringify(p));}
  await transport.upload('web',p.prepared.intentId,file);owner(c);return register(c,p);
 }};
}
