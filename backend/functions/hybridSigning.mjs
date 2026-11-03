import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {completionCanonical,completionExact} from './completionWorkflow.js';
import {validateHybridReply} from './hybridGateway.js';
const fail=()=>{throw Error('The signed MSI operation is invalid or unavailable.');};
export const hybridHash=value=>createHash('sha256').update(value).digest('hex');
export function assertHybridSecret(secret){if(typeof secret!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(secret)||Buffer.from(secret,'base64url').length!==32||Buffer.from(secret,'base64url').toString('base64url')!==secret)fail();return Buffer.from(secret,'base64url');}
function sign(secret,domain,value){return createHmac('sha256',assertHybridSecret(secret)).update(domain+'\n'+completionCanonical(value)).digest('hex');}
export function checkHybridSignature(actual,expected){if(typeof actual!=='string'||!/^[a-f0-9]{64}$/.test(actual)||!timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex')))fail();}
export const signHybridRequest=(secret,q)=>sign(secret,'iilas-msi-request-1.0',q);
export const signHybridReply=(secret,reply)=>({reply,signature:sign(secret,'iilas-msi-response-1.0',reply)});
export function verifyHybridReply(secret,signed,request){const s=completionExact(signed,['reply','signature']);checkHybridSignature(s.signature,sign(secret,'iilas-msi-response-1.0',s.reply));const r=validateHybridReply(s.reply,request);if(hybridHash(r.resultJson)!==r.resultSha256)fail();return r;}
