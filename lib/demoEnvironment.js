const fail=()=>{throw new Error('The IILAS environment is missing, mixed or unavailable. Reload with its explicit demo profile.');};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const LOCAL_DEMO_ENVIRONMENT=freeze({schema:'iilas-demo-environment-1.0',mode:'local-emulator',projectId:'fyp-inventory-and-logistics',storageBucket:'fyp-inventory-and-logistics.firebasestorage.app',functionsRegion:'asia-southeast1',webOrigins:['http://127.0.0.1:5173','http://localhost:5173']});
const keys=Object.keys(LOCAL_DEMO_ENVIRONMENT);
function shape(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.getPrototypeOf(raw)!==Object.prototype||Object.keys(raw).length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k)||!Object.getOwnPropertyDescriptor(raw,k)?.value))fail();
 if(raw.schema!==LOCAL_DEMO_ENVIRONMENT.schema||!['local-emulator','cloud-demo'].includes(raw.mode)||!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(raw.projectId)||typeof raw.storageBucket!=='string'||!new RegExp('^'+raw.projectId+'\\.(firebasestorage\\.app|appspot\\.com)$').test(raw.storageBucket)||typeof raw.functionsRegion!=='string'||!/^[a-z]+-[a-z]+[0-9]$/.test(raw.functionsRegion)||!Array.isArray(raw.webOrigins)||raw.webOrigins.length<1||raw.webOrigins.length>4||new Set(raw.webOrigins).size!==raw.webOrigins.length)fail();
 for(const origin of raw.webOrigins){if(typeof origin!=='string')fail();let u;try{u=new URL(origin);}catch{fail();}if(u.origin!==origin||u.username||u.password)fail();if(raw.mode==='cloud-demo'&&(u.protocol!=='https:'||u.hostname==='localhost'||u.hostname==='127.0.0.1'||u.hostname.endsWith('.localhost')))fail();}
 if(raw.mode==='local-emulator'&&JSON.stringify(raw)!==JSON.stringify(LOCAL_DEMO_ENVIRONMENT)){
  if(keys.some(k=>JSON.stringify(raw[k])!==JSON.stringify(LOCAL_DEMO_ENVIRONMENT[k])))fail();
 }
 if(raw.mode==='cloud-demo'&&raw.projectId===LOCAL_DEMO_ENVIRONMENT.projectId)fail();
 return raw;
}
export function validateDemoEnvironment(raw,allowlist){
 shape(raw);if(!Array.isArray(allowlist)||!allowlist.some(p=>{shape(p);return keys.every(k=>JSON.stringify(p[k])===JSON.stringify(raw[k]));}))fail();
 return freeze(structuredClone(raw));
}
export function demoEnvironmentKey(profile){shape(profile);return `${profile.mode}:${profile.projectId}`;}
export function getDemoEndpoints(profile,origin=profile.webOrigins[0]){
 shape(profile);if(!profile.webOrigins.includes(origin))fail();return {functionsRegion:profile.functionsRegion,customerEvidenceUrl:profile.mode==='local-emulator'?`http://127.0.0.1:5001/${profile.projectId}/${profile.functionsRegion}/customerEvidence`:`${origin}/api/customer-evidence`,emulators:profile.mode==='local-emulator'?{auth:{host:'127.0.0.1',port:9099},firestore:{host:'127.0.0.1',port:8081},functions:{host:'127.0.0.1',port:5001},storage:{host:'127.0.0.1',port:9199}}:null};
}
export function projectRecoveryStorage(storage,profile){
 shape(profile);if(profile.mode==='local-emulator')return storage;
 const key=k=>`iilas.project.${profile.projectId}.${k}`;
 return {getItem:k=>storage.getItem(key(k)),setItem:(k,v)=>storage.setItem(key(k),v),removeItem:k=>storage.removeItem(key(k))};
}
export function initialiseDemoSDKs({profile,allowlist,options,origin,existing,factories}){
 const checked=validateDemoEnvironment(profile,allowlist);
 if(!checked.webOrigins.includes(origin)||options?.projectId!==checked.projectId||options?.storageBucket!==checked.storageBucket||existing&&(existing.options?.projectId!==checked.projectId||existing.options?.storageBucket!==checked.storageBucket))fail();
 const app=existing||factories.initialise(options),auth=factories.auth(app),db=factories.firestore(app),functions=factories.functions(app,checked.functionsRegion),storage=factories.storage(app);
 const endpoints=getDemoEndpoints(checked);
 if(endpoints.emulators)for(const [kind,sdk]of Object.entries({auth,firestore:db,functions,storage}))factories.connect(sdk,endpoints.emulators[kind],kind);
 return {profile:checked,app,auth,db,functions,storage};
}
