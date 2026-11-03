import {readFileSync,lstatSync} from 'node:fs';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDeliveryLifecycle} from './deliveryDemoLifecycle.mjs';
import {DELIVERY_PROTOCOL,DELIVERY_FEATURES,DELIVERY_CLASSES,DELIVERY_PROVENANCE} from './deliveryRiskDemo.js';
import {deliveryHash} from './deliveryDemoSource.mjs';
import {readCloudModelConfiguration} from './hybridModelBinding.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const DELIVERY_SOURCE_FILES=Object.freeze(["research/delivery_demo_inference.py", "research/serve_delivery_demo_local_eval.py", "research/runner_runtime.py", "research/inventory_context_runtime.py", "research/inventory_inference.py", "lib/deliveryRiskDemo.js", "backend/functions/deliveryRiskDemo.js", "backend/functions/deliveryDemoSource.mjs", "backend/functions/deliveryDemoLifecycle.mjs", "backend/functions/deliveryDemoAI.mjs", "backend/functions/service.mjs", "backend/functions/access.mjs", "lib/deliveryRiskDemoClient.js", "src/features/operations/DeliveryRiskDemo.tsx", "src/features/operations/Operations.tsx", "src/features/operations/deliverySignals.ts", "src/features/operations/operations.css", "src/features/operations/ResearchVerification.tsx", "firestore.rules", "firestore.indexes.json", "scripts/prepare-delivery-ai-local.mjs", "scripts/prepare-inventory-ai-local.mjs", "scripts/prepare-functions.mjs", "lib/accountRoles.js", "backend/functions/accountRoles.js", "lib/completionWorkflow.js", "backend/functions/completionWorkflow.js", "lib/completionClient.js", "backend/functions/completionOperations.mjs", "lib/integrityWorkflow.js", "backend/functions/integrityWorkflow.js", "backend/functions/integrityWorkflow.mjs", "backend/functions/integritySource.mjs", "lib/integrityRegistrationClient.js", "src/features/operations/IntegrityVerification.tsx", "lib/transportPlanning.js", "backend/functions/transportPlanning.js", "backend/functions/fleetTransport.mjs", "src/features/operations/operationsData.tsx", "src/features/operations/FleetManagement.tsx", "src/features/operations/TransportManagement.tsx", "src/features/operations/TransportPlanningMap.tsx", "backend/functions/customerAccess.mjs", "backend/functions/customerEvidence.mjs", "lib/customerPortal.js", "src/features/customer/CustomerPortal.tsx", "src/features/customer/customer.css", "src/features/operations/CustomerShipmentAccess.tsx", "src/features/workspace/WorkspaceGate.tsx", "src/features/workspace/AdminPanel.tsx", "lib/reporting.js", "backend/functions/reporting.js", "backend/functions/reporting.mjs", "lib/catalogueFilters.js", "src/features/operations/ReportExplorer.tsx", "src/features/operations/ReportsWorkspace.tsx", "app/page.tsx", "backend/functions/index.mjs", "storage.rules", "scripts/prepare-fyp-completion-local.mjs", "lib/reportResponse.js", "src/features/operations/EvidenceFileComparison.tsx", "lib/mobileDelivery.js", "backend/functions/mobileDelivery.js", "backend/functions/mobileDelivery.mjs", "backend/functions/mobileEvidence.mjs", "backend/functions/deliveryWorkflow.mjs", "backend/functions/evidenceRegistration.mjs", "lib/demoEnvironment.js", "backend/functions/demoEnvironment.js", "backend/functions/demoEnvironment.mjs", "lib/hybridGateway.js", "backend/functions/hybridGateway.js", "backend/functions/hybridGateway.mjs", "backend/functions/hybridSigning.mjs", "backend/functions/hybridModelBinding.mjs", "lib/firebaseRuntime.js", "lib/firebase.js", "lib/workspace.js", "tools/msi-gateway/models.mjs", "tools/msi-gateway/authentication.mjs", "tools/msi-gateway/server.mjs", "backend/functions/hybridIntegrity.mjs", "src/main.tsx", "tools/msi-gateway/integrity.mjs", "tools/msi-gateway/launch.mjs"]);
const FROZEN={"manifest.json": "be2bd72da306b1e1d1de73f9cb8beb22e0e952565d4e3a207d085eee2418bbda", "development.json": "919c038ef689078471ed8071070f262981657b6f60a406e5c6a391ab090ad6b8", "evaluation.json": "7d0f751bb784a85517757289923430082a0c9bbb5d71e121b825395abe7381cb", ".joblib": "fddad08e87facde391a3acca68ad3da92579577e9a30bc3396759c01fce3527b"};

