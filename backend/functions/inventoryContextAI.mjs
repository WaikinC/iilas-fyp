import {createHash} from 'node:crypto';
import {readFileSync,lstatSync} from 'node:fs';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInventoryExperimentLifecycle,assertInventoryLocalEmulators as localOnly} from './inventoryExperimentLifecycle.mjs';
import {validateContextExperimentInput,INVENTORY_CONTEXT_PROTOCOL,INVENTORY_CONTEXT_FEATURES,INVENTORY_CONTEXT_CLASSES,INVENTORY_CONTEXT_PROVENANCE} from './inventoryContextAI.js';
import {canonicalInventoryAI} from './inventoryAI.js';
import {readCloudModelConfiguration} from './hybridModelBinding.mjs';

const ROOT=fileURLToPath(new globalThis.URL('../../',import.meta.url)),URL='http://127.0.0.1:8001';
const HASH=/^[0-9a-f]{64}$/;
export const SOURCE_FILES=Object.freeze(["research/inventory_context_inference.py", "research/serve_inventory_context_local_eval.py", "research/runner_runtime.py", "research/inventory_inference.py", "lib/inventoryAI.js", "backend/functions/inventoryAI.js", "lib/inventoryContextAI.js", "backend/functions/inventoryContextAI.js", "backend/functions/inventoryContextAI.mjs", "backend/functions/inventoryAI.mjs", "backend/functions/service.mjs", "lib/inventoryContextAIClient.js", "lib/inventoryAIClient.js", "src/features/stock/InventoryAIExperiment.tsx", "src/features/stock/InventoryRisk.tsx", "backend/functions/inventoryExperimentLifecycle.mjs", "backend/functions/inventoryDemoProductAI.mjs", "lib/inventoryStockAIClient.js", "src/features/stock/StockManagement.tsx", "scripts/prepare-inventory-ai-local.mjs", "lib/inventoryDemoReorder.js", "backend/functions/inventoryDemoReorder.js", "backend/functions/inventoryDemoProductFacts.mjs", "backend/functions/inventoryDemoReorder.mjs", "lib/inventoryDemoReorderClient.js", "src/features/stock/InventoryDemoReorder.tsx", "src/features/operations/Procurement.tsx", "lib/inventoryDemoProcurement.js", "backend/functions/inventoryDemoProcurement.js", "backend/functions/inventoryDemoProcurement.mjs", "backend/functions/purchaseOrderWorkflow.mjs", "lib/inventoryDemoProcurementClient.js", "src/features/operations/InventoryDemoProcurement.tsx", "lib/procurementValidation.js", "backend/functions/procurementValidation.js", "lib/locationStock.js", "backend/functions/locationStock.js", "backend/functions/access.mjs", "src/features/stock/stock.css", "research/inventory_context_runtime.py", "lib/accountRoles.js", "backend/functions/accountRoles.js", "lib/completionWorkflow.js", "backend/functions/completionWorkflow.js", "lib/completionClient.js", "backend/functions/completionOperations.mjs", "lib/integrityWorkflow.js", "backend/functions/integrityWorkflow.js", "backend/functions/integrityWorkflow.mjs", "backend/functions/integritySource.mjs", "lib/integrityRegistrationClient.js", "src/features/operations/IntegrityVerification.tsx", "lib/transportPlanning.js", "backend/functions/transportPlanning.js", "backend/functions/fleetTransport.mjs", "src/features/operations/operationsData.tsx", "src/features/operations/FleetManagement.tsx", "src/features/operations/TransportManagement.tsx", "src/features/operations/TransportPlanningMap.tsx", "backend/functions/customerAccess.mjs", "backend/functions/customerEvidence.mjs", "lib/customerPortal.js", "src/features/customer/CustomerPortal.tsx", "src/features/customer/customer.css", "src/features/operations/CustomerShipmentAccess.tsx", "src/features/workspace/WorkspaceGate.tsx", "src/features/workspace/AdminPanel.tsx", "lib/reporting.js", "backend/functions/reporting.js", "backend/functions/reporting.mjs", "lib/catalogueFilters.js", "src/features/operations/ReportExplorer.tsx", "src/features/operations/ReportsWorkspace.tsx", "src/features/operations/ResearchVerification.tsx", "src/features/operations/Operations.tsx", "src/features/operations/operations.css", "app/page.tsx", "backend/functions/index.mjs", "firestore.rules", "firestore.indexes.json", "storage.rules", "scripts/prepare-functions.mjs", "scripts/prepare-fyp-completion-local.mjs", "lib/reportResponse.js", "src/features/operations/EvidenceFileComparison.tsx", "lib/mobileDelivery.js", "backend/functions/mobileDelivery.js", "backend/functions/mobileDelivery.mjs", "backend/functions/mobileEvidence.mjs", "backend/functions/deliveryWorkflow.mjs", "backend/functions/evidenceRegistration.mjs", "lib/demoEnvironment.js", "backend/functions/demoEnvironment.js", "backend/functions/demoEnvironment.mjs", "lib/hybridGateway.js", "backend/functions/hybridGateway.js", "backend/functions/hybridGateway.mjs", "backend/functions/hybridSigning.mjs", "backend/functions/hybridModelBinding.mjs", "lib/firebaseRuntime.js", "lib/firebase.js", "lib/workspace.js", "tools/msi-gateway/models.mjs", "tools/msi-gateway/authentication.mjs", "tools/msi-gateway/server.mjs", "backend/functions/hybridIntegrity.mjs", "src/main.tsx", "tools/msi-gateway/integrity.mjs", "tools/msi-gateway/launch.mjs"]);
const DATA='research/datasets/inventory-simulation-v2/';
const FROZEN={
 'main-01/manifest.json':'06b22b1c46e4d0c6dba6439abe4a00363c36be4424062fa678b5a34efd84d414',
 'development-01/final-RF14.joblib':'43b5641f6cd6cb045fd6f9ff06463f2e51c9dc759b84dbfa25b041a3942850d0',
 'development-01/development.json':'0f86cc4f9751f69618c97d8b7e768f0482b079fd0c18a65df7d2c85b18cc834e',
 'evaluation-01/evaluation.json':'aaddf205d243c7481e9fbd602832c3cbc8df682e6d4a2a17bbc0629258b67fd6',
 'registry/context-v2-main-01-preparation-complete.json':'99af6cd8d7541488295709a7fca16be0fee8182a944dfecf6742816649534ec2',
 'registry/context-v2-main-01-development-complete.json':'0eb1350894bd9d4b4f66364d6dd98755cfd0af455b5dcc8cedb2b6c9cfa440cc',
 'registry/context-v2-main-01-evaluation-complete.json':'846a30cf4a301fd695e6dd9dab17c6575b61cee7050239dbb91d969223aa4a5a',
};
const MODEL_SPEC={arm:'RF14',depth:12,features:'context',leaf:2};
const fail=(message,code='failed-precondition')=>{throw Object.assign(new Error(message),{code});};
const digest=value=>createHash('sha256').update(value).digest('hex');
const hash=value=>digest(canonicalInventoryAI(value));
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw Error('Invalid stock metadata.');}
function checkedPath(value,dataOnly=false){
 if(typeof value!=='string'||!value||/[\x00-\x1f\x7f]/.test(value)||value.split(/[\\/]/).includes('..'))throw Error('Invalid stock metadata path.');
 const path=resolve(ROOT,value),base=dataOnly?resolve(ROOT,'research/datasets'):resolve(ROOT),rel=relative(base,path);
 if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Stock metadata path is outside its local area.');
 let current=ROOT;
 for(const part of relative(ROOT,path).split(/[\\/]/)){current=join(current,part);if(lstatSync(current).isSymbolicLink())throw Error('Linked stock metadata refused.');}
 return path;
}
function bytes(path,cap=8*1024*1024,pin){
 const stat=lstatSync(path);if(!stat.isFile()||stat.nlink!==1||stat.size<1||stat.size>cap)throw Error('Context metadata size/link invalid.');
 const blob=readFileSync(path);if(blob.length>cap||pin&&digest(blob)!==pin)throw Error('Context metadata hash differs.');return blob;
}
const equal=(a,b)=>canonicalInventoryAI(a)===canonicalInventoryAI(b);
export function readInventoryContextConfiguration(){
 if(process.env.IILAS_DEMO_MODE==='cloud-demo')return readCloudModelConfiguration('stock');
 try{
  localOnly();const env=process.env,token=env.IILAS_STOCK_API_TOKEN,pin=env.IILAS_STOCK_MANIFEST_SHA256;
  if(env.IILAS_STOCK_API_URL!==URL||typeof token!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(token)||!HASH.test(pin||''))throw Error('Incomplete context settings.');
  const path=checkedPath(env.IILAS_STOCK_MANIFEST_PATH,true),m=JSON.parse(bytes(path,65536,pin));
  if(!relative(resolve(ROOT,'research/datasets/inventory-context-serving-v2'),path)||relative(resolve(ROOT,'research/datasets/inventory-context-serving-v2'),path).startsWith('..'))throw Error('Wrong context manifest area.');
  exact(m,['schema','protocol','dataset','development','evaluation','model','versions','features','classOrder','ranges','metrics','scientificBasis','sourcePins',...Object.keys(INVENTORY_CONTEXT_PROVENANCE)]);
  if(m.schema!=='inventory-context-local-serving-2.0'||m.protocol!==INVENTORY_CONTEXT_PROTOCOL||!equal(m.features,INVENTORY_CONTEXT_FEATURES)||!equal(m.classOrder,INVENTORY_CONTEXT_CLASSES))throw Error('Context schema differs.');
  for(const [k,v] of Object.entries(INVENTORY_CONTEXT_PROVENANCE))if(m[k]!==v)throw Error('Context provenance differs.');
  exact(m.sourcePins,SOURCE_FILES);
  for(const name of SOURCE_FILES){if(!HASH.test(m.sourcePins[name]))throw Error('Invalid source hash.');bytes(checkedPath(name),8*1024*1024,m.sourcePins[name]);}
  const frozen={};
  for(const [name,expected] of Object.entries(FROZEN)){const blob=bytes(checkedPath(DATA+name,true),name.endsWith('.joblib')?10*1024*1024:8*1024*1024,expected);if(name.endsWith('.json'))frozen[name]=JSON.parse(blob);}
  const source=frozen['main-01/manifest.json'],development=frozen['development-01/development.json'],evaluation=frozen['evaluation-01/evaluation.json'];
  const basis=source.basis;
  if(!equal(m.scientificBasis,basis)||!equal(m.versions,basis.versions)||!equal(development.basis,basis)||!equal(basis.features14,INVENTORY_CONTEXT_FEATURES))throw Error('Context scientific basis differs.');
  for(const [name,expected] of Object.entries(basis.source_pins)){if(name==='original_inventory_report')continue;bytes(checkedPath(name),8*1024*1024,expected);}
  for(const phase of ['preparation','development','evaluation']){const c=frozen[`registry/context-v2-main-01-${phase}-complete.json`],n=c.receipt.native;if(c.phase!==phase||n.status!=='success'||n.returncode!==0||n.cleanup_confirmed!==true)throw Error('Context phase incomplete.');}
  for(const [key,name] of Object.entries({dataset:'main-01/manifest.json',development:'registry/context-v2-main-01-development-complete.json',evaluation:'registry/context-v2-main-01-evaluation-complete.json'}))if(!equal(m[key],{path:DATA+name,sha256:FROZEN[name]}))throw Error('Context reference differs.');
  if(!equal(m.model,{path:DATA+'development-01/final-RF14.joblib',sha256:FROZEN['development-01/final-RF14.joblib'],spec:MODEL_SPEC})||!equal(development.selected.RF14,MODEL_SPEC))throw Error('Selected context model differs.');
  const dc=frozen['registry/context-v2-main-01-development-complete.json'],ec=frozen['registry/context-v2-main-01-evaluation-complete.json'];
  if(dc.files['development.json']!==FROZEN['development-01/development.json']||dc.files['final-RF14.joblib']!==FROZEN['development-01/final-RF14.joblib']||ec.files['evaluation.json']!==FROZEN['evaluation-01/evaluation.json'])throw Error('Context completion differs.');
  const job=JSON.parse(bytes(checkedPath(DATA+'development-01/final-RF14.job.json',true),8*1024*1024,dc.files['final-RF14.job.json']));
  if(!equal(job.spec,MODEL_SPEC)||!equal(job.features,INVENTORY_CONTEXT_FEATURES)||!Array.isArray(job.x_train)||job.x_train.length!==2880)throw Error('Context development input differs.');
  const ranges=Object.fromEntries(INVENTORY_CONTEXT_FEATURES.map((k,i)=>[k,{min:Math.min(...job.x_train.map(row=>row[i])),max:Math.max(...job.x_train.map(row=>row[i]))}]));
  if(!equal(m.ranges,ranges))throw Error('Context development ranges differ.');
  const rf=evaluation.metrics.RF14,critical=rf.per_class['Critical Stock Risk'];
  const metrics={accuracy:rf.accuracy,macroF1:rf.macro_f1,criticalPrecision:critical.precision,criticalRecall:critical.recall,observations:720,families:60,accuracyInterval:evaluation.bootstrap.intervals.RF14.accuracy,origin:'AI-authored synthetic policy'};
  if(evaluation.rows!==720||evaluation.families!==60||!equal(m.metrics,metrics))throw Error('Context evaluation disclosure differs.');
  const expected={modelSha256:m.model.sha256,servingManifestSha256:pin,datasetSha256:m.dataset.sha256,developmentSha256:m.development.sha256,evaluationSha256:m.evaluation.sha256,ranges};
  return {url:URL,token,expected,metrics,fingerprint:hash({url:URL,path,manifestSha256:pin,tokenSha256:digest(token)})};
 }catch{fail('Context stock AI configuration is unavailable. Recover existing work or check the local serving profile.','unavailable');}
}

export function createInventoryContextCommands(options={}){
 const lifecycle=createInventoryExperimentLifecycle({configuration:readInventoryContextConfiguration,...options,definition:{collection:'inventoryContextAIRequests',action:'inventoryContextExperiment',auditPrefix:'inventoryContextAI_',version:2,validateInput:validateContextExperimentInput}});
 return {startInventoryContextExperiment:lifecycle.start,resolveInventoryContextExperiment:lifecycle.resolve};
}
const commands=createInventoryContextCommands();
export const startInventoryContextExperiment=(...args)=>commands.startInventoryContextExperiment(...args);
export const resolveInventoryContextExperiment=(...args)=>commands.resolveInventoryContextExperiment(...args);
