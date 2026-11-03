import {completionExact,completionIdentifier,completionUUID} from './completionWorkflow.js';
import {validateMobilePage,validateMobileShipment,MOBILE_ACTIONS} from './mobileDelivery.js';
const exact=completionExact,id=completionIdentifier,uuid=completionUUID;
const fail=()=>{throw Error('The local driver session or saved data changed. Reconnect or sign in again.');};
const states=['Queued','Sending','Awaiting confirmation','Synced','Needs review','Discarded'];
const integer=(x,min=0,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isSafeInteger(x)||x<min||x>max)fail();return x;};
const text=(x,max=240)=>{if(typeof x!=='string'||x.length>max||/[\x00-\x1f]/.test(x))fail();return x;};
const bool=x=>{if(typeof x!=='boolean')fail();return x;};
const empty=()=>({uid:null,scope:null,role:null,mode:'Signed out',verifiedAtMs:null,online:false});
function session(raw){
 const root=exact(raw,['uid','access']);if(root.uid===null){if(root.access!==null)fail();return empty();}id(root.uid);
 if(root.access===null)return {...empty(),uid:root.uid,mode:'Waiting'};
 const p=exact(root.access,['uid','scope','role','mode','verifiedAtMs','online']);if(p.uid!==root.uid||!['Driver','Recovery only','Waiting'].includes(p.mode))fail();bool(p.online);integer(p.verifiedAtMs);
 if(p.mode==='Waiting'){if(p.role!==null||p.scope!==null)fail();}
 else {id(p.scope);if(p.mode==='Driver'?p.role!=='Driver':!['Admin','Manager','Inventory','Warehouse','Logistics','Viewer'].includes(p.role))fail();}
 return p;
}
function environment(raw,expected){
 if(expected?.schema==='iilas-mobile-spark-msi-1.0'){
  const keys=['schema','mode','projectId','protocol','localOnly','apiOrigin','backendInstanceId'],p=exact(raw,keys),match=exact(expected,keys);let u;try{u=new URL(match.apiOrigin);}catch{fail();}
  if(match.mode!=='spark-msi'||match.projectId!=='fyp-inventory-and-logistics'||match.protocol!=='mobile-command-1.0'||match.localOnly!==false||u.protocol!=='https:'||u.origin!==match.apiOrigin||u.username||u.password||['localhost','127.0.0.1','[::1]'].includes(u.hostname)||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(match.backendInstanceId)||keys.some(k=>p[k]!==match[k]))fail();return p;
 }
 const p=exact(raw,['schema','projectId','protocol','localOnly']);
 const match=expected??{schema:'iilas-mobile-local-1.0',projectId:'fyp-inventory-and-logistics',protocol:'mobile-command-1.0',localOnly:true};exact(match,['schema','projectId','protocol','localOnly']);
 if(match.protocol!=='mobile-command-1.0'||(match.localOnly?match.schema!=='iilas-mobile-local-1.0'||match.projectId!=='fyp-inventory-and-logistics':match.localOnly!==false||match.schema!=='iilas-mobile-cloud-demo-1.0'||!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(match.projectId)||match.projectId==='fyp-inventory-and-logistics')||Object.keys(match).some(k=>p[k]!==match[k]))fail();return p;
}
function draft(raw){const p=exact(raw,['fileId','name','contentType','bytes']);uuid(p.fileId);text(p.name,180);integer(p.bytes,1,10485760);if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(p.contentType))fail();return p;}
function page(raw){const p=exact(raw,['items','cursor','verifiedAtMs','cached']);bool(p.cached);validateMobilePage({items:p.items,cursor:p.cursor,verifiedAtMs:p.verifiedAtMs});return p;}
function detail(raw){const p=exact(raw,['shipment','verifiedAtMs','cached','pendingProofs','queuedStatus']);validateMobileShipment(p.shipment);integer(p.verifiedAtMs);bool(p.cached);if(p.queuedStatus!==null&&!['In Transit','Attempt Failed','Delivered','Returned'].includes(p.queuedStatus))fail();if(!Array.isArray(p.pendingProofs)||p.pendingProofs.length>10)fail();for(const row of p.pendingProofs){const proof=exact(row,['evidenceId','name','operationId','state']);uuid(proof.evidenceId);uuid(proof.operationId);text(proof.name,180);if(!states.includes(proof.state))fail();}return p;}
function queue(raw){const p=exact(raw,['items','cursor','pending','needsReview','drafts']);if(!Array.isArray(p.items)||p.items.length>20||!Array.isArray(p.drafts)||p.drafts.length>10)fail();if(p.cursor!==null)integer(p.cursor,0,100000);integer(p.pending,0,2200);integer(p.needsReview,0,2200);p.drafts.forEach(draft);
 for(const rawRow of p.items){const row=exact(rawRow,['operationId','shipmentId','action','label','state','reason','createdAtMs','attempts','canRetry','canDiscard','canCheck']);uuid(row.operationId);id(row.shipmentId);text(row.label,180);if(!MOBILE_ACTIONS.includes(row.action)||!states.includes(row.state))fail();if(row.reason!==null)text(row.reason);integer(row.createdAtMs);integer(row.attempts,0,1000);bool(row.canRetry);bool(row.canDiscard);bool(row.canCheck);}return p;}
