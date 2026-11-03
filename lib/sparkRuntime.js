const project='fyp-inventory-and-logistics';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail=()=>{throw Error('The explicit Spark/MSI runtime is missing, changed or unavailable.');};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export function sparkExact(raw,keys){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.getPrototypeOf(raw)!==Object.prototype||Reflect.ownKeys(raw).length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(raw,k),'value')))fail();
 return raw;
}
function httpsOrigin(value){let u;try{u=new URL(value);}catch{fail();}if(typeof value!=='string'||u.origin!==value||u.protocol!=='https:'||u.username||u.password||['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.hostname.endsWith('.localhost'))fail();}
function identity(raw){if(raw.projectId!==project||typeof raw.backendInstanceId!=='string'||!uuid.test(raw.backendInstanceId))fail();}
function production(raw){
 sparkExact(raw,['schema','mode','projectId','webOrigins','apiOrigin','backendInstanceId','adoptionSha256','evidenceStore']);identity(raw);
 if(raw.schema!=='iilas-spark-msi-1.0'||raw.mode!=='spark-msi'||raw.evidenceStore!=='msi-local'||!/^[a-f0-9]{64}$/.test(raw.adoptionSha256)||!Array.isArray(raw.webOrigins)||raw.webOrigins.length!==1||raw.webOrigins[0]!==`https://${project}.web.app`)fail();
 httpsOrigin(raw.apiOrigin);return raw;
}
export function validateSparkProfile(raw,allowlist){
 production(raw);if(!Array.isArray(allowlist)||!allowlist.some(entry=>{production(entry);return Object.keys(raw).every(k=>JSON.stringify(raw[k])===JSON.stringify(entry[k]));}))fail();
 return freeze(structuredClone(raw));
}
export function validateSparkLoopbackTest(raw){
 sparkExact(raw,['schema','mode','projectId','backendInstanceId','apiOrigin','webOrigins','emulatorHosts']);identity(raw);
 sparkExact(raw.emulatorHosts,['auth','firestore','storage']);
 if(raw.schema!=='iilas-spark-loopback-test-1.0'||raw.mode!=='spark-loopback-test'||raw.apiOrigin!=='http://127.0.0.1:8011'||!Array.isArray(raw.webOrigins)||raw.webOrigins.length!==1||raw.webOrigins[0]!=='http://127.0.0.1:5173'||raw.emulatorHosts.auth!=='127.0.0.1:9099'||raw.emulatorHosts.firestore!=='127.0.0.1:8081'||raw.emulatorHosts.storage!=='127.0.0.1:9199')fail();
 return freeze(structuredClone(raw));
}
export function validateSparkRuntime(raw,allowlist){
 if(raw?.mode==='spark-msi')return validateSparkProfile(raw,allowlist);
 const checked=validateSparkLoopbackTest(raw);if(!Array.isArray(allowlist)||!allowlist.some(entry=>{try{return JSON.stringify(validateSparkLoopbackTest(entry))===JSON.stringify(checked);}catch{return false;}}))fail();return checked;
}
export function sparkRecoveryKey(profile,uid,legacyKey){
 if(profile?.mode==='spark-msi')production(profile);else validateSparkLoopbackTest(profile);
 if(typeof uid!=='string'||!/^[-A-Za-z0-9_]{1,128}$/.test(uid)||typeof legacyKey!=='string'||!legacyKey||legacyKey.length>256)fail();
 return `iilas.${profile.mode}.${profile.projectId}.${profile.backendInstanceId}.${encodeURIComponent(profile.apiOrigin)}.${uid}.${legacyKey}`;
}
// Ordinary creation belongs to a database/project, not a serving process or
// tunnel. Other recovery protocols deliberately keep their existing binding.
export function sparkRecordCreationRecoveryKey(profile,uid,key){
 if(profile?.mode==='spark-msi')production(profile);else validateSparkLoopbackTest(profile);
 if(typeof uid!=='string'||!/^[-A-Za-z0-9_]{1,128}$/.test(uid)||typeof key!=='string'||!key||key.length>2048)fail();
 return `iilas.creation.${profile.mode}.${profile.projectId}.${uid}.${key}`;
}
export function initialiseSparkSDKs({profile,allowlist,options,origin,existing,factories}){
 const checked=validateSparkRuntime(profile,allowlist),name=`iilas.${checked.mode}.${checked.projectId}`;
 if(!checked.webOrigins.includes(origin)||options?.projectId!==checked.projectId||existing&&(existing.name!==name||existing.options?.projectId!==checked.projectId))fail();
 const app=existing||factories.initialise(options,name),auth=factories.auth(app),db=factories.firestore(app);
 if(checked.mode==='spark-loopback-test'){factories.connect(auth,{host:'127.0.0.1',port:9099},'auth');factories.connect(db,{host:'127.0.0.1',port:8081},'firestore');}
 return {profile:checked,app,auth,db};
}
