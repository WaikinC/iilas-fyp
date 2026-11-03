import {msiError} from './limits.mjs';
export async function authenticateMsiRequest(req,runtime){
 if(req.headers['x-iilas-protocol']!=='iilas-msi-api-1.0'||req.headers['x-iilas-backend']!==runtime.backendInstanceId)throw msiError('failed-precondition','The configured MSI backend changed. Keep pending work for explicit recovery.');
 const value=req.headers.authorization;if(typeof value!=='string'||!/^Bearer [A-Za-z0-9._~-]{1,8192}$/.test(value))throw msiError('unauthenticated','Sign in again before resolving the original operation.');
 try{
  const token=await runtime.verifyIdToken(value.slice(7),true),now=(runtime.clock||Date.now)();
  if(!token||typeof token.uid!=='string'||!/^[-A-Za-z0-9_]{1,128}$/.test(token.uid)||token.sub!==token.uid||token.aud!==runtime.projectId||token.iss!==`https://securetoken.google.com/${runtime.projectId}`||!Number.isFinite(token.exp)||token.exp*1000<=now)throw Error('Invalid identity');
  return {uid:token.uid,token};
 }catch{throw msiError('unauthenticated','The Firebase session is expired, revoked or unavailable. Sign in before recovery.');}
}
