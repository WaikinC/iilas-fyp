import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {hash,publishJson,readPrivateJson} from './durable-chain.mjs';
import {backupProofTree,archiveStaleLock,replaceBinding,observeProcess} from './restart-state.mjs';

export function validateRestoredChain({binding,health}){
 assert.equal(health.protocol,'iilas-durable-chain-1.0');assert.equal(health.ready,true);assert.equal(health.stateId,binding.durable.stateId);assert.equal(health.manifestSha256,binding.durable.manifestSha256);assert.equal(health.genesisHash,binding.chainIdentity.genesisBlockHash);assert.equal(health.deploymentBlockHash,binding.chainIdentity.deploymentBlockHash);assert.equal(health.deploymentTransactionHash,binding.chain.deploymentTransactionHash);assert.equal(typeof health.instanceId,'string');assert(health.instanceId);assert(Number.isSafeInteger(health.process.pid)&&health.process.pid>0);assert(/^\d{17,19}$/.test(health.process.startTicks));
}
export function requiresReconnection({binding,health,owner}){validateRestoredChain({binding,health});return owner.pid!==health.process.pid||owner.startTicks!==health.process.startTicks||binding.chainIdentity.instanceId!==health.instanceId;}
export async function retainVerifiedPins(pins,replacedPaths){const kept={};for(const [path,digest]of Object.entries(pins)){assert.equal(hash(await readFile(path)),digest,'A previously approved startup reference changed');if(!replacedPaths.includes(path))kept[path]=digest;}return kept;}
export async function reconnectChain({workspace,bindingPath,health,isApiAbsent,stopOwnedApi}){
 const app=join(workspace,'iilas-fyp'),bindingBytes=await readFile(bindingPath),binding=JSON.parse(bindingBytes);validateRestoredChain({binding,health});
 const {readSparkPreparation,prepareSparkMsi}=await import(pathToFileURL(join(app,'scripts/prepare-spark-msi.mjs'))),{sparkActivationPins,sparkRuntimeActivationDigest}=await import(pathToFileURL(join(app,'scripts/spark-activation.mjs')));
 const old=await readSparkPreparation(binding.preparationPath);assert.deepEqual(observeProcess(health.process.pid),health.process);
 const folder=join(app,'outputs/spark-msi-demo-20261028','durable-reconnect-'+randomUUID());await mkdir(folder);
 const backupRoot=join(binding.durable.directory,'backups',randomUUID());await mkdir(resolve(backupRoot,'..'),{recursive:true});
 if(!await isApiAbsent())await stopOwnedApi();assert(await isApiAbsent());
 const backup=await backupProofTree({root:binding.proofRoot,backupDirectory:backupRoot,rootId:old.serverConfig.evidenceRootId,backendInstanceId:binding.backendInstanceId});
 try{const lockPath=join(binding.proofRoot,'store.lock');await readFile(lockPath);let sidecar;try{sidecar=await readPrivateJson(join(binding.durable.directory,'api-owner.private.json'));}catch(e){if(e.code!=='ENOENT')throw e;}await archiveStaleLock({path:lockPath,archiveDirectory:join(backupRoot,'retired-locks'),isPortAbsent:isApiAbsent,expected:{rootId:old.serverConfig.evidenceRootId,backendInstanceId:binding.backendInstanceId},sidecar});}catch(e){if(e.code!=='ENOENT')throw e;}
 const serving={...old.serving,chainProcessIdentity:health.process};assert.deepEqual(serving.chainBinding,old.serving.chainBinding);await publishJson(join(folder,'serving.private.json'),serving,{exclusive:true});
 const server={...old.serverConfig,servingBindingPath:join(folder,'serving.private.json'),servingBindingSha256:hash(await readFile(join(folder,'serving.private.json')))};await publishJson(join(folder,'server.private.json'),server,{exclusive:true});
 const prepared=await prepareSparkMsi({profilePath:old.receipt.profile.path,serverConfigPath:join(folder,'server.private.json'),outputRoot:join(folder,'launch'),testMode:false}),raw=JSON.parse(await readFile(prepared.path)),candidate=await readSparkPreparation(prepared.path,{allowUnactivated:true});
 assert.deepEqual(candidate.sources,old.sources);assert.deepEqual(candidate.frozenPins,old.frozenPins);assert.deepEqual(candidate.profile,old.profile);assert.deepEqual(candidate.serving.backendEnvironment,old.serving.backendEnvironment);
 const packet={...old.activation,pins:sparkActivationPins(raw,server)};packet.manifestSha256=sparkRuntimeActivationDigest(packet);
 await publishJson(join(folder,'runtime-packet.private.json'),packet,{exclusive:true});await publishJson(join(folder,'runtime-approval.private.json'),{schema:'iilas-spark-cutover-approval-1.0',manifestSha256:packet.manifestSha256,approvedActions:packet.approvedActions,billingMustRemainDisabled:true},{exclusive:true});
 const preparationPath=join(folder,'activated-preparation.private.json'),active={...raw,activation:{packet:{path:join(folder,'runtime-packet.private.json'),sha256:hash(await readFile(join(folder,'runtime-packet.private.json')))},approval:{path:join(folder,'runtime-approval.private.json'),sha256:hash(await readFile(join(folder,'runtime-approval.private.json')))}}};await publishJson(preparationPath,active,{exclusive:true});await readSparkPreparation(preparationPath);
 const previousNgrok=await readPrivateJson(binding.ngrokApproval),ngrokApproval=join(folder,'ngrok-approval.private.json');await publishJson(ngrokApproval,{...previousNgrok,preparationSha256:hash(await readFile(preparationPath)),activationSha256:packet.manifestSha256},{exclusive:true});
 const ownerPath=join(folder,'chain-owner.private.json'),startedAt=new Date(Number((BigInt(health.process.startTicks)-621355968000000000n)/10000n)).toISOString();await publishJson(ownerPath,{pid:health.process.pid,startedAt,startTicks:health.process.startTicks,role:'durable-chain',historyRestored:true},{exclusive:true});
 const kept=await retainVerifiedPins(binding.pins,[binding.preparationPath,binding.chainOwner,binding.ngrokApproval]);const paths=[preparationPath,ownerPath,ngrokApproval];const pins={...kept,...Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(path))])))};
 const next={...binding,preparationPath,chainOwner:ownerPath,chainIdentity:{...binding.chainIdentity,instanceId:health.instanceId},ngrokPreparation:preparationPath,ngrokApproval,pins};
 assert.deepEqual(next.chain,binding.chain);assert.deepEqual(next.walletTransactions,binding.walletTransactions);assert.equal(next.walletVerificationPending,binding.walletVerificationPending);assert.deepEqual(observeProcess(health.process.pid),health.process);assert(await isApiAbsent());
 await retainVerifiedPins(binding.pins,[]);await replaceBinding({target:bindingPath,expectedBytes:bindingBytes,next,backup:join(folder,'binding-before.private.json')});
 await publishJson(join(folder,'recovery.receipt.private.json'),{at:new Date().toISOString(),historyRestored:true,newGeneration:false,chainBindingPreserved:true,sourcePins:Object.keys(old.sources).length,frozenPins:Object.keys(old.frozenPins).length,proofFiles:backup.files,proofBackup:backupRoot,cloudReads:0,cloudWrites:0,hostingDeployment:false});return next;
}