function tracking(raw){const p=exact(raw,['phase','reason','shipmentId','sessionId','lastCapturedAtMs','accuracy','sequence','leaseUntilMs']);if(!['Stopped','Starting','Tracking','Expired','Needs review'].includes(p.phase))fail();if(p.reason!==null)text(p.reason);if(p.shipmentId!==null)id(p.shipmentId);if(p.sessionId!==null)uuid(p.sessionId);for(const k of ['lastCapturedAtMs','leaseUntilMs'])if(p[k]!==null)integer(p[k]);integer(p.sequence);if(p.accuracy!==null&&(typeof p.accuracy!=='number'||!Number.isFinite(p.accuracy)||p.accuracy<0||p.accuracy>100000))fail();return p;}
function queued(raw){const p=exact(raw,['operationId','state']);uuid(p.operationId);if(p.state!=='Queued')fail();return p;}
export function createMobileClient({bridge,openWebAuth,expectedEnvironment}){
 let prepared=false,web=null,current=empty(),epoch=0,checkedEnvironment=null;
 const snapshot=()=>({...current});
 async function prepare(){if(prepared)return;if(!bridge||typeof bridge.getEnvironment!=='function')fail();checkedEnvironment=environment(await bridge.getEnvironment(),expectedEnvironment);web=await openWebAuth();if(!web||typeof web.uid!=='function'||typeof web.signInToken!=='function'||typeof web.signOut!=='function')fail();prepared=true;}
 async function signOut(){epoch++;current=empty();await Promise.allSettled([bridge?.signOut?.(),web?.signOut?.()]);return snapshot();}
 async function drift(){await signOut();fail();}
 async function refreshSession(){
  await prepare();const generation=++epoch;let next=session(await bridge.getSession({refresh:true}));if(generation!==epoch)fail();
  if(next.mode==='Signed out'||next.mode==='Waiting'){if(web.uid()!==null)await web.signOut();if(generation!==epoch)fail();current=next;return snapshot();}
  if(web.uid()!==next.uid){const token=exact(await bridge.establishWebSession(),['uid','customToken']);if(token.uid!==next.uid||typeof token.customToken!=='string'||!token.customToken||token.customToken.length>65536)return drift();if(await web.signInToken(token.customToken)!==next.uid)return drift();}
  const after=session(await bridge.getSession({refresh:false}));if(generation!==epoch||after.uid!==next.uid||web.uid()!==next.uid)return drift();next=after;current=next;return snapshot();
 }
 async function guard(recovery){await prepare();if(!['Driver',...(recovery?['Recovery only']:[])].includes(current.mode)||!current.uid)fail();const p=session(await bridge.getSession({refresh:false}));if(p.uid!==current.uid||p.scope!==current.scope||web.uid()!==current.uid)return drift();if(!['Driver',...(recovery?['Recovery only']:[])].includes(p.mode)){current=p;fail();}return {epoch,uid:current.uid};}
 async function invoke(name,input,validate,recovery=false){const original=await guard(recovery);let result;try{result=await bridge[name](input);}catch(error){await guard(recovery);throw error;}if(original.epoch!==epoch||original.uid!==current.uid)fail();await guard(recovery);return validate(result);}
 const result={
  state:snapshot,environment:()=>checkedEnvironment?{...checkedEnvironment}:null,initialize:refreshSession,refreshSession,signOut,
  async signIn(email,password){await prepare();await signOut();text(email,254);if(typeof password!=='string'||password.length<1||password.length>4096)fail();const p=exact(await bridge.signIn({email,password}),['uid']);id(p.uid);return refreshSession();},
  readAssignments:(input={})=>invoke('readAssignments',input,page),refreshAssignments:(input={})=>invoke('refreshAssignments',input,page),
  readShipment:input=>invoke('readShipment',input,detail),
  readQueue:(input={})=>invoke('readQueue',input,queue,true),
  chooseProofFile:()=>invoke('chooseProofFile',{},draft),
  enqueueStatus:input=>invoke('enqueueStatus',input,queued),
  enqueueProof:input=>invoke('enqueueProof',input,raw=>{const p=exact(raw,['prepareOperationId','finaliseOperationId','evidenceId','name','state']);for(const k of ['prepareOperationId','finaliseOperationId','evidenceId'])uuid(p[k]);text(p.name,180);if(p.state!=='Queued')fail();return p;}),
  readTracking:()=>invoke('readTracking',{},tracking,true),startTracking:input=>invoke('startTracking',input,tracking),stopTracking:()=>invoke('stopTracking',{},tracking,true),
  retry:input=>invoke('retry',input,raw=>{const p=exact(raw,['requested']);if(p.requested!==true)fail();return p;},true),
  discard:input=>invoke('discard',input,raw=>{const p=exact(raw,['discarded']);if(p.discarded!==true)fail();return p;},true),
 };
 return Object.freeze(result);
}
