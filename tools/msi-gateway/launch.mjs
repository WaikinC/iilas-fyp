import {readFile,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {completionExact,completionCanonical} from '../../lib/completionWorkflow.js';
import {HYBRID_LIMITS} from '../../lib/hybridGateway.js';
import {assertHybridSecret,hybridHash} from '../../backend/functions/hybridSigning.mjs';
import {validateCloudModelBinding} from '../../backend/functions/hybridModelBinding.mjs';
import {validateHybridChainBinding} from '../../backend/functions/hybridIntegrity.mjs';
import {SOURCE_FILES,readInventoryContextConfiguration} from '../../backend/functions/inventoryContextAI.mjs';
import {DELIVERY_SOURCE_FILES,deliveryConfiguration} from '../../backend/functions/deliveryDemoAI.mjs';
import {localIntegrityRPC} from '../../backend/functions/integrityWorkflow.mjs';
import {createModelHandlers} from './models.mjs';
import {createIntegrityHandlers} from './integrity.mjs';
import {createGatewayServer} from './server.mjs';
import {createGatewayAuthenticator} from './authentication.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),BASE=resolve(ROOT,'outputs/hybrid-demo-20261027');
const fail=()=>{throw Error('The private source-bound MSI gateway profile is unavailable.');};
export const GATEWAY_SOURCE_FILES=Object.freeze([...new Set([...SOURCE_FILES,...DELIVERY_SOURCE_FILES,'tools/msi-gateway/launch.mjs','tools/msi-gateway/integrity.mjs'])].sort());
export function validateGatewayProfile(raw){
 const p=completionExact(raw,['schema','fixtureOnly','projectId','secret','stockToken','deliveryToken','stockManifest','deliveryManifest','modelBindings','modelBindingsSha256','chainBinding','chainProcessIdentity','sourcePins']);
 if(p.schema!=='iilas-msi-gateway-profile-1.0'||typeof p.fixtureOnly!=='boolean'||!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(p.projectId)||p.projectId==='fyp-inventory-and-logistics'||![p.stockToken,p.deliveryToken].every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v)))fail();
 assertHybridSecret(p.secret);validateCloudModelBinding(p.modelBindings,p.modelBindingsSha256);
 for(const name of ['stockManifest','deliveryManifest']){const b=completionExact(p[name],['path','sha256']);if(typeof b.path!=='string'||!/^[a-f0-9]{64}$/.test(b.sha256))fail();}
 if(p.chainBinding!==null){validateHybridChainBinding(p.chainBinding);const c=completionExact(p.chainProcessIdentity,['pid','startTicks']);if(!Number.isSafeInteger(c.pid)||c.pid<1||!/^\d{17,19}$/.test(c.startTicks))fail();}else if(p.chainProcessIdentity!==null)fail();
 if(completionCanonical(Object.keys(p.sourcePins).sort())!==completionCanonical([...GATEWAY_SOURCE_FILES])||Object.values(p.sourcePins).some(v=>typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v)))fail();return p;
}
async function checkedFile(value,base){
 const p=resolve(ROOT,value),rel=relative(base,p);if(!rel||rel.startsWith('..')||isAbsolute(rel))fail();let current=ROOT;
 for(const part of relative(ROOT,p).split(/[\\/]/)){current=join(current,part);const s=await lstat(current);if(s.isSymbolicLink()||s.isFile()&&s.nlink!==1)fail();}const s=await lstat(p);if(!s.isFile()||s.size>4*1024*1024)fail();return p;
}
export async function captureGatewaySourcePins(){return Object.fromEntries(await Promise.all(GATEWAY_SOURCE_FILES.map(async name=>[name,hybridHash(await readFile(await checkedFile(name,ROOT)))])));}
export async function loadGatewayProfile(path){
 const p=validateGatewayProfile(JSON.parse(await readFile(await checkedFile(path,BASE),'utf8')));
 if(completionCanonical(p.sourcePins)!==completionCanonical(await captureGatewaySourcePins()))fail();
 for(const [key,folder]of [['stockManifest','inventory-context-serving-v2'],['deliveryManifest','delivery-demo-serving-v1']]){const b=p[key],path=await checkedFile(b.path,resolve(ROOT,'research/datasets',folder));if(hybridHash(await readFile(path))!==b.sha256)fail();}
 return p;
}
export async function launchGateway(path){
 const p=await loadGatewayProfile(path);
 // This dedicated process uses existing local-only metadata readers. It exposes no Firebase commands.
 delete process.env.IILAS_DEMO_MODE;
 Object.assign(process.env,{FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'fyp-inventory-and-logistics',GOOGLE_CLOUD_PROJECT:'fyp-inventory-and-logistics',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',IILAS_FYP_COMPLETION_MODE:'local-demo',IILAS_STOCK_API_URL:'http://127.0.0.1:8001',IILAS_STOCK_API_TOKEN:p.stockToken,IILAS_STOCK_MANIFEST_PATH:resolve(ROOT,p.stockManifest.path),IILAS_STOCK_MANIFEST_SHA256:p.stockManifest.sha256,IILAS_DELIVERY_DEMO_MODE:'simulated',IILAS_DELIVERY_API_URL:'http://127.0.0.1:8002',IILAS_DELIVERY_API_TOKEN:p.deliveryToken,IILAS_DELIVERY_MANIFEST_PATH:resolve(ROOT,p.deliveryManifest.path),IILAS_DELIVERY_MANIFEST_SHA256:p.deliveryManifest.sha256});
 const configuration=kind=>{const c=kind==='stock'?readInventoryContextConfiguration():deliveryConfiguration(),expected=p.modelBindings[kind];if(!c||completionCanonical(c.expected)!==completionCanonical(expected.expected)||completionCanonical(c.metrics)!==completionCanonical(expected.metrics))fail();return c;};
 const models=createModelHandlers({bindingSha256:p.modelBindingsSha256,stockConfiguration:()=>configuration('stock'),deliveryConfiguration:()=>configuration('delivery')}),chain=p.chainBinding?createIntegrityHandlers({configuration:()=>({chain:p.chainBinding,processIdentity:p.chainProcessIdentity}),rpc:localIntegrityRPC}):{};
 const server=createGatewayServer({authenticate:createGatewayAuthenticator({secret:p.secret,projectId:p.projectId}),handlers:{...models,...chain}});
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(HYBRID_LIMITS.port,'127.0.0.1',done);});console.log(JSON.stringify({listening:'127.0.0.1:'+HYBRID_LIMITS.port,projectId:p.projectId,fixtureOnly:p.fixtureOnly,publicTunnel:false,parcelEnabled:false}));return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const index=process.argv.indexOf('--profile');if(index<0){console.error('An ignored gateway profile is required.');process.exitCode=1;}else launchGateway(process.argv[index+1]).catch(()=>{console.error('The MSI gateway refused its profile or loopback port; no credentials were printed.');process.exitCode=1;});}
