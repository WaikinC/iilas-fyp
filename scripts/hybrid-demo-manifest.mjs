import {completionExact,completionCanonical} from '../lib/completionWorkflow.js';
import {validateDemoEnvironment} from '../lib/demoEnvironment.js';
import {validateCloudModelBinding} from '../backend/functions/hybridModelBinding.mjs';
import {validateHybridChainBinding,hybridChainHash} from '../backend/functions/hybridIntegrity.mjs';
import {hybridHash} from '../backend/functions/hybridSigning.mjs';
import {validateDemoFixturePlan} from './hybrid-demo-fixture.mjs';
const fail=()=>{throw Error('The separate-project deployment manifest or explicit authorisation is invalid.');};
const secretName='IILAS_GATEWAY_SECRET',limits={maxInstances:2,concurrency:1,minInstances:0};
export const HYBRID_REQUIRED_APIS=Object.freeze(['firebase.googleapis.com','firebasehosting.googleapis.com','cloudfunctions.googleapis.com','run.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','firestore.googleapis.com','storage.googleapis.com','firebasestorage.googleapis.com','identitytoolkit.googleapis.com','securetoken.googleapis.com','iam.googleapis.com','iamcredentials.googleapis.com','secretmanager.googleapis.com']);
export function hybridRuntimeIdentities(project){return {command:`iilas-demo-runtime@${project}.iam.gserviceaccount.com`,proof:`iilas-demo-proof@${project}.iam.gserviceaccount.com`};}
export function hybridPermissionPlan(project,bucket){
 const identities=hybridRuntimeIdentities(project),grant=(identity,role,resource)=>({identity,role,resource});return [grant(identities.command,'roles/datastore.user',`projects/${project}`),grant(identities.command,'roles/firebaseauth.viewer',`projects/${project}`),grant(identities.command,'roles/storage.objectViewer',`buckets/${bucket}`),grant(identities.command,'roles/secretmanager.secretAccessor',`projects/${project}/secrets/${secretName}`),grant(identities.command,'roles/iam.serviceAccountTokenCreator',identities.command),grant(identities.proof,'roles/datastore.viewer',`projects/${project}`),grant(identities.proof,'roles/firebaseauth.viewer',`projects/${project}`),grant(identities.proof,'roles/storage.objectViewer',`buckets/${bucket}`)];
}
export function createHybridManifest({profile,modelBindings,fixturePlan,sourcePins}){
 validateDemoFixturePlan(fixturePlan);
 const environment=validateDemoEnvironment(profile.environment,[profile.environment]),modelBindingsSha256=hybridHash(completionCanonical(modelBindings));validateCloudModelBinding(modelBindings,modelBindingsSha256);
 const value={schema:'iilas-hybrid-deployment-1.0',fixtureOnly:profile.fixtureOnly,environment,firestoreLocation:profile.firestoreLocation,storageLocation:profile.storageLocation,gateway:profile.gateway,chainBinding:validateHybridChainBinding(profile.chainBinding),chainBindingSha256:hybridChainHash(profile.chainBinding),modelBindingsSha256,fixturePlanSha256:hybridHash(completionCanonical(fixturePlan)),sourcePins,secretName,limits,requiredApis:[...HYBRID_REQUIRED_APIS],runtimeIdentities:hybridRuntimeIdentities(environment.projectId),permissions:hybridPermissionPlan(environment.projectId,environment.storageBucket),auth:{initialAdminEmail:'choongkin6@gmail.com',providers:['password'],authorisedDomains:environment.webOrigins.map(o=>new URL(o).hostname)}};
 return validateHybridDeploymentManifest(value);
}
export function validateHybridDeploymentManifest(raw){
 const m=completionExact(raw,['schema','fixtureOnly','environment','firestoreLocation','storageLocation','gateway','chainBinding','chainBindingSha256','modelBindingsSha256','fixturePlanSha256','sourcePins','secretName','limits','requiredApis','runtimeIdentities','permissions','auth']),p=validateDemoEnvironment(m.environment,[m.environment]);
 if(completionCanonical(m.requiredApis)!==completionCanonical([...HYBRID_REQUIRED_APIS]))fail();
 if(m.schema!=='iilas-hybrid-deployment-1.0'||typeof m.fixtureOnly!=='boolean'||p.mode!=='cloud-demo'||!/^asia-[a-z]+[0-9]$/.test(m.firestoreLocation)||p.functionsRegion!==m.firestoreLocation||m.storageLocation!==m.firestoreLocation.toUpperCase()||m.secretName!==secretName||completionCanonical(m.limits)!==completionCanonical(limits)||completionCanonical(m.runtimeIdentities)!==completionCanonical(hybridRuntimeIdentities(p.projectId))||completionCanonical(m.permissions)!==completionCanonical(hybridPermissionPlan(p.projectId,p.storageBucket)))fail();
 if(completionCanonical(m.auth)!==completionCanonical({initialAdminEmail:'choongkin6@gmail.com',providers:['password'],authorisedDomains:p.webOrigins.map(o=>new URL(o).hostname)}))fail();
 const g=completionExact(m.gateway,['provider','origin','route','localTarget']);let u;try{u=new URL(g.origin);}catch{fail();}if(!['ngrok','cloudflare','provided-https'].includes(g.provider)||u.protocol!=='https:'||u.origin!==g.origin||u.username||u.password||u.hostname==='localhost'||u.hostname==='127.0.0.1'||g.route!=='/v1/operation'||g.localTarget!=='http://127.0.0.1:8010')fail();
 if(hybridChainHash(m.chainBinding)!==m.chainBindingSha256||![m.modelBindingsSha256,m.fixturePlanSha256].every(s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s)))fail();
 if(!m.sourcePins||typeof m.sourcePins!=='object'||Array.isArray(m.sourcePins)||Object.keys(m.sourcePins).length<1||Object.entries(m.sourcePins).some(([path,pin])=>!/^[-A-Za-z0-9_./]+$/.test(path)||path.split('/').some(x=>!x||x==='..'||x==='.')||path.startsWith('/')||typeof pin!=='string'||!/^[a-f0-9]{64}$/.test(pin)))fail();return m;
}
export const hybridManifestHash=m=>hybridHash(completionCanonical(validateHybridDeploymentManifest(m)));
export function assertHybridAuthorisation({manifest,approvedSha256,phase,actualProject,authorisedActions=[]}){
 const m=validateHybridDeploymentManifest(manifest);if(m.fixtureOnly||actualProject!==m.environment.projectId||actualProject==='fyp-inventory-and-logistics'||approvedSha256!==hybridManifestHash(m)||!['provision','billing','tunnel','deploy','seed','cloud-tests'].includes(phase)||!Array.isArray(authorisedActions)||!authorisedActions.includes(phase)||phase==='deploy'&&!authorisedActions.includes('billing'))fail();return m;
}
export function assertOwnedFixtureResource({registry,actualProject,manifestSha256,path,sha256,generation}){
 const r=completionExact(registry,['schema','projectId','manifestSha256','resources']),digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 if(r.schema!=='iilas-hybrid-owned-fixtures-1.0'||typeof actualProject!=='string'||!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(actualProject)||actualProject!==r.projectId||actualProject==='fyp-inventory-and-logistics'||!digest(manifestSha256)||manifestSha256!==r.manifestSha256||!digest(sha256)||!Array.isArray(r.resources)||r.resources.length>100||typeof path!=='string')fail();
 const seen=new Set();for(const value of r.resources){const resource=completionExact(value,['kind','path','sha256','generation','retained']);if(!['document','object'].includes(resource.kind)||typeof resource.path!=='string'||!/^[A-Za-z][A-Za-z0-9_-]*\/[A-Za-z0-9_-]+$/.test(resource.path)||seen.has(resource.path)||!digest(resource.sha256)||typeof resource.retained!=='boolean'||(resource.kind==='document'?resource.generation!==null:typeof resource.generation!=='string'||!/^[1-9][0-9]{0,29}$/.test(resource.generation)))fail();seen.add(resource.path);}
 const matches=r.resources.filter(v=>v.path===path);if(matches.length!==1)fail();const resource=matches[0];if(resource.retained!==false||resource.sha256!==sha256||resource.generation!==generation)fail();return resource;
}
