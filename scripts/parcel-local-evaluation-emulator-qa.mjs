// Existing loopback emulator only. Real Firestore + real capability/source
// validation; HTTP and Storage are external synthetic doubles, never a model.
// Run after a fresh manifest: node --experimental-test-module-mocks
// --experimental-strip-types scripts/parcel-local-evaluation-emulator-qa.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {Readable,Writable} from 'node:stream';
import {mock} from 'node:test';
import {writeFile} from 'node:fs/promises';
import {createParcelEvaluationOutput} from './parcel-evaluation-output.mjs';
import config from '../firebase-config.json' with {type:'json'};
import {dashboardSummary} from '../src/features/dashboard/dashboardData.ts';
assert.equal(config.projectId,'fyp-inventory-and-logistics');
for(const [key,value] of Object.entries({FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:config.projectId,GOOGLE_CLOUD_PROJECT:config.projectId,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199'}))assert.equal(process.env[key],value,`Requires exact ${key}`);
const require=createRequire(new URL('../backend/functions/service.mjs',import.meta.url));
const output=await createParcelEvaluationOutput('local-emulator');
const admin=require('firebase-admin/app'),app=admin.initializeApp({projectId:config.projectId,storageBucket:config.storageBucket}),db=require('firebase-admin/firestore').getFirestore(app);
const baseline=(await db.doc('system/config').get()).data();assert(baseline?.dataScopeId);
const scope=baseline.dataScopeId,tag=`local-eval-${randomUUID()}`,actor=`${tag}-staff`,manager=`${tag}-manager`,viewer=`${tag}-viewer`,shipment=`${tag}-shipment`,photo=`${tag}-photo`;
const docs=new Set(),objects=new Map(),results=[];let calls=0,reads=0,writes=0,afterFetch=()=>{};
const hash=b=>createHash('sha256').update(b).digest('hex');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const jpeg=Buffer.from([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,8,1,1,0,0,63,0,1,255,217]);
mock.method(require('firebase-admin/storage'),'getStorage',()=>({bucket:()=>({file:(path,opts)=>{
 const file={interceptors:[],async getMetadata(){reads++;if(path.startsWith('evidence/'))return [{size:String(png.length),contentType:'image/png'}];const o=objects.get(path);assert(o);assert(!opts||opts.generation===o.generation);return [o];},createReadStream(){reads++;return Readable.from([path.startsWith('evidence/')?png:objects.get(path).buffer]);},createWriteStream(options){writes++;assert.equal(options.preconditionOpts.ifGenerationMatch,0);const chunks=[];return new Writable({write(c,_e,cb){chunks.push(Buffer.from(c));cb();},final(cb){assert(!objects.has(path));const buffer=Buffer.concat(chunks);objects.set(path,{buffer,size:String(buffer.length),contentType:'image/jpeg',generation:'123',metageneration:'1'});file.metadata=objects.get(path);cb();}});}};return file;
}})}));
const {selectParcelLocalEvaluationModel}=await import('../backend/functions/parcelLocalEvaluation.mjs');
const photoModel=selectParcelLocalEvaluationModel('registered-photo'),liveModel=selectParcelLocalEvaluationModel('sampled-live');assert(photoModel&&liveModel,'Fresh exact local manifest/capability required.');
const {executeCommand}=await import('../backend/functions/service.mjs');
const command=(action,input,uid=actor)=>executeCommand({uid},{action,input,workspaceId:scope});
globalThis.fetch=async(_url,options)=>{calls++;const body=JSON.parse(options.body),live=body.intendedUse==='sampled-live',model=live?liveModel:photoModel,wire={...model,intendedUse:live?'sampled-live':'registered-photo',evaluationOnly:true,runtimeMode:'local-evaluation',operationally_approved:false,humanReviewRequired:true,confidenceMeaning:'uncalibrated',evidenceSha256:hash(Buffer.from(body.imageBase64,'base64')),probabilities:[.2,.8],confidence:.8,label:'Damaged',status:'predicted',processingTimeMs:2,totalProcessingTimeMs:3,requestId:randomUUID(),...(live?{sessionId:body.sessionId,frameId:body.frameId,sequence:body.sequence}:{})};await afterFetch();return new Response(JSON.stringify(wire));};
const put=async(path,value)=>{docs.add(path);await db.doc(path).set(value);};
const check=async(name,work)=>{await work();results.push(name);console.log(`PASS ${name}`);};
let failure;
try{
 for(const [uid,role] of [[actor,'Warehouse'],[manager,'Manager'],[viewer,'Viewer']])await put(`users/${uid}`,{uid,role,status:'Approved',active:true,version:1});
 await put(`shipments/${shipment}`,{ownerId:scope,status:'Prepared',version:1});
 await put(`evidence/${photo}`,{ownerId:scope,shipmentId:shipment,type:'Parcel Image',integrityVersion:2,stage:'Pre-dispatch',captureSource:'file',capturedAtClient:null,version:1,path:`evidence/${scope}/${shipment}/${photo}`,bytes:png.length,contentType:'image/png',sha256:hash(png)});
 let analysis,session,frame;const operationId=randomUUID(),startInput={evidenceId:photo,operationId};
 await check('trusted false/null photo with actual manifest survives replay and Accepted reciprocal review',async()=>{analysis=await command('startParcelAnalysis',startInput);assert.equal(analysis.state,'Predicted');assert.deepEqual(analysis.model,photoModel);assert.deepEqual(await command('startParcelAnalysis',startInput),analysis);const p=(await db.doc(`predictions/${analysis.predictionId}`).get()).data();assert.equal(p.evaluationKind,'local-experimental');const records={purchases:[],deliveries:[],verifications:[],evidence:[{id:photo,...(await db.doc(`evidence/${photo}`).get()).data()}],predictions:[{id:analysis.predictionId,...p,reviewStatus:'Accepted'}],parcelAnalyses:[{id:analysis.analysisId,...analysis,reviewStatus:'Accepted'}]};const summary=dashboardSummary([],[{id:shipment,status:'Prepared'}],records,Date.now());assert.equal(summary.damageAlerts.length+summary.pendingVerification.length,0);analysis=await command('reviewParcelAnalysis',{analysisId:analysis.analysisId,version:2,decision:'Accepted',notes:'Synthetic visible packaging reviewed'},manager);assert.equal(analysis.reviewStatus,'Accepted');assert.equal(analysis.model.acceptanceSha256,null);});
 await check('role and exact client schema reject before image or HTTP work',async()=>{const before=[calls,reads,writes];await assert.rejects(command('startParcelAnalysis',{evidenceId:photo,operationId:randomUUID()},viewer));await assert.rejects(command('startParcelAnalysis',{evidenceId:photo,operationId:randomUUID(),evaluationKind:'local-experimental'}));assert.deepEqual([calls,reads,writes],before);});
 await check('photo experiment cannot replay/resolve/review without current capability',async()=>{delete process.env.FUNCTIONS_EMULATOR;try{await assert.rejects(command('startParcelAnalysis',startInput));await assert.rejects(command('resolveParcelAnalysis',{analysisId:analysis.analysisId}));await assert.rejects(command('reviewPrediction',{id:analysis.predictionId,version:2,decision:'Accept',notes:'Forbidden promotion'},manager));}finally{process.env.FUNCTIONS_EMULATOR='true';}});
 await check('live experiment retains Verified frame and Accepted review remains experimental',async()=>{session=await command('startParcelLiveSession',{shipmentId:shipment,stage:'Pre-dispatch',operationId:randomUUID()});assert.equal(session.state,'Open');frame=await command('reserveParcelLiveFrame',{sessionId:session.sessionId,frameId:randomUUID(),sequence:1,bytes:jpeg.length,sha256:hash(jpeg),width:1,height:1,capturedAtClient:new Date().toISOString()});frame=await command('analyseParcelLiveFrame',{sessionId:session.sessionId,frameId:frame.frameId,jpegBase64:jpeg.toString('base64')});assert.equal(frame.state,'Predicted');assert.equal(frame.retention,'Verified');const review={sessionId:session.sessionId,frameId:frame.frameId,version:3,decision:'Accepted',notes:'Synthetic visible packaging reviewed'};delete process.env.FUNCTIONS_EMULATOR;try{await assert.rejects(command('resolveParcelLiveFrame',{sessionId:session.sessionId,frameId:frame.frameId}));await assert.rejects(command('reviewParcelLiveFrame',review,manager));}finally{process.env.FUNCTIONS_EMULATOR='true';}frame=await command('reviewParcelLiveFrame',review,manager);assert.equal(frame.reviewStatus,'Accepted');assert.deepEqual(frame.model,liveModel);await command('stopParcelLiveSession',{sessionId:session.sessionId});});
 await check('manifest change during photo work fences the result and releases its original claim',async()=>{const old=process.env.IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256;afterFetch=()=>{process.env.IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256='f'.repeat(64);};try{const stale=await command('startParcelAnalysis',{evidenceId:photo,operationId:randomUUID()});assert.equal(stale.state,'Stale');assert.equal(stale.label,null);}finally{process.env.IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256=old;afterFetch=()=>{};}});
 await check('generic malformed experiment review cannot promote observation',async()=>{const id=`${tag}-malformed`;await put(`predictions/${id}`,{ownerId:scope,kind:'parcel',reviewStatus:'Pending',version:1,evaluationKind:'local-experimental',evaluationManifestSha256:photoModel.evaluationManifestSha256,acceptanceSha256:null});await assert.rejects(command('reviewPrediction',{id,version:1,decision:'Accept',notes:'Forbidden promotion'},manager));assert.equal((await db.doc(`predictions/${id}`).get()).data().reviewStatus,'Pending');});
 assert.deepEqual((await db.doc('system/config').get()).data(),baseline);
}catch(error){failure={name:error.name,message:error.message};process.exitCode=1;console.error(error);}
finally{
 // Only exact generated fixture identities. Never enumerate/delete shared scope.
 for(const uid of [actor,manager])for(const [kind,field] of [['parcelAnalyses','actorUid'],['parcelAnalysisRequests','actorUid'],['parcelAnalysisLocks','analysisId'],['parcelLiveSessions','actorUid'],['parcelLiveStartRequests','actorUid'],['parcelLiveFrameRequests','actorUid'],['parcelLiveActorLocks','actorUid'],['parcelLiveFrames','actorUid'],['predictions','actor'],['auditLogs','actor']]){
   if(kind==='parcelAnalysisLocks')continue;
   const found=await db.collection(kind).where(field,'==',uid).get();for(const row of found.docs)docs.add(row.ref.path);
 }
 // Photo lock ID is derived from this run's exact owner/evidence pair.
 docs.add(`parcelAnalysisLocks/${hash(JSON.stringify([scope,photo]))}`);
 for(const path of docs)await db.doc(path).delete();
 await admin.deleteApp(app);await writeFile(`${output}/task-2-emulator-results.json`,JSON.stringify({passed:!failure,syntheticOnly:true,actualFirestore:true,actualCapability:true,checks:results,calls,reads,writes,error:failure??null},null,2)+'\n',{flag:'wx'});
}
