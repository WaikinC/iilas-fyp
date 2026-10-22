import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {createHash,randomUUID} from 'node:crypto';
import {approvedTransaction,ROLES} from './access.mjs';
import {parcelAcceptance} from './parcelAcceptance.mjs';
import {requireParcelAcceptance,validateParcelResponse} from './parcelResponse.mjs';
import {validateStartParcelAnalysis,validateResolveParcelAnalysis,validateParcelAnalysisReview,canStartParcelAnalysis,createRunningParcelAnalysis,finishParcelAnalysis,toPublicParcelAnalysis,matchesParcelAnalysisClaim,reviewParcelAnalysis as applyReview} from './parcelAnalysis.js';

const db=()=>getFirestore();
const ref=(kind,id)=>db().collection(kind).doc(id);
const hash=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>hash(JSON.stringify(value));
// Firestore map ordering is not an identity boundary. Arrays retain order.
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const fail=(message='Parcel analysis could not be completed.',code='failed-precondition')=>{const error=new Error(message);error.code=code;error.parcelSafe=true;throw error;};
const problem=reasonCode=>{const error=new Error('Parcel analysis resource failed.');error.reasonCode=reasonCode;return error;};
const scoped=(snapshot,scope)=>{const value=snapshot.data();if(!snapshot.exists||value.ownerId!==scope)fail('Parcel analysis record was not found.','not-found');return value;};
const busy=analysisId=>({state:'Busy',analysisId,reasonCode:'evidence-busy'});
const requestKey=(scope,actor,operationId)=>digest([scope,actor,operationId]);
const lockKey=(scope,evidenceId)=>digest([scope,evidenceId]);
// Copy selected, validated fields into a canonical descriptor. Remote flags,
// environment variables and callers cannot supply operational acceptance.
function acceptedModel(){
  try{
    const pin=requireParcelAcceptance(parcelAcceptance);
    return {model:pin.model,modelVersion:pin.modelVersion,selectionSha256:pin.selectionSha256,evaluationSha256:pin.evaluationSha256,acceptanceSha256:pin.acceptanceSha256,preprocessing:pin.preprocessing,contrast:pin.contrast,classOrder:['Normal','Damaged']};
  }catch{return null;}
}
function contextSnapshot(config,account,evidence,shipment,plan){
  return {
    config:{dataScopeId:config.dataScopeId,version:config.version??null},
    account:{version:account.version??null,role:account.role,status:account.status,active:account.active},
    evidence:{ownerId:evidence.ownerId,shipmentId:evidence.shipmentId,version:evidence.version,sha256:evidence.sha256,path:evidence.path,bytes:evidence.bytes,contentType:evidence.contentType,type:evidence.type,integrityVersion:evidence.integrityVersion,stage:evidence.stage,captureSource:evidence.captureSource,capturedAtClient:evidence.capturedAtClient??null,shipmentVersionAtRegistration:evidence.shipmentVersionAtRegistration??null},
    shipment:{ownerId:shipment.ownerId,version:shipment.version,status:shipment.status},
    plan:plan?{ownerId:plan.ownerId,version:plan.version,driverUid:plan.driverUid??null}:null,
  };
}
function eligible(scope,actor,account,evidence,shipment,plan){
  return (!plan||plan.ownerId===scope)&&canStartParcelAnalysis({account,scopeId:scope,ownerId:evidence.ownerId,actorUid:actor,role:account.role,type:evidence.type,integrityVersion:evidence.integrityVersion,stage:evidence.stage,shipmentStatus:shipment.status,assignedDriverUid:plan?.driverUid});
}
async function context(tx,scope,evidenceId){
  const evidence=scoped(await tx.get(ref('evidence',evidenceId)),scope);
  const shipment=scoped(await tx.get(ref('shipments',evidence.shipmentId)),scope);
  const plan=(await tx.get(ref('transportPlans',evidence.shipmentId))).data()??null;
  return {evidence,shipment,plan};
}
function validImage(evidence,scope,evidenceId){
  return evidence.path===`evidence/${scope}/${evidence.shipmentId}/${evidenceId}`&&Number.isSafeInteger(evidence.bytes)&&evidence.bytes>0&&evidence.bytes<=10*1024*1024&&['image/jpeg','image/png','image/webp'].includes(evidence.contentType)&&/^[a-f0-9]{64}$/.test(evidence.sha256);
}
async function scopedTransaction(auth,scope,roles,work){
  try{return await approvedTransaction(auth,roles,async(tx,config,account)=>{
      if(config.dataScopeId!==scope)fail('Your account cannot access this parcel analysis.','permission-denied');
      return work(tx,config,account);
    });
  }catch(error){
    if(error.parcelSafe)throw error;
    if(error.code==='permission-denied')fail('Your account is not approved for this parcel operation.','permission-denied');
    fail('Parcel analysis could not be saved. Check the saved outcome before trying again.','unavailable');
  }
}
async function claim(auth,scope,input){
  return scopedTransaction(auth,scope,ROLES,async(tx,config,account)=>{
    const receiptKey=requestKey(scope,auth.uid,input.operationId),receiptRef=ref('parcelAnalysisRequests',receiptKey),old=(await tx.get(receiptRef)).data();
    const commandHash=digest(input);
    if(old){
      if(old.ownerId!==scope||old.actorUid!==auth.uid||old.operationId!==input.operationId||old.commandHash!==commandHash||old.evidenceId!==input.evidenceId)fail('This operation ID belongs to a different parcel request.');
      if(old.state==='Blocked')return {result:busy(old.analysisId)};
      const record=scoped(await tx.get(ref('parcelAnalyses',old.analysisId)),scope);
      return {result:await savedOutcome(tx,record)};
    }
    const {evidence,shipment,plan}=await context(tx,scope,input.evidenceId);
    if(!eligible(scope,auth.uid,account,evidence,shipment,plan))fail('Current evidence stage, shipment status or assignment does not permit a new parcel analysis.','permission-denied');
    if(!validImage(evidence,scope,input.evidenceId))fail('Choose valid registered parcel-image evidence.');
    const lockRef=ref('parcelAnalysisLocks',lockKey(scope,input.evidenceId)),lock=(await tx.get(lockRef)).data();
    if(lock){
      // Even an expired claim must be explicitly resolved. Replaying this
      // operation can never become a claim after the blocker disappears.
      const blocking=scoped(await tx.get(ref('parcelAnalyses',lock.analysisId)),scope);
      if(lock.ownerId!==scope||lock.evidenceId!==input.evidenceId||blocking.evidenceId!==input.evidenceId)fail();
      tx.create(receiptRef,{ownerId:scope,actorUid:auth.uid,...input,commandHash,state:'Blocked',analysisId:lock.analysisId,createdAt:Date.now()});
      return {result:busy(lock.analysisId)};
    }
    const analysisId=randomUUID(),nonce=randomUUID(),model=acceptedModel(),createdAt=Date.now();
    const record=createRunningParcelAnalysis({ownerId:scope,analysisId,actorUid:auth.uid,...input,shipmentId:evidence.shipmentId,evidenceVersion:evidence.version,evidenceSha256:evidence.sha256,stage:evidence.stage,shipmentVersion:shipment.version,captureSource:evidence.captureSource,capturedAtClient:evidence.capturedAtClient??null,model},createdAt);
    const coordinates={ownerId:scope,evidenceId:input.evidenceId,analysisId,receiptKey,nonce,expiresAt:record.expiresAt};
    const receipt={...coordinates,actorUid:auth.uid,operationId:input.operationId,commandHash,state:'Running',createdAt,snapshot:contextSnapshot(config,account,evidence,shipment,plan),model,pinHash:model?digest(model):null};
    tx.create(receiptRef,receipt);tx.create(lockRef,coordinates);tx.create(ref('parcelAnalyses',analysisId),record);
    return {receipt,record};
  });
}
function originalClaimMatches(receipt,expected,record){
  return receipt?.state==='Running'&&record?.state==='Running'&&matchesParcelAnalysisClaim(receipt,expected)
    &&['actorUid','operationId','commandHash','createdAt','snapshot','model','pinHash'].every(key=>same(receipt[key],expected[key]))
    &&receipt.commandHash===digest({evidenceId:record.evidenceId,operationId:record.operationId})
    &&receipt.receiptKey===requestKey(record.ownerId,record.actorUid,record.operationId)
    &&receipt.actorUid===record.actorUid&&receipt.operationId===record.operationId&&receipt.ownerId===record.ownerId&&receipt.evidenceId===record.evidenceId&&receipt.analysisId===record.analysisId&&receipt.createdAt===record.createdAt&&receipt.expiresAt===record.expiresAt;
}
const claimMatches=(receipt,expected,record,lock)=>originalClaimMatches(receipt,expected,record)&&matchesParcelAnalysisClaim(receipt,lock);
function writeTerminal(tx,receipt,record,lock,outcome,now){
  const terminal=finishParcelAnalysis(record,outcome,now);
  tx.set(ref('parcelAnalyses',record.analysisId),terminal);
  tx.update(ref('parcelAnalysisRequests',receipt.receiptKey),{state:terminal.state,completedAt:now});
  if(matchesParcelAnalysisClaim(receipt,lock))tx.delete(ref('parcelAnalysisLocks',lockKey(receipt.ownerId,receipt.evidenceId)));
  return terminal;
}
function projection(record){
  return {ownerId:record.ownerId,kind:'parcel',recordId:record.evidenceId,sourceVersion:record.evidenceVersion,analysisId:record.analysisId,shipmentId:record.shipmentId,stage:record.stage,shipmentVersion:record.shipmentVersion,evidenceSha256:record.evidenceSha256,label:record.label,confidence:record.confidence,confidenceMeaning:record.confidenceMeaning,probabilities:record.probabilities,...record.model,serviceRequestId:record.serviceRequestId,processingTimeMs:record.processingTimeMs,totalProcessingTimeMs:record.totalProcessingTimeMs,reviewStatus:'Pending',humanReviewRequired:true,actor:record.actorUid,createdAt:record.completedAt,version:1};
}
const auditId=(predictionId,version)=>`predictions_${predictionId}_${version}`;
function audit(tx,record,predictionId,version,action){tx.create(ref('auditLogs',auditId(predictionId,version)),{ownerId:record.ownerId,actor:record.actorUid,kind:'predictions',recordId:predictionId,version,action,label:`Parcel ${action}`,at:FieldValue.serverTimestamp()});}