export function deliveryConfiguration(){
 if(process.env.IILAS_DEMO_MODE==='cloud-demo')return readCloudModelConfiguration('delivery');
 if(process.env.IILAS_DELIVERY_DEMO_MODE!=='simulated')return null;
 try{
  const url=process.env.IILAS_DELIVERY_API_URL,token=process.env.IILAS_DELIVERY_API_TOKEN,path=process.env.IILAS_DELIVERY_MANIFEST_PATH,pin=process.env.IILAS_DELIVERY_MANIFEST_SHA256;
  if(url!=='http://127.0.0.1:8002'||!token||!/^[A-Za-z0-9_-]{43}$/.test(token)||!path||! /^[a-f0-9]{64}$/.test(pin))return null;
  const p=resolve(path),base=resolve(ROOT,'research/datasets/delivery-demo-serving-v1'),rel=relative(base,p);if(!rel||rel.startsWith('..')||isAbsolute(rel))return null;
  let current=ROOT;for(const part of relative(ROOT,p).split(/[\\/]/)){current=join(current,part);if(lstatSync(current).isSymbolicLink())return null;}
  const stat=lstatSync(p);if(!stat.isFile()||stat.nlink!==1||stat.size>65536)return null;
  const blob=readFileSync(p);if(deliveryHash(blob.toString())!==pin)return null;const m=JSON.parse(blob);
  if(m.protocol!==DELIVERY_PROTOCOL||JSON.stringify(m.features)!==JSON.stringify(DELIVERY_FEATURES)||JSON.stringify(m.classes)!==JSON.stringify(DELIVERY_CLASSES)||m.model.sha256!==FROZEN['.joblib']||m.dataset.sha256!==FROZEN['manifest.json']||m.development.sha256!==FROZEN['development.json']||m.evaluation.sha256!==FROZEN['evaluation.json'])return null;
  for(const [k,v]of Object.entries(DELIVERY_PROVENANCE))if(m.provenance[k]!==v)return null;
  if(JSON.stringify(Object.keys(m.sourcePins).sort())!==JSON.stringify([...DELIVERY_SOURCE_FILES].sort()))return null;
  for(const file of DELIVERY_SOURCE_FILES)if(deliveryHash(readFileSync(resolve(ROOT,file)).toString())!==m.sourcePins[file])return null;
  const expected={modelSha256:m.model.sha256,datasetSha256:m.dataset.sha256,developmentSha256:m.development.sha256,evaluationSha256:m.evaluation.sha256,servingManifestSha256:pin,ranges:m.ranges};
  return {url,token,expected,metrics:m.metrics,fingerprint:deliveryHash({url,token,path:p,pin,expected})};
 }catch{return null;}
}
export function createDeliveryDemoCommands(options={}){return createDeliveryLifecycle({configuration:deliveryConfiguration,...options});}
const handlers=createDeliveryDemoCommands();
export const getDeliveryDemoContext=(...a)=>handlers.getDeliveryDemoContext(...a);
export const startDeliveryDemoExperiment=(...a)=>handlers.startDeliveryDemoExperiment(...a);
export const resolveDeliveryDemoExperiment=(...a)=>handlers.resolveDeliveryDemoExperiment(...a);
export const captureDeliveryAbnormality=(...a)=>handlers.captureDeliveryAbnormality(...a);
export const resolveDeliveryAbnormality=(...a)=>handlers.resolveDeliveryAbnormality(...a);
export const reviewDeliveryRisk=(...a)=>handlers.reviewDeliveryRisk(...a);
export const resolveDeliveryRiskReview=(...a)=>handlers.resolveDeliveryRiskReview(...a);
