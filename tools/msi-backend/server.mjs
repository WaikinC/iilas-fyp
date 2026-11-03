import http from 'node:http';
import {authenticateMsiRequest} from './authentication.mjs';
import {createAdmissionController,msiError} from './limits.mjs';
const statuses={'invalid-argument':400,unauthenticated:401,'permission-denied':403,'not-found':404,'already-exists':409,aborted:409,'failed-precondition':409,'resource-exhausted':429,unavailable:503,'deadline-exceeded':504,internal:500};
const messages={'invalid-argument':'The request is invalid.','permission-denied':'Your current account cannot perform this operation.','not-found':'The requested record is unavailable.','already-exists':'This operation conflicts with existing data.',aborted:'Data changed during this operation. Resolve the saved request.','failed-precondition':'This operation could not be completed. Keep the original saved request for recovery.',unavailable:'MSI or a required service is unavailable. Resolve the original operation later.',internal:'The operation could not be confirmed. Keep the original saved request for recovery.'};
const allowedHeaders=['authorization','content-type','x-iilas-protocol','x-iilas-backend','ngrok-skip-browser-warning'];
function route(req){
 if(req.url==='/health'&&req.method==='GET')return {kind:'health',method:'GET'};
 if(req.url==='/v1/command')return {kind:'command',method:'POST'};
 let match=/^\/v1\/evidence\/(web|mobile)\/([A-Za-z0-9_-]{1,128})\/bytes$/.exec(req.url||'');if(match)return {kind:'upload',method:'PUT',intentKind:match[1],intentId:match[2]};
 match=/^\/v1\/evidence\/([A-Za-z0-9_-]{1,128})\/bytes$/.exec(req.url||'');if(match)return {kind:'staff',method:'GET',evidenceId:match[1]};
 match=/^\/v1\/customer-proof\/([A-Za-z0-9_-]{1,128})$/.exec(req.url||'');if(match)return {kind:'customer',method:'GET',shipmentId:match[1]};return null;
}
async function jsonBody(req,signal){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')||req.headers['content-encoding'])throw msiError('invalid-argument','Use uncompressed JSON commands.');
 if(req.headers['content-length']&&Number(req.headers['content-length'])>131072)throw msiError('resource-exhausted','The command is too large.');
 const bytes=await new Promise((resolve,reject)=>{
  const chunks=[];let count=0;const clean=()=>{req.off('data',data);req.off('end',end);req.off('error',error);req.off('aborted',error);signal.removeEventListener('abort',abort);};
  const error=()=>{clean();reject(msiError('invalid-argument','The command was interrupted.'));};
  const abort=()=>{clean();req.resume();reject(msiError('deadline-exceeded','MSI could not confirm this operation in time. Resolve the original saved request.'));};
  const data=chunk=>{count+=chunk.length;if(count>131072){clean();req.resume();reject(msiError('resource-exhausted','The command is too large.'));}else chunks.push(chunk);};
  const end=()=>{clean();resolve(Buffer.concat(chunks));};req.on('data',data);req.on('end',end);req.on('error',error);req.on('aborted',error);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 });
 let value;try{value=JSON.parse(bytes.toString('utf8'));}catch{throw msiError('invalid-argument','The command JSON is invalid.');}
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||!Object.hasOwn(value,'action')||!Object.hasOwn(value,'input')||typeof value.action!=='string'||!/^[-A-Za-z0-9_]{1,80}$/.test(value.action)||!value.input||typeof value.input!=='object'||Array.isArray(value.input))throw msiError('invalid-argument','Use only the command action and input.');
 if(/parcel/i.test(value.action)||['predict','startInventoryExperiment','prepareVerification','registerVerification'].includes(value.action))throw msiError('unavailable','This legacy or paused research action is disabled.');return value;
}
export function createMsiBackend({runtime,verifyIdToken,executeCommand,evidenceRoutes,clock=Date.now,timers={set:setTimeout,clear:clearTimeout}}){
 if(!runtime||!['spark-msi','spark-loopback-test'].includes(runtime.mode)||runtime.projectId!=='fyp-inventory-and-logistics'||!Array.isArray(runtime.webOrigins)||!runtime.backendInstanceId||typeof verifyIdToken!=='function'||typeof executeCommand!=='function')throw Error('Explicit MSI server dependencies are required.');
 const admission=createAdmissionController({clock}),authRuntime={...runtime,verifyIdToken,clock};
 const server=http.createServer({maxHeaderSize:16384},async(req,res)=>{
  const cors=()=>{const origin=req.headers.origin;if(origin!==undefined){if(!runtime.webOrigins.includes(origin))throw msiError('permission-denied','This website origin is not approved.');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}};
  const send=(status,body)=>{if(res.writableEnded||res.destroyed)return;res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-IILAS-Protocol','iilas-msi-api-1.0');res.setHeader('X-IILAS-Backend',runtime.backendInstanceId);res.setHeader('Access-Control-Expose-Headers','X-IILAS-Protocol,X-IILAS-Backend,Content-Length,Content-Type,Content-Disposition');let bytes=Buffer.from(JSON.stringify(body));if(bytes.length>4194304){status=429;bytes=Buffer.from(JSON.stringify({error:{code:'resource-exhausted',message:'The MSI response is too large. Narrow the request.'}}));}res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':bytes.length});res.end(bytes);};
  let release=()=>{},timer;const controller=new AbortController();
  try{
   admission.admitPeer(req.socket.remoteAddress||'unknown');cors();
   const match=route(req);if(!match)throw msiError('not-found','The API route is unavailable.');
   res.setHeader('Access-Control-Expose-Headers','X-IILAS-Protocol,X-IILAS-Backend,Content-Length,Content-Type,Content-Disposition');
   for(const name of ['authorization','origin','x-iilas-protocol','x-iilas-backend'])if(req.rawHeaders.filter((_,i)=>i%2===0).filter(k=>k.toLowerCase()===name).length>1)throw msiError('invalid-argument','Duplicate authority headers are not accepted.');
   if(req.method==='OPTIONS'){
    const wanted=(req.headers['access-control-request-headers']||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    if(!req.headers.origin||req.headers['access-control-request-method']!==match.method||wanted.some(h=>!allowedHeaders.includes(h)))throw msiError('permission-denied','This API preflight is not approved.');
    res.writeHead(204,{'Access-Control-Allow-Methods':match.method,'Access-Control-Allow-Headers':allowedHeaders.join(', '),'Cache-Control':'no-store'});res.end();return;
   }
   if(req.method!==match.method)throw msiError('not-found','The API method is unavailable.');
   if(match.kind==='health'){send(200,{ready:true});return;}
   release=admission.acquire();timer=timers.set(()=>{controller.abort();send(504,{error:{code:'deadline-exceeded',message:'MSI could not confirm this operation in time. Resolve the original saved request.'}});},60000);
   const auth=await authenticateMsiRequest(req,authRuntime);if(controller.signal.aborted)return;admission.admitUid(auth.uid);
   if(match.kind==='command'){const body=await jsonBody(req,controller.signal);if(controller.signal.aborted)return;let result;try{result=await executeCommand(auth,body);}catch(error){if(error instanceof Error&&error.code===undefined&&error.httpStatus===undefined)throw Object.assign(msiError('failed-precondition',messages['failed-precondition']),{stockRequestNotApplied:error.stockRequestNotApplied===true});throw error;}send(200,{data:result});}
   else{if(!evidenceRoutes)throw msiError('unavailable','The evidence service is not ready.');await evidenceRoutes({req,res,auth,route:match,signal:controller.signal,send});}
  }catch(error){const httpCodes={400:'invalid-argument',401:'unauthenticated',403:'permission-denied',404:'not-found',409:'failed-precondition',413:'resource-exhausted',429:'resource-exhausted',503:'unavailable',504:'deadline-exceeded'};const code=Object.hasOwn(statuses,error?.code)?error.code:httpCodes[error?.httpStatus]||'internal';send(statuses[code],{error:{code,message:error.publicMessage||messages[code]||'Sign in again before recovery.',...(error?.stockRequestNotApplied===true?{details:{stockRequestNotApplied:true}}:{})}});}
  finally{if(timer!==undefined)timers.clear(timer);release();}
 });
 server.requestTimeout=60000;server.headersTimeout=15000;server.keepAliveTimeout=5000;server.maxHeadersCount=32;server.maxConnections=32;return server;
}
