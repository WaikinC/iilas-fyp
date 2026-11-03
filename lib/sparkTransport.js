import {validateSparkProfile,validateSparkLoopbackTest} from './sparkRuntime.js';
const fail=(message='MSI could not confirm this operation. Keep and resolve the original saved request.',code='unavailable',details)=>{throw Object.assign(Error(message),{code:'functions/'+code,...(details?{details}:{})});};
async function bounded(response,cap,current){
 const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>cap))fail();const reader=response.body?.getReader();if(!reader)fail();let total=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();current();if(done)break;total+=value.length;if(total>cap)fail();chunks.push(value);}const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function createSparkTransport({profile,auth,fetch:fetcher=globalThis.fetch}){
 const checked=profile?.mode==='spark-msi'?validateSparkProfile(profile,[profile]):validateSparkLoopbackTest(profile);
 async function request(path,{method='GET',body,contentType,signal,binary=false}={}){
  const user=auth?.currentUser,uid=user?.uid;const current=()=>{if(!uid||auth?.currentUser?.uid!==uid)fail('Your account changed. Keep pending work for its original account.','unauthenticated');signal?.throwIfAborted();};current();
  const token=await user.getIdToken(true);current();if(typeof token!=='string'||!token||token.length>16384)fail('Sign in again before recovery.','unauthenticated');
  let response;try{response=await fetcher(checked.apiOrigin+path,{method,headers:{Authorization:'Bearer '+token,'X-IILAS-Protocol':'iilas-msi-api-1.0','X-IILAS-Backend':checked.backendInstanceId,'ngrok-skip-browser-warning':'1',...(contentType?{'Content-Type':contentType}:{})},body,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000),credentials:'omit',cache:'no-store',redirect:'error'});}catch{fail();}current();
  if(response.redirected||response.headers.get('x-iilas-protocol')!=='iilas-msi-api-1.0'||response.headers.get('x-iilas-backend')!==checked.backendInstanceId)fail('The MSI endpoint did not return the expected protocol. Keep pending work.');
  const type=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if(binary&&response.ok){if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(type))fail();const bytes=await bounded(response,10485760,current);return new Blob([bytes],{type});}
  if(type!=='application/json')fail('The MSI endpoint returned an unavailable or unexpected page.');let value;try{value=JSON.parse(new TextDecoder().decode(await bounded(response,4194304,current)));}catch{fail();}
  if(!response.ok){const error=value?.error;if(!error||typeof error.code!=='string'||!/^[-a-z]{1,40}$/.test(error.code))fail();fail(typeof error.message==='string'&&error.message.length<=500?error.message:undefined,error.code,error.details?.stockRequestNotApplied===true?{stockRequestNotApplied:true}:undefined);}
  if(!value||Object.keys(value).length!==1||!Object.hasOwn(value,'data'))fail();return value.data;
 }
 const id=v=>{if(typeof v!=='string'||!/^[-A-Za-z0-9_]{1,128}$/.test(v))fail('The proof identifier is invalid.','invalid-argument');return v;};
 return {async command(action,input){const body=JSON.stringify({action,input});if(new TextEncoder().encode(body).length>131072)fail('The command is too large.','resource-exhausted');return request('/v1/command',{method:'POST',body,contentType:'application/json'});},async upload(kind,intentId,blob){if(!['web','mobile'].includes(kind)||!(blob instanceof Blob)||blob.size<1||blob.size>10485760)fail('The proof upload is invalid.','invalid-argument');return request(`/v1/evidence/${kind}/${id(intentId)}/bytes`,{method:'PUT',body:blob,contentType:blob.type});},download:evidenceId=>request(`/v1/evidence/${id(evidenceId)}/bytes`,{binary:true}),customerProof:(shipmentId,signal)=>request(`/v1/customer-proof/${id(shipmentId)}`,{binary:true,signal})};
}
