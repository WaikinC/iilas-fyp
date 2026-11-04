import {withHybridIntegrityContext} from './hybridIntegrity.mjs';
import {getFirestore} from 'firebase-admin/firestore';
import {runCustomerTransaction,customerGrantId,customerProof} from './customerAccess.mjs';
import {completionExact,completionIdentifier,completionCanonical} from './completionWorkflow.js';
import {describeIntegritySource,integrityFiles} from './integritySource.mjs';
import {integrityConfiguration,integrityReaderRPC,checkIntegrityConfiguration} from './integrityWorkflow.mjs';
const fail=(message='The current proof is unavailable for this account.',code='permission-denied')=>{throw Object.assign(Error(message),{code});};
const ref=(kind,id)=>getFirestore().collection(kind).doc(id);
export function createCustomerProofIntegrity({rpc=integrityReaderRPC,configuration=integrityConfiguration,files=integrityFiles,clock=Date.now,identity}={}){
 async function capture(auth,input){return runCustomerTransaction(auth,async(tx,scope)=>{
  const grant=(await tx.get(ref('customerShipmentGrants',customerGrantId(scope,auth.uid,input.shipmentId)))).data();if(!grant||grant.ownerId!==scope||grant.customerUid!==auth.uid||grant.shipmentId!==input.shipmentId||grant.active!==true)fail();
  const [s,d,e]=await Promise.all([tx.get(ref('shipments',input.shipmentId)),tx.get(ref('deliveries',input.shipmentId)),tx.get(ref('evidence',input.evidenceId))]),shipment=s.data(),delivery=d.data(),evidence=e.data();
  if(!shipment||shipment.ownerId!==scope||shipment.status!=='Dispatched'||!customerProof({scope,shipmentId:input.shipmentId,delivery,evidenceId:input.evidenceId,evidence}))return {eligible:false};
  const source=describeIntegritySource({scope,kind:'delivery',recordId:input.evidenceId,record:evidence});return {eligible:source.eligibility.eligible,source,fingerprint:completionCanonical({grantVersion:grant.version,shipmentVersion:shipment.version,deliveryVersion:delivery.version,proofId:delivery.proofId,source})};
 },identity);}
 async function checkCustomerProofIntegrity(auth,raw){const input=completionExact(raw,['shipmentId','evidenceId']);completionIdentifier(input.shipmentId);completionIdentifier(input.evidenceId);const first=await capture(auth,input);let outcome='Unavailable',config=null,configKey=null;
  try{config=checkIntegrityConfiguration(configuration());configKey=completionCanonical(config);}catch{/* Missing configured current deployment is unavailable, never a match. */}
  if(first.eligible&&config){let timer;try{outcome=await withHybridIntegrityContext({actor:auth.uid,scope:first.source.snapshot.ownerId},()=>Promise.race([(async()=>{const before=await rpc.inspect(config);if(before.chainId!==config.chainId||before.runtimeCodeSha256!==config.runtimeCodeSha256||before.deploymentTransactionHash!==config.deploymentTransactionHash||config.deploymentGeneration&&before.deploymentGeneration!==config.deploymentGeneration||!Number.isSafeInteger(before.blockNumber)||before.blockNumber<config.deploymentBlock)return 'Unavailable';const file=await files.digest(first.source);if(file.sha256!==first.source.snapshot.file.sha256||file.bytes!==first.source.snapshot.file.bytes)return 'Unmatched';const digest=await rpc.lookup(config,first.source);if(digest!==null&&!/^[a-f0-9]{64}$/.test(digest))return 'Unavailable';const after=await rpc.inspect(config);if(after.chainId!==before.chainId||after.runtimeCodeSha256!==before.runtimeCodeSha256||after.deploymentTransactionHash!==before.deploymentTransactionHash||after.blockNumber<before.blockNumber||config.deploymentGeneration&&after.deploymentGeneration!==config.deploymentGeneration)return 'Unavailable';return digest===null?'NotRegistered':digest===first.source.digest?'Verified':'Unmatched';})(),new Promise(resolve=>{timer=setTimeout(()=>resolve('Unavailable'),15000);})]));}catch{outcome='Unavailable';}finally{clearTimeout(timer);}}
  const last=await capture(auth,input);if(!last.eligible||last.fingerprint!==first.fingerprint)outcome='Unavailable';try{if(configKey!==completionCanonical(checkIntegrityConfiguration(configuration())))outcome='Unavailable';}catch{outcome='Unavailable';}
  return {shipmentId:input.shipmentId,evidenceId:input.evidenceId,outcome,checkedAtMs:clock()};
 }
 return {checkCustomerProofIntegrity};
}
