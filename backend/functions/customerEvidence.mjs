import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {evidenceFile} from './evidenceProvider.mjs';
import {createHash} from 'node:crypto';
import {assertCompletionLocal} from './completionOperations.mjs';
import {completionIdentifier} from './completionWorkflow.js';
import {runCustomerTransaction,customerGrantId,customerProof} from './customerAccess.mjs';
import {trustedDemoEnvironment} from './demoEnvironment.mjs';
import {LOCAL_DEMO_ENVIRONMENT,validateDemoEnvironment} from './demoEnvironment.js';
const cap=10*1024*1024,ref=(kind,id)=>getFirestore().collection(kind).doc(id),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const error=(status,message)=>Object.assign(Error(message),{httpStatus:status});
export function customerEvidenceOrigin(origin,profile){
 const checked=validateDemoEnvironment(profile,[profile]);if(origin===undefined&&checked.mode==='cloud-demo')return null;
 if(!checked.webOrigins.includes(origin))throw error(403,'Use the configured IILAS site to request a proof.');return origin;
}
function inputFor(query){if(!query||typeof query!=='object'||Array.isArray(query)||Object.keys(query).length!==2||!Object.hasOwn(query,'shipmentId')||!Object.hasOwn(query,'evidenceId'))throw error(400,'Select the current shipment proof.');try{completionIdentifier(query.shipmentId);completionIdentifier(query.evidenceId);}catch{throw error(400,'Select the current shipment proof.');}return {shipmentId:query.shipmentId,evidenceId:query.evidenceId};}
async function boundedRequest(req,res,work){
 const controller=new AbortController(),signal=controller.signal,timer=setTimeout(()=>controller.abort(error(504,'Proof download exceeded 15 seconds. Refresh the shipment and try again.')),15000);
 const disconnected=()=>{if(!res.writableEnded)controller.abort(error(499,'Download closed.'));};req.on?.('aborted',disconnected);res.on?.('close',disconnected);
 let rejectAbort;const aborted=new Promise((_,reject)=>{rejectAbort=reject;});const onAbort=()=>rejectAbort(signal.reason);signal.addEventListener('abort',onAbort,{once:true});
 try{return await Promise.race([Promise.resolve().then(()=>work(signal)),aborted]);}finally{clearTimeout(timer);signal.removeEventListener('abort',onAbort);req.removeListener?.('aborted',disconnected);res.removeListener?.('close',disconnected);}
}
async function readProof(file,signal){
 signal.throwIfAborted();const stream=file.createReadStream(),chunks=[];let count=0;
 const abort=()=>stream.destroy(signal.reason);signal.addEventListener('abort',abort,{once:true});
 try{for await(const chunk of stream){signal.throwIfAborted();count+=chunk.length;if(count>cap)throw error(413,'Proof exceeds the 10 MiB download limit.');chunks.push(Buffer.from(chunk));}signal.throwIfAborted();return Buffer.concat(chunks,count);}
 finally{signal.removeEventListener('abort',abort);stream.destroy();}
}
export function createCustomerEvidence({identity=uid=>getAuth().getUser(uid),verifyToken=(token,revoked)=>getAuth().verifyIdToken(token,revoked),fileFor=evidenceFile}={}){
 async function authoriseCustomerEvidence(auth,value){
  const input=inputFor(value);return runCustomerTransaction(auth,async(tx,scope,profile)=>{
   const [grant,shipment,delivery,evidence]=await Promise.all([tx.get(ref('customerShipmentGrants',customerGrantId(scope,auth.uid,input.shipmentId))),tx.get(ref('shipments',input.shipmentId)),tx.get(ref('deliveries',input.shipmentId)),tx.get(ref('evidence',input.evidenceId))]);
   const g=grant.data(),s=shipment.data(),d=delivery.data(),e=evidence.data();
   if(!g||g.ownerId!==scope||g.customerUid!==auth.uid||g.shipmentId!==input.shipmentId||g.active!==true||!Number.isSafeInteger(g.version)||g.version<1)throw error(403,'Shipment proof access is unavailable.');
   if(!s||s.ownerId!==scope||s.status!=='Dispatched')throw error(404,'The current delivery proof is unavailable.');
   const proof=customerProof({scope,shipmentId:input.shipmentId,delivery:d,evidenceId:input.evidenceId,evidence:e});if(!proof)throw error(404,'The current delivery proof is unavailable.');
   const binding=sha(JSON.stringify([scope,auth.uid,proof,e.path,e.sha256,e.version??null,g.version,profile.version??null,s.version??null,d.version??null]));
   return {proof,path:e.path,sha256:e.sha256,binding};
  },identity);
 }
 async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Vary','Origin');res.setHeader('X-Content-Type-Options','nosniff');
  try{
   assertCompletionLocal();const profile=process.env.IILAS_DEMO_MODE==='cloud-demo'?trustedDemoEnvironment():LOCAL_DEMO_ENVIRONMENT,origin=customerEvidenceOrigin(req.get?.('origin')??req.headers?.origin,profile);if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
   if(!['GET','OPTIONS'].includes(req.method)){res.setHeader('Allow','GET, OPTIONS');throw error(405,'Only proof downloads are accepted.');}
   if(req.method==='OPTIONS'){
    if(!origin)throw error(403,'A proof preflight needs an approved origin.');
    const method=req.get?.('access-control-request-method')??req.headers?.['access-control-request-method'],headers=String(req.get?.('access-control-request-headers')??req.headers?.['access-control-request-headers']??'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    if(method!=='GET'||headers.some(h=>h!=='authorization'))throw error(403,'Unsupported local download preflight.');res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization');res.setHeader('Access-Control-Max-Age','0');res.status(204).end();return;
   }
   const input=inputFor(req.query),authorization=req.get?.('authorization')??req.headers?.authorization;
   if(typeof authorization!=='string'||!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(authorization))throw error(401,'Sign in again to download this proof.');
   const payload=await boundedRequest(req,res,async signal=>{
    let auth;try{auth=await verifyToken(authorization.slice(7),true);completionIdentifier(auth?.uid);}catch{throw error(401,'Sign in again to download this proof.');}signal.throwIfAborted();
    const original=await authoriseCustomerEvidence(auth,input);signal.throwIfAborted();
    const file=fileFor(original.path);let metadata;try{[metadata]=await file.getMetadata();}catch{throw error(503,'The registered proof file is unavailable.');}signal.throwIfAborted();
    const size=Number(metadata.size);if(!Number.isSafeInteger(size)||size<1||size>cap)throw error(413,'Proof exceeds the 10 MiB download limit.');
    if(size!==original.proof.bytes||metadata.contentType!==original.proof.contentType)throw error(409,'The registered proof metadata changed. Refresh the shipment.');
    let bytes;try{bytes=await readProof(file,signal);}catch(e){if(e.httpStatus)throw e;throw error(503,'The registered proof file could not be read.');}signal.throwIfAborted();
    if(bytes.length!==original.proof.bytes||sha(bytes)!==original.sha256)throw error(409,'The registered proof bytes changed. Refresh the shipment.');
    const current=await authoriseCustomerEvidence(auth,input);signal.throwIfAborted();if(current.binding!==original.binding)throw error(409,'Shipment proof access changed. Refresh the shipment.');return {bytes,proof:current.proof};
   });
   if(req.aborted||res.destroyed)return;
   const ascii=payload.proof.fileName.replace(/[^\x20-\x7e]|["\\]/g,'_');
   res.setHeader('Content-Type',payload.proof.contentType);res.setHeader('Content-Length',String(payload.bytes.length));res.setHeader('Content-Disposition',`attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(payload.proof.fileName)}`);res.status(200).end(payload.bytes);
  }catch(e){
   if(req.aborted||res.destroyed||res.writableEnded)return;
   const status=e.httpStatus??(e.code==='permission-denied'?403:e.code==='not-found'?404:e.code==='unavailable'?503:503);
   const message=e.httpStatus?e.message:status===403?'Shipment proof access is unavailable.':'The local proof service is unavailable. Refresh the shipment.';
   res.status(status).json({error:message});
  }
 }
 return {authoriseCustomerEvidence,handler};
}
const defaults=createCustomerEvidence();
export const authoriseCustomerEvidence=(...args)=>defaults.authoriseCustomerEvidence(...args);
export const customerEvidenceHandler=(...args)=>defaults.handler(...args);