async function complete(auth,scope,expected,outcome,deadline){
  return scopedTransaction(auth,scope,ROLES,async(tx,config,account)=>{
    const receipt=(await tx.get(ref('parcelAnalysisRequests',expected.receiptKey))).data();
    const record=scoped(await tx.get(ref('parcelAnalyses',expected.analysisId)),scope);
    const lock=(await tx.get(ref('parcelAnalysisLocks',lockKey(scope,expected.evidenceId)))).data();
    if(record.state!=='Running')return savedOutcome(tx,record);
    if(!claimMatches(receipt,expected,record,lock))fail();
    if(Date.now()>=record.expiresAt)return writeTerminal(tx,receipt,record,lock,{state:'Expired',reasonCode:'lease-expired'},Date.now());
    const current=await context(tx,scope,expected.evidenceId);
    const fresh=contextSnapshot(config,account,current.evidence,current.shipment,current.plan);
    let selected=outcome;
    if(!same(receipt.model,acceptedModel())||receipt.pinHash!==(acceptedModel()?digest(acceptedModel()):null))selected={state:'Stale',reasonCode:'model-changed'};
    else if(!same(receipt.snapshot,fresh)||!eligible(scope,auth.uid,account,current.evidence,current.shipment,current.plan))selected={state:'Stale',reasonCode:same(receipt.snapshot.account,fresh.account)?'context-changed':'access-changed'};
    let predicted;
    if(selected.state==='Predicted'){
      const predictionId=`parcel-${record.analysisId}`;
      const existing=await tx.get(ref('predictions',predictionId)),event=await tx.get(ref('auditLogs',auditId(predictionId,1)));
      if(existing.exists||event.exists)selected={state:'Failed',reasonCode:'invalid-response'};
      else predicted=predictionId;
    }
    // All reads precede the final authority clock. A lease can elapse while a
    // read is awaited even when this transaction does not need a retry.
    const now=Date.now();
    if(now>=record.expiresAt){selected={state:'Expired',reasonCode:'lease-expired'};predicted=undefined;}
    else if(now>=deadline){selected={state:'Failed',reasonCode:'time-limit'};predicted=undefined;}
    const terminal=writeTerminal(tx,receipt,record,lock,selected,now);
    if(predicted){tx.create(ref('predictions',predicted),projection(terminal));audit(tx,terminal,predicted,1,'Predict');}
    return terminal;
  });
}
// This internal path derives all coordinates from the committed claim. It never
// accepts or stores model output and cannot grant the caller read permissions.
async function cleanup(expected,reasonCode){
  return db().runTransaction(async tx=>{
    const receipt=(await tx.get(ref('parcelAnalysisRequests',expected.receiptKey))).data(),record=(await tx.get(ref('parcelAnalyses',expected.analysisId))).data(),lock=(await tx.get(ref('parcelAnalysisLocks',lockKey(expected.ownerId,expected.evidenceId)))).data();
    if(!originalClaimMatches(receipt,expected,record))return;
    const now=Date.now();
    writeTerminal(tx,receipt,record,lock,now>=record.expiresAt?{state:'Expired',reasonCode:'lease-expired'}:{state:'Stale',reasonCode},now);
  });
}

