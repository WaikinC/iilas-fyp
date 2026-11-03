import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,relative,isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {completionExact,completionUUID} from '../lib/completionWorkflow.js';
import {readSparkPreparation} from './prepare-spark-msi.mjs';
import {readSparkPrivate,sparkHash,sparkSourcePath,SPARK_ROOT} from './spark-private-files.mjs';
import {readSparkCredential} from './spark-activation.mjs';
import {validateCloudScenarioApproval} from './spark-cloud-scenarios.mjs';
import {sparkCloudRowHash,sparkCloudInventory,planSparkCloudCleanup,deleteSparkCloudFixtures,mergeSparkCloudFixtureRegistry,validateSparkCleanupApproval} from './spark-cloud-cleanup.mjs';
import {createSparkCloudReader} from './spark-cloud-observer.mjs';
import {verifySparkPublicApi} from './spark-cloud-live-deploy.mjs';
import {sparkPublicationExecutionMode} from './spark-cloud-publication.mjs';
import {initializeApp as initialiseClient,deleteApp as deleteClient} from 'firebase/app';
import {getAuth as clientAuth,setPersistence,inMemoryPersistence,signInWithCustomToken,signOut} from 'firebase/auth';
import {createSparkTransport} from '../lib/sparkTransport.js';

const fail=()=>{throw Error('Cloud completion requires actual source-bound observations, current chain checks, restored roles and unchanged owned fixtures.');};
const methods={'browser-layouts':'observed-browser','public-lost-reply':'controlled-http-loss','msi-restart-recovery':'observed-runtime','model-outage-recovery':'observed-runtime','remote-laptop':'human-attested-original-laptop','manual-wallet':'observed-wallet'};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const identifier=v=>typeof v==='string'&&/^[-A-Za-z0-9_]{1,128}$/.test(v);
export function validateSparkAcceptanceEvidence(raw,{runId,preparationSha256,profile,operationIds}){
 completionUUID(runId);const r=completionExact(raw,['schema','runId','preparationSha256','fixtureOnly','apiOrigin','websiteOrigin','backendInstanceId','gates']);
 if(r.schema!=='iilas-cloud-observed-evidence-1.0'||r.runId!==runId||r.preparationSha256!==preparationSha256||!hash(preparationSha256)||r.fixtureOnly!==false||r.apiOrigin!==profile.apiOrigin||r.websiteOrigin!==profile.webOrigins[0]||r.backendInstanceId!==profile.backendInstanceId||!Array.isArray(r.gates)||r.gates.length!==Object.keys(methods).length||new Set(r.gates.map(g=>g.kind)).size!==r.gates.length)fail();
 for(const gate of r.gates){
  completionExact(gate,['kind','method','passed','observedAt','details','artifacts']);
  if(!Object.hasOwn(methods,gate.kind)||gate.method!==methods[gate.kind]||gate.passed!==true||typeof gate.observedAt!=='string'||Number.isNaN(Date.parse(gate.observedAt))||!Array.isArray(gate.artifacts)||gate.artifacts.length<1||gate.artifacts.length>6)fail();
  for(const artifact of gate.artifacts){completionExact(artifact,['path','sha256']);if(typeof artifact.path!=='string'||!hash(artifact.sha256))fail();}
  const d=gate.details;
  if(gate.kind==='browser-layouts'){completionExact(d,['widths']);if(JSON.stringify(d.widths)!==JSON.stringify([1440,390]))fail();}
  if(gate.kind==='public-lost-reply'){completionExact(d,['originalOperationId']);if(!operationIds.includes(d.originalOperationId))fail();}
  if(gate.kind==='msi-restart-recovery'){completionExact(d,['unavailableObserved','originalOperationId']);if(d.unavailableObserved!==true||!operationIds.includes(d.originalOperationId))fail();}
  if(gate.kind==='model-outage-recovery'){completionExact(d,['models','unavailableObserved','originalOperationId']);if(JSON.stringify(d.models)!==JSON.stringify(['stock','delivery'])||d.unavailableObserved!==true||!operationIds.includes(d.originalOperationId))fail();}
  if(gate.kind==='remote-laptop'){completionExact(d,['device']);if(d.device!=='original-laptop')fail();}
  if(gate.kind==='manual-wallet'){completionExact(d,['inventoryCheckId','deliveryCheckId']);if(!identifier(d.inventoryCheckId)||!identifier(d.deliveryCheckId)||d.inventoryCheckId===d.deliveryCheckId)fail();}
 }
 return r.gates;
}
function within(root,path){const rel=relative(root,sparkSourcePath(path));if(!rel||rel.startsWith('..')||isAbsolute(rel))fail();}
async function pinnedInput(pin,root){completionExact(pin,['path','sha256']);within(root,pin.path);const bytes=await readSparkPrivate(pin.path,16*1024*1024);if(sparkHash(bytes)!==pin.sha256)fail();return JSON.parse(bytes);}
export async function createSparkFinalIntegrityRPC(loaded,{rpc,observeProcess}={}){
 const {createSparkIntegrityRPC}=await import('../backend/functions/sparkIntegrity.mjs');if(!rpc)rpc=(await import('../backend/functions/integrityWorkflow.mjs')).localIntegrityRPC;
 return createSparkIntegrityRPC({configuration:()=>({chain:loaded.serving.chainBinding,processIdentity:loaded.serving.chainProcessIdentity}),rpc,...(observeProcess?{observeProcess}:{})});
}
export function validateSparkCurrentProof({expected,row,bytes,scope}){
 if(!expected||!row||row.ownerId!==scope||typeof expected.path!=='string'||typeof expected.generation!=='string'||!expected.generation||!hash(expected.sha256)||row.path!==expected.path||row.storageGeneration!==expected.generation||row.bytes!==expected.bytes||row.sha256!==expected.sha256||!Buffer.isBuffer(bytes)||bytes.length!==expected.bytes||bytes.length>10485760||sparkHash(bytes)!==expected.sha256)fail();return true;
}
async function verifyObservedChains({loaded,db,state,gates,download}){
 const rpc=await createSparkFinalIntegrityRPC(loaded),config=loaded.serving.chainBinding,observed=await rpc.inspect(config);if(observed.chainId!==31337||observed.runtimeCodeSha256!==config.runtimeCodeSha256||observed.deploymentTransactionHash!==config.deploymentTransactionHash)fail();
 const wallet=gates.find(g=>g.kind==='manual-wallet').details;
 for(const kind of ['inventory','delivery']){
  const check=(await db.doc('integrityChecks/'+wallet[kind+'CheckId']).get()).data();if(!check||check.ownerId!==state.scope||check.kind!==kind||check.outcome!=='Verified'||sparkCloudRowHash(check.chain)!==sparkCloudRowHash(config))fail();
  if(kind==='delivery'&&check.recordId!==state.results.proof.evidenceId)fail();
  if(kind==='inventory'){const row=(await db.doc('stockMovements/'+check.recordId).get()).data();if(!row||row.ownerId!==state.scope||row.productId!==state.results.stock.productId)fail();}
  const source=check.source,registration=(await db.doc('verificationRecords/'+source.referenceHash).get()).data();
  if(!registration||registration.ownerId!==state.scope||registration.recordId!==check.recordId||registration.kind!==kind||registration.status!=='Verified'||registration.digest!==source.digest||check.observedDigest!==source.digest||sparkCloudRowHash(registration.chain)!==sparkCloudRowHash(config))fail();
  const receipt=await rpc.receipt(config,registration.transactionHash,source),digest=await rpc.lookup(config,source);
  if(receipt?.status!==1||receipt.digest!==source.digest||receipt.referenceHash!==source.referenceHash||receipt.blockNumber!==registration.blockNumber||digest!==source.digest)fail();
 }
 const proof=state.results.proof,ref=db.doc('evidence/'+proof.evidenceId),row=(await ref.get()).data(),bytes=await download(proof.evidenceId);
 validateSparkCurrentProof({expected:proof,row,bytes,scope:state.scope});if(sparkCloudRowHash((await ref.get()).data())!==sparkCloudRowHash(row))fail();
 await rpc.inspect(config);
}
export async function finalizeSparkCloudAcceptance({preparationPath,participantsPath,approvalPath,runId,runRoot,evidencePath,registryPath,cleanupApprovalPath,outputRoot,execute=false}){
 const root=sparkSourcePath(runRoot);within(join(SPARK_ROOT,'outputs/spark-msi-demo-20261028'),root);
 const loaded=await readSparkPreparation(preparationPath);if(loaded.receipt.testMode||loaded.profile.mode!=='spark-msi'||!loaded.activation||Object.keys(process.env).some(k=>/EMULATOR/.test(k)))fail();
 const preparationSha256=sparkHash(await readSparkPrivate(preparationPath)),participants=JSON.parse(await readSparkPrivate(participantsPath)),approval=JSON.parse(await readSparkPrivate(approvalPath));validateCloudScenarioApproval(approval,{runId,preparationSha256,participants});
 const softwareBytes=await readSparkPrivate(join(root,'acceptance.private.json')),software=JSON.parse(softwareBytes);if(software.schema!=='iilas-cloud-software-acceptance-1.0'||software.runId!==runId||software.preparationSha256!==preparationSha256||software.softwareStepsPassed!==true||software.originalRecordsPreservationVerified!==true||software.billingChanged!==false)fail();
 const state=await pinnedInput(software.journal,root),before=await pinnedInput(software.baseline,root);if(state.runId!==runId||state.preparationSha256!==preparationSha256||state.failed||state.scope!==participants[0].uid||state.secondUid!==participants[1].uid)fail();
 if(!state.fixturePins)fail();if(registryPath){within(root,registryPath);state.fixturePins=mergeSparkCloudFixtureRegistry(state.fixturePins,JSON.parse(await readSparkPrivate(registryPath)),state);}
 within(root,evidencePath);const evidenceBytes=await readSparkPrivate(evidencePath),evidence=JSON.parse(evidenceBytes),gates=validateSparkAcceptanceEvidence(evidence,{runId,preparationSha256,profile:loaded.profile,operationIds:state.operationIds});
 for(const gate of gates)for(const artifact of gate.artifacts){within(root,artifact.path);if(sparkHash(await readSparkPrivate(artifact.path,16*1024*1024))!==artifact.sha256)fail();}
 const credential=await readSparkCredential(loaded.serverConfig.credentialPath,loaded.serverConfig.credentialSha256),require=createRequire(new URL('../backend/functions/package.json',import.meta.url)),admin=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore');
 const app=admin.initializeApp({projectId:loaded.profile.projectId,credential:admin.cert(credential)},'cloud-finalize-'+runId),db=getFirestore(app),identity=getAuth(app);let client;
 try{
  for(const [i,p]of participants.entries()){const u=await identity.getUser(p.uid),profile=(await db.doc('users/'+p.uid).get()).data();if(u.disabled||!u.emailVerified||u.email?.toLowerCase()!==p.email?.toLowerCase()||!profile?.active||profile.status!=='Approved'||profile.role!==(i===0?'Admin':'Manager'))fail();}
  const request=await createSparkCloudReader(),billing=await request('cloudbilling.googleapis.com','/v1/projects/'+loaded.profile.projectId+'/billingInfo');if(billing.billingEnabled!==false)fail();
  await verifySparkPublicApi({apiOrigin:loaded.profile.apiOrigin,websiteOrigin:loaded.profile.webOrigins[0],backendInstanceId:loaded.profile.backendInstanceId});
  const options=JSON.parse(await readFile(join(SPARK_ROOT,'firebase-config.json')));if(options.projectId!==loaded.profile.projectId)fail();client=initialiseClient(options,'cloud-final-proof-'+runId);const session=clientAuth(client);await setPersistence(session,inMemoryPersistence);await signInWithCustomToken(session,await identity.createCustomToken(state.scope));if(session.currentUser?.uid!==state.scope||!session.currentUser.emailVerified)fail();const transport=createSparkTransport({profile:loaded.profile,auth:session});
  await verifyObservedChains({loaded,db,state,gates,download:async id=>Buffer.from(await (await transport.download(id)).arrayBuffer())});const current=await sparkCloudInventory(db),plan=planSparkCloudCleanup({before,current,intent:state});
  const output=sparkSourcePath(outputRoot);within(root,output);await mkdir(output,{recursive:false});
  await writeFile(join(output,'cleanup-plan.private.json'),JSON.stringify(plan,null,2),{flag:'wx',mode:0o600,flush:true});
  const planSha256=sparkCloudRowHash(plan);
  if(!execute){await writeFile(join(output,'cleanup-approval-draft.private.json'),JSON.stringify({schema:'iilas-cloud-cleanup-approval-draft-1.0',runId,preparationSha256,planSha256,deleteOnlyRegisteredUnchangedFixtures:true,billingMustRemainDisabled:true},null,2),{flag:'wx',mode:0o600});return {dryRun:true,observedGates:gates.length,ownedFixtureDocuments:plan.paths.length,applicationDataWrites:0,normalAuthSessionStarted:true,needsExactCleanupApproval:true,planSha256,output,passed:false};}
  if(!cleanupApprovalPath)fail();within(root,cleanupApprovalPath);validateSparkCleanupApproval(JSON.parse(await readSparkPrivate(cleanupApprovalPath)),plan);
  await readSparkPreparation(preparationPath);const cleanup=await deleteSparkCloudFixtures({db,plan,before,current,intent:state}),after=await sparkCloudInventory(db),expected={...plan.observedHashes};for(const path of plan.paths)delete expected[path];assert.deepEqual(after.hashes,expected);
  const afterBilling=await request('cloudbilling.googleapis.com','/v1/projects/'+loaded.profile.projectId+'/billingInfo');if(afterBilling.billingEnabled!==false)fail();
  const result={schema:'iilas-cloud-completed-acceptance-1.0',passed:true,runId,preparationSha256,softwareReceiptSha256:sparkHash(softwareBytes),observedEvidenceSha256:sparkHash(evidenceBytes),gates:gates.map(({kind,method})=>({kind,method})),cleanup,originalRecordsPreservedExceptApprovedRoleHistory:true,secondRoleRestored:'Manager',walletAndCurrentChainVerified:true,remoteLaptopEvidence:'human-attested-original-laptop',billingEnabled:false,parcelTesting:false,physicalAndroidTesting:false,completedAt:new Date().toISOString()};
  await writeFile(join(output,'completed.private.json'),JSON.stringify(result,null,2),{flag:'wx',mode:0o600,flush:true});return result;
 }finally{if(client){await signOut(clientAuth(client)).catch(()=>{});await deleteClient(client);}await admin.deleteApp(app);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const get=k=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:null;
 Promise.resolve().then(()=>finalizeSparkCloudAcceptance({preparationPath:get('--profile'),participantsPath:get('--participants'),approvalPath:get('--approval'),runId:get('--run-id'),runRoot:get('--run-root'),evidencePath:get('--evidence'),registryPath:get('--fixtures'),cleanupApprovalPath:get('--cleanup-approval'),outputRoot:get('--output'),execute:sparkPublicationExecutionMode(process.argv.slice(2))})).then(r=>console.log(JSON.stringify({passed:r.passed,dryRun:r.dryRun,observedGates:r.observedGates,deletedFixtures:r.cleanup?.deleted,billingEnabled:r.billingEnabled,planSha256:r.planSha256,output:r.output,needsExactCleanupApproval:r.needsExactCleanupApproval}))).catch(()=>{console.error('Cloud acceptance is incomplete or changed. Inspect private receipts; no automatic restore or broad cleanup.');process.exitCode=1;});
}
