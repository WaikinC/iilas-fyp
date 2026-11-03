import {readFileSync} from 'node:fs';
import {completionExact,completionCanonical} from './completionWorkflow.js';
import {trustedDemoEnvironment} from './demoEnvironment.mjs';
import {hybridHash,assertHybridSecret} from './hybridSigning.mjs';
import {INVENTORY_CONTEXT_FEATURES,INVENTORY_CONTEXT_PROVENANCE} from './inventoryContextAI.js';
import {DELIVERY_FEATURES,DELIVERY_PROVENANCE} from './deliveryRiskDemo.js';
const fail=()=>{throw Object.assign(Error('Frozen cloud model bindings are unavailable.'),{code:'unavailable'});};
const hash=/^[a-f0-9]{64}$/;
const metricPins={stock:'b475a53ec39c3c8af9452cb99dca994ca76d0918a7fdce20378176a12d6b9fbd',delivery:'214b8e522c72c0eb5785e76659b4cd4c325c1a7547f06b47b712d484cef54d88'};
const pins={stock:{modelSha256:'43b5641f6cd6cb045fd6f9ff06463f2e51c9dc759b84dbfa25b041a3942850d0',datasetSha256:'06b22b1c46e4d0c6dba6439abe4a00363c36be4424062fa678b5a34efd84d414',developmentSha256:'0eb1350894bd9d4b4f66364d6dd98755cfd0af455b5dcc8cedb2b6c9cfa440cc',evaluationSha256:'846a30cf4a301fd695e6dd9dab17c6575b61cee7050239dbb91d969223aa4a5a'},delivery:{modelSha256:'fddad08e87facde391a3acca68ad3da92579577e9a30bc3396759c01fce3527b',datasetSha256:'be2bd72da306b1e1d1de73f9cb8beb22e0e952565d4e3a207d085eee2418bbda',developmentSha256:'919c038ef689078471ed8071070f262981657b6f60a406e5c6a391ab090ad6b8',evaluationSha256:'7d0f751bb784a85517757289923430082a0c9bbb5d71e121b825395abe7381cb'}};
export function validateCloudModelBinding(raw,pin){
 try{
  const b=completionExact(raw,['schema','stock','delivery','sourceManifestSha256']);if(b.schema!=='iilas-cloud-model-binding-1.0'||!hash.test(b.sourceManifestSha256)||hybridHash(completionCanonical(b))!==pin)fail();
  for(const kind of ['stock','delivery']){
   const m=completionExact(b[kind],['expected','metrics','provenance']),e=completionExact(m.expected,['modelSha256','servingManifestSha256','datasetSha256','developmentSha256','evaluationSha256','ranges']);
   if(Object.entries(pins[kind]).some(([k,v])=>e[k]!==v)||!hash.test(e.servingManifestSha256))fail();
   if(completionCanonical(m.provenance)!==completionCanonical(kind==='stock'?INVENTORY_CONTEXT_PROVENANCE:DELIVERY_PROVENANCE))fail();
   const features=kind==='stock'?INVENTORY_CONTEXT_FEATURES:DELIVERY_FEATURES;completionExact(e.ranges,[...features]);
   for(const feature of features){const r=completionExact(e.ranges[feature],['min','max']);if(!Number.isFinite(r.min)||!Number.isFinite(r.max)||r.min>r.max)fail();}
   // Metadata is copied only from a verified serving binding; pin the disclosed result too.
   if(hybridHash(completionCanonical(m.metrics))!==metricPins[kind])fail();
  }
  return b;
 }catch{fail();}
}
export function readHybridRuntime(){
 try{const bytes=readFileSync(new URL('./hybrid-runtime.json',import.meta.url));if(bytes.length>16384)fail();return JSON.parse(bytes.toString('utf8'));}catch{fail();}
}
export function exportCloudModelBinding({stock,delivery}){
 const verified={stock:stock(),delivery:delivery()};
 const binding={schema:'iilas-cloud-model-binding-1.0',stock:{expected:verified.stock.expected,metrics:verified.stock.metrics,provenance:INVENTORY_CONTEXT_PROVENANCE},delivery:{expected:verified.delivery.expected,metrics:verified.delivery.metrics,provenance:DELIVERY_PROVENANCE},sourceManifestSha256:hybridHash(completionCanonical({stock:verified.stock.expected.servingManifestSha256,delivery:verified.delivery.expected.servingManifestSha256}))};
 const sha256=hybridHash(completionCanonical(binding));return {binding:validateCloudModelBinding(binding,sha256),sha256};
}
export function readCloudModelConfiguration(kind,profile=trustedDemoEnvironment()){
 if(!Object.hasOwn(pins,kind)||profile.mode!=='cloud-demo')fail();const raw=readHybridRuntime(),bindings=validateCloudModelBinding(raw.modelBindings,raw.modelBindingsSha256);assertHybridSecret(process.env.IILAS_GATEWAY_SECRET);
 if(completionCanonical(raw.profile)!==completionCanonical(profile))fail();
 const {expected,metrics}=bindings[kind],transportProfile={environment:profile,gatewayOrigin:raw.gatewayOrigin},bindingSha256=raw.modelBindingsSha256;
 return {mode:'hybrid',kind,expected,metrics,transportProfile,bindingSha256,fingerprint:hybridHash(completionCanonical({kind,expected,metrics,transportProfile,bindingSha256,secretSha256:hybridHash(process.env.IILAS_GATEWAY_SECRET)}))};
}