// Independent deadlines cover stalled metadata, stream iteration, fetch headers
// and body reads. Abort plus destroy/cancel closes the actual resource; racing
// also fences a transport which does not settle promptly after cancellation.
async function bounded(work,milliseconds,onTimeout=()=>{}){
  if(milliseconds<=0)throw problem('time-limit');
  let timer;
  try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>{onTimeout();reject(problem('time-limit'));},milliseconds);})]);}
  finally{clearTimeout(timer);}
}
const remaining=(deadline,cap)=>Math.min(cap,deadline-Date.now());
function sniff(bytes,type){
  if(type==='image/png')return bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(type==='image/jpeg')return bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  return bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
}
async function imageBytes(evidence,deadline){
  let stream,cancelled=false;
  return bounded(async()=>{
    try{
      const object=getStorage().bucket(process.env.EVIDENCE_BUCKET||'fyp-inventory-and-logistics.firebasestorage.app').file(evidence.path),[metadata]=await object.getMetadata();
      if(cancelled)throw problem('time-limit');
      if(Number(metadata.size)!==evidence.bytes||metadata.contentType!==evidence.contentType)throw problem('invalid-evidence');
      stream=object.createReadStream();const chunks=[];let length=0;const sha=createHash('sha256');
      for await(const chunk of stream){const value=Buffer.from(chunk);length+=value.length;if(length>10*1024*1024)throw problem('resource-limit');sha.update(value);chunks.push(value);}
      const buffer=Buffer.concat(chunks,length);
      if(length!==evidence.bytes||sha.digest('hex')!==evidence.sha256||!sniff(buffer,evidence.contentType))throw problem('invalid-evidence');
      return buffer;
    }catch(error){if(error.reasonCode)throw error;throw problem('invalid-evidence');}
    finally{stream?.destroy();}
  },remaining(deadline,10000),()=>{cancelled=true;stream?.destroy();});
}
async function infer(receipt,deadline){
  if(!receipt.model)return {state:'Unavailable',reasonCode:'model-unavailable'};
  if(!process.env.RESEARCH_API_URL||!process.env.RESEARCH_API_TOKEN)return {state:'Unavailable',reasonCode:'service-unavailable'};
  try{
    const bytes=await imageBytes(receipt.snapshot.evidence,deadline);
    const controller=new AbortController();let reader;
    const result=await bounded(async()=>{
      try{
        const response=await fetch(`${process.env.RESEARCH_API_URL.replace(/\/$/,'')}/predict`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.RESEARCH_API_TOKEN}`},body:JSON.stringify({kind:'parcel',imageBase64:bytes.toString('base64')}),signal:controller.signal});
        if(controller.signal.aborted){void response.body?.cancel().catch(()=>{});throw problem('time-limit');}
        if(!response.ok){await response.body?.cancel();throw problem([429,503].includes(response.status)?'service-unavailable':'service-failed');}
        if(!response.body)throw problem('invalid-response');reader=response.body.getReader();const chunks=[];let length=0;
        while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>16*1024)throw problem('resource-limit');chunks.push(Buffer.from(value));}
        let parsed;try{parsed=JSON.parse(Buffer.concat(chunks,length).toString('utf8'));}catch{throw problem('invalid-response');}
        try{validateParcelResponse(parsed,{acceptance:{...receipt.model,intendedUse:'registered-photo'},evidenceSha256:receipt.snapshot.evidence.sha256});}catch{throw problem('invalid-response');}
        return parsed;
      }finally{if(reader){void reader.cancel().catch(()=>{});}controller.abort();}
    },remaining(deadline,30000),()=>{controller.abort();if(reader)void reader.cancel().catch(()=>{});});
    if(Date.now()>=deadline)throw problem('time-limit');
    return {state:result.status==='predicted'?'Predicted':'Abstained',label:result.label,probabilities:result.probabilities,confidence:result.confidence,model:receipt.model,serviceRequestId:result.requestId,processingTimeMs:result.processingTimeMs,totalProcessingTimeMs:result.totalProcessingTimeMs};
  }catch(error){const reasonCode=error.reasonCode||'service-unavailable';return {state:reasonCode==='service-unavailable'?'Unavailable':'Failed',reasonCode};}
}
export async function startParcelAnalysis(auth,scope,input){
  const deadline=Date.now()+50000,data=validateStartParcelAnalysis(input),claimed=await claim(auth,scope,data);
  if(claimed.result)return claimed.result;
  const outcome=await infer(claimed.receipt,deadline);
  try{return await complete(auth,scope,claimed.receipt,outcome,deadline);}
  catch(error){
    try{await cleanup(claimed.receipt,error.code==='permission-denied'?'access-changed':'context-changed');}catch{fail('Parcel analysis could not be saved. Check the saved outcome before trying again.','unavailable');}
    if(error.code==='permission-denied')fail('Access changed during parcel analysis.','permission-denied');
    // Read a safe null outcome only through the current protected access check.
    return resolveParcelAnalysis(auth,scope,{analysisId:claimed.record.analysisId});
  }
}
export async function resolveParcelAnalysis(auth,scope,input){
  const {analysisId}=validateResolveParcelAnalysis(input);
  return scopedTransaction(auth,scope,ROLES,async tx=>{
    const record=scoped(await tx.get(ref('parcelAnalyses',analysisId)),scope);
    if(record.state!=='Running'||Date.now()<record.expiresAt)return savedOutcome(tx,record);
    const receiptKey=requestKey(scope,record.actorUid,record.operationId),receipt=(await tx.get(ref('parcelAnalysisRequests',receiptKey))).data(),lock=(await tx.get(ref('parcelAnalysisLocks',lockKey(scope,record.evidenceId)))).data();
    if(!originalClaimMatches(receipt,{...receipt,receiptKey},record))fail();
    return writeTerminal(tx,receipt,record,lock,{state:'Expired',reasonCode:'lease-expired'},Date.now());
  });
}
function projectionConsistent(record,prediction){
  if(!prediction||record.state!=='Predicted'||record.predictionId!==`parcel-${record.analysisId}`||prediction.analysisId!==record.analysisId)return false;
  const expected=projection(record),reviewFields=['reviewStatus','humanReviewRequired','version'];
  if(!Object.keys(expected).filter(key=>!reviewFields.includes(key)).every(key=>same(expected[key],prediction[key])))return false;
  if(prediction.reviewStatus!==record.reviewStatus||prediction.humanReviewRequired!==record.humanReviewRequired||prediction.version!==(record.reviewStatus==='Pending'?1:2))return false;
  return record.reviewStatus==='Pending'?['reviewNotes','reviewedBy','reviewedAt'].every(key=>prediction[key]===undefined||prediction[key]===null):['reviewNotes','reviewedBy','reviewedAt'].every(key=>same(record[key],prediction[key]));
}
async function savedOutcome(tx,record){
  const safe=toPublicParcelAnalysis(record);
  if(safe.state==='Predicted'){
    const prediction=(await tx.get(ref('predictions',safe.predictionId))).data(),event=(await tx.get(ref('auditLogs',auditId(safe.predictionId,1)))).data();
    if(!projectionConsistent(safe,prediction)||!event||event.ownerId!==safe.ownerId||event.kind!=='predictions'||event.recordId!==safe.predictionId||event.action!=='Predict'||event.version!==1)fail('The saved parcel result is inconsistent.');
  }
  return safe;
}
export async function reviewLinkedParcelPrediction(tx,predictionId,prediction,input,actor,role){
  const record=scoped(await tx.get(ref('parcelAnalyses',prediction.analysisId)),prediction.ownerId);
  if(record.predictionId!==predictionId||record.reviewStatus!=='Pending'||record.version!==2||!projectionConsistent(record,prediction))fail('The linked parcel result is inconsistent or already reviewed.');
  const changed=applyReview(record,{analysisId:record.analysisId,version:record.version,decision:input.decision==='Accept'?'Accepted':'Rejected',notes:input.notes},{reviewerUid:actor,role,nowMs:Date.now()});
  const event=await tx.get(ref('auditLogs',auditId(predictionId,2)));if(event.exists)fail('The linked parcel review is inconsistent.');
  tx.set(ref('parcelAnalyses',record.analysisId),changed);tx.update(ref('predictions',predictionId),{reviewStatus:changed.reviewStatus,reviewNotes:changed.reviewNotes,reviewedBy:actor,reviewedAt:changed.reviewedAt,humanReviewRequired:false,version:2});audit(tx,{...record,actorUid:actor},predictionId,2,'Review');
  return changed;
}
export async function reviewParcelAnalysis(auth,scope,input){
  const data=validateParcelAnalysisReview(input);
  return scopedTransaction(auth,scope,['Admin','Manager'],async(tx,_config,account)=>{
    const record=scoped(await tx.get(ref('parcelAnalyses',data.analysisId)),scope);
    if(record.version!==data.version)fail('This parcel review changed. Refresh and try again.');
    if(record.state==='Predicted'){
      if(!['Accepted','Rejected'].includes(data.decision))fail('Choose Accept or Reject for a predicted result.');
      const prediction=scoped(await tx.get(ref('predictions',record.predictionId)),scope);
      return reviewLinkedParcelPrediction(tx,record.predictionId,prediction,{decision:data.decision==='Accepted'?'Accept':'Reject',notes:data.notes},auth.uid,account.role);
    }
    const changed=applyReview(record,data,{reviewerUid:auth.uid,role:account.role,nowMs:Date.now()});tx.set(ref('parcelAnalyses',record.analysisId),changed);return changed;
  });
}
