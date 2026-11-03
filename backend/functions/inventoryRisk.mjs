import {getFirestore,FieldValue,Timestamp} from 'firebase-admin/firestore';
import {createHash,randomUUID} from 'node:crypto';
import {approvedTransaction} from './access.mjs';
import {buildInventoryAssessment,validateAssessmentInput,validateCaptureInput,validateReviewInput,canonicalInventoryRisk,INVENTORY_RISK_VERSIONS} from './inventoryRisk.js';

const roles=['Admin','Manager','Inventory','Warehouse'];
const fail=(message,code='failed-precondition')=>{const e=new Error(message);e.code=code;throw e;};
const hash=v=>createHash('sha256').update(canonicalInventoryRisk(v)).digest('hex');
const ref=(kind,id)=>getFirestore().collection(kind).doc(id);
const now=()=>FieldValue.serverTimestamp();
const ms=v=>typeof v==='number'?v:v?.toMillis?.();
const scoped=(snap,scope)=>{if(!snap.exists||snap.data().ownerId!==scope)fail('Record not found in the shared system.','not-found');return snap.data();};
const run=(auth,scope,allowed,work)=>approvedTransaction(auth,allowed,async(tx,config,member)=>{if(scope!==config.dataScopeId)fail('The system data source cannot be changed.','permission-denied');return work(tx,member);});
function active(product){if(product.archived||product.status!=='Active')fail('Choose an active product.');}
function audit(tx,scope,actor,id,version,action){tx.create(ref('auditLogs',`inventoryRisk_${id}_${version}`),{ownerId:scope,actor,kind:'inventoryRiskSnapshots',recordId:id,version,action,label:'Stock review data; not an AI prediction',at:now()});}
async function readAssessment(tx,scope,productId,product){
 const cutoffMs=Date.now(),from=Timestamp.fromMillis(cutoffMs-30*86400000),to=Timestamp.fromMillis(cutoffMs);
 const query=getFirestore().collection('stockMovements').where('ownerId','==',scope).where('productId','==',productId);
 const window=await tx.get(query.where('createdAt','>=',from).where('createdAt','<=',to).orderBy('createdAt','asc').limit(2001));
 const receipts=await tx.get(query.where('type','==','Receipt').where('createdAt','<=',to).orderBy('createdAt','desc').limit(21));
 const correctionLinks={};for(const receipt of receipts.docs.slice(0,20)){const link=await tx.get(ref('stockCorrectionLinks',receipt.id));if(link.exists){const data=scoped(link,scope);if(data.productId!==productId||data.originalMovementId!==receipt.id)fail('Receipt correction linkage needs reconciliation.');correctionLinks[receipt.id]={status:data.status};}}
 const row=s=>{const data=s.data();return {id:s.id,type:data.type,atMs:ms(data.createdAt),productVersion:data.productVersion??null,correctionOf:data.correctionOf??null};};
 const movements=window.docs.slice(0,2000).map(row),receiptCandidates=receipts.docs.map(row);
 const assessment=buildInventoryAssessment({productId,product,movements,receiptCandidates,correctionLinks,cutoffMs,overflow:window.size>2000});
 return {assessment,source:{movements,receiptCandidates,correctionLinks}};
}
export async function getInventoryAssessment(auth,scope,input){
 const data=validateAssessmentInput(input);return run(auth,scope,roles,async tx=>{const product=scoped(await tx.get(ref('products',data.productId)),scope);active(product);return (await readAssessment(tx,scope,data.productId,product)).assessment;});
}
async function capture(auth,scope,input,resolve){
 const data=validateCaptureInput(input),commandHash=hash(data),snapshotId=randomUUID();
 return run(auth,scope,roles,async tx=>{
  const receiptRef=ref('inventoryRiskRequests',hash(['capture',scope,auth.uid,data.operationId])),receipt=await tx.get(receiptRef);
  if(receipt.exists){const saved=receipt.data();if(saved.commandHash!==commandHash||saved.ownerId!==scope||saved.actor!==auth.uid)fail('This operation ID belongs to different snapshot input.');return {...saved.result,replayed:true};}
  let result;
  if(resolve)result={state:'Cancelled',snapshotId:null,replayed:false};
  else{
   const product=scoped(await tx.get(ref('products',data.productId)),scope);active(product);if(product.version!==data.productVersion)fail('This product changed. Refresh before saving its snapshot.');
   const {assessment,source}=await readAssessment(tx,scope,data.productId,product);if(!assessment.captureAllowed)fail('Reconcile stock balances or movement-history issues before saving a snapshot.');
   const frozen={versions:INVENTORY_RISK_VERSIONS,product:{id:data.productId,version:product.version,name:String(product.name??''),sku:String(product.sku??''),quantityOnHand:product.quantityOnHand,reservedQuantity:product.reservedQuantity??0,reorderLevel:product.reorderLevel},assessment,source};
   tx.create(ref('inventoryRiskSnapshots',snapshotId),{ownerId:scope,productId:data.productId,productVersion:product.version,observedAt:Timestamp.fromMillis(assessment.observedAtMs),createdAt:now(),createdBy:auth.uid,version:1,method:'rules',frozen,frozenSha256:hash(frozen),reviewState:'Pending',humanLabel:null,labelSource:null,latestReviewId:null,trainingEligibility:'NotAssessed'});
   audit(tx,scope,auth.uid,snapshotId,1,'Capture');result={state:'Captured',snapshotId,replayed:false};
  }
  tx.create(receiptRef,{ownerId:scope,actor:auth.uid,action:'capture',commandHash,result,createdAt:now()});return result;
 });
}
export const captureInventorySnapshot=(auth,scope,input)=>capture(auth,scope,input,false);
export const resolveInventorySnapshot=(auth,scope,input)=>capture(auth,scope,input,true);
async function reviewOperation(auth,scope,input,resolve=false){
 const data=validateReviewInput(input),commandHash=hash(data);
 return run(auth,scope,['Admin','Manager'],async(tx,member)=>{
  const receiptRef=ref('inventoryRiskRequests',hash(['review',scope,auth.uid,data.operationId])),receipt=await tx.get(receiptRef);
  if(receipt.exists){const saved=receipt.data();if(saved.commandHash!==commandHash||saved.ownerId!==scope||saved.actor!==auth.uid)fail('This review operation belongs to different input.');return {...saved.result,replayed:true};}
  if(resolve){const result={state:'Cancelled',snapshotId:data.snapshotId,reviewId:null,version:null,replayed:false};tx.create(receiptRef,{ownerId:scope,actor:auth.uid,action:'review',commandHash,result,createdAt:now()});return result;}
  const snapshotRef=ref('inventoryRiskSnapshots',data.snapshotId),snapshot=scoped(await tx.get(snapshotRef),scope);
  if(snapshot.createdBy===auth.uid)fail('A different Admin or Manager must review this snapshot.','permission-denied');
  if(snapshot.version!==data.version)fail('This review changed. Refresh before submitting a new judgement.');
  if(snapshot.frozenSha256!==hash(snapshot.frozen)||snapshot.trainingEligibility!=='NotAssessed')fail('The frozen snapshot needs reconciliation.');
  for(const evidence of data.evidenceRefs){const record=scoped(await tx.get(ref(evidence.kind,evidence.id)),scope);if(evidence.kind==='stockMovements'?record.productId!==snapshot.productId:!Array.isArray(record.items)||!record.items.some(item=>item.productId===snapshot.productId))fail('Evidence must reference this product.');}
  const version=snapshot.version+1,reviewId=`${data.snapshotId}_${version}`,label=data.decision==='Unresolved'?null:data.decision;
  tx.create(ref('inventoryRiskReviews',reviewId),{ownerId:scope,snapshotId:data.snapshotId,productId:snapshot.productId,version,previousReviewId:snapshot.latestReviewId,reviewer:auth.uid,reviewerRole:member.role,reviewedAt:now(),labelSource:'human',humanLabel:label,decision:data.decision,reason:data.reason,evidenceNotes:data.evidenceNotes,fulfilmentImpact:data.fulfilmentImpact,evidenceRefs:data.evidenceRefs,rubricVersion:INVENTORY_RISK_VERSIONS.rubric,frozenSha256:snapshot.frozenSha256});
  tx.update(snapshotRef,{version,reviewState:label?'Reviewed':'Unresolved',humanLabel:label,labelSource:'human',latestReviewId:reviewId,reviewedAt:now(),reviewedBy:auth.uid});
  audit(tx,scope,auth.uid,data.snapshotId,version,'Human review');const result={snapshotId:data.snapshotId,reviewId,version,replayed:false};tx.create(receiptRef,{ownerId:scope,actor:auth.uid,action:'review',commandHash,result,createdAt:now()});return result;
 });
}
export const reviewInventorySnapshot=(auth,scope,input)=>reviewOperation(auth,scope,input,false);
export const resolveInventoryReview=(auth,scope,input)=>reviewOperation(auth,scope,input,true);
