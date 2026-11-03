// Run: node --experimental-test-module-mocks --test scripts/parcel-command-qa.mjs
// Real command/approval/transaction validation; only external Firebase and HTTP
// boundaries are replaced. The trusted acceptance fixture exists only here.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {mock, test} from 'node:test';

const require = createRequire(new URL('../backend/functions/service.mjs', import.meta.url));
let database;
const image = Buffer.from('software fixture, not a parcel evaluation image');
const evidenceSha256 = createHash('sha256').update(image).digest('hex');
mock.method(require('firebase-admin/firestore'), 'getFirestore', () => database);
mock.method(require('firebase-admin/storage'), 'getStorage', () => ({
  bucket: () => ({file: () => ({download: async () => [image]})}),
}));
const {executeCommand: productionCommand} = await import('../backend/functions/service.mjs');
const acceptance = Object.freeze({
  model: 'MobileNetV2', modelVersion: 'a'.repeat(64), selectionSha256: 'b'.repeat(64),
  evaluationSha256: 'c'.repeat(64), acceptanceSha256: 'd'.repeat(64),
  preprocessing: 'opencv-rgb-resize224-mobilenet_v2', contrast: 'clahe',
  intendedUse: 'registered-photo',
});
mock.module('../backend/functions/parcelAcceptance.mjs', {namedExports: {parcelAcceptance: acceptance}});
const {executeCommand} = await import('../backend/functions/service.mjs?accepted-software-fixture');
process.env.RESEARCH_API_URL = 'http://127.0.0.1:1';
process.env.RESEARCH_API_TOKEN = randomUUID();

function fixture() {
  const records = new Map(Object.entries({
    'system/config': {dataScopeId: 'scope', primaryAdminUid: 'admin'},
    'users/driver': {uid: 'driver', role: 'Driver', active: true, status: 'Approved'},
    'evidence/photo': {ownerId: 'scope', shipmentId: 'shipment', type: 'Parcel Image',
      path: 'evidence/scope/shipment/photo', sha256: evidenceSha256, version: 1},
    'shipments/shipment': {ownerId: 'scope', driverUid: 'driver', status: 'Dispatched',
      version: 2, expectedDelivery: '2026-10-21', dispatchedAt: {toMillis: () => 1792425600000}, parcelCount: 1},
    'transportPlans/shipment': {ownerId: 'scope', driverUid: 'driver', version: 1},
    'deliveries/shipment': {ownerId: 'scope', version: 1, failedAttempts: 0},
    'products/product': {ownerId: 'scope', version: 1, quantityOnHand: 20, reservedQuantity: 2, reorderLevel: 10},
  }));
  const reference = path => ({path});
  const db = {
    doc: reference,
    collection: kind => ({
      doc: key => reference(`${kind}/${key}`),
      where: () => ({where: () => ({kind, query: true})}),
    }),
    async runTransaction(work) {
      const writes = [];
      const tx = {
        async get(ref) {
          if (ref.query) {
            const values = ref.kind === 'stockMovements'
              ? [{type: 'Receipt', createdAt: {toMillis: () => Date.now() - 86400000}}] : [];
            return {size: values.length, docs: values.map(value => ({data: () => value}))};
          }
          const value = records.get(ref.path);
          return {ref, exists: records.has(ref.path), data: () => value};
        },
        set: (ref, data) => writes.push([ref.path, data]),
      };
      const result = await work(tx);
      for (const [path, value] of writes) records.set(path, value);
      return result;
    },
  };
  database = db;
  return {
    records,
    change: (path, changes) => records.set(path, {...records.get(path), ...changes}),
    predictions: () => [...records].filter(([path]) => path.startsWith('predictions/')).map(([, value]) => value),
    audits: () => [...records.keys()].filter(path => path.startsWith('auditLogs/')),
  };
}
function result() {
  return {
    status: 'predicted', label: 'Damaged', confidence: 0.8, probabilities: [0.2, 0.8],
    confidenceMeaning: 'uncalibrated', model: acceptance.model, modelVersion: acceptance.modelVersion,
    selectionSha256: acceptance.selectionSha256, evaluationSha256: acceptance.evaluationSha256,
    preprocessing: acceptance.preprocessing, contrast: acceptance.contrast, evidenceSha256,
    requestId: '269080be-580a-47cf-a32e-d8f0e1d8c127', processingTimeMs: 12, totalProcessingTimeMs: 25,
    humanReviewRequired: true, operationally_approved: true,
  };
}
function command(kind = 'parcel', run = executeCommand) {
  return run({uid: 'driver'}, {action: 'predict', workspaceId: 'scope',
    input: {kind, id: kind === 'parcel' ? 'photo' : kind === 'inventory' ? 'product' : 'shipment'}});
}
function remote(t, value = result()) {
  t.mock.method(globalThis, 'fetch', async () => ({ok: true, json: async () => value}));
}
function pauseRemote(t, value = result()) {
  let announce, release;
  const started = new Promise(resolve => { announce = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  t.mock.method(globalThis, 'fetch', async () => {
    announce();
    await pending;
    return {ok: true, json: async () => value};
  });
  return {started, release};
}

// The stage/request lifecycle replaces the legacy parcel path. Positive parcel,
// abstention, completion fencing and review coverage now live in the dedicated
// parcel-analysis-command/emulator suites; tabular regression stays below.
for (const [name, run] of [['production', productionCommand], ['external accepted fixture', executeCommand]]) {
  test(`${name} legacy parcel submission rejects before remote work or writes`, async t => {
    const state = fixture();
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {calls++;throw new Error('Legacy parcel transport must not run.');});
    await assert.rejects(command('parcel', run), error => error.code === 'failed-precondition' && /request|workflow/i.test(error.message));
    assert.equal(calls, 0);
    assert.deepEqual(state.predictions(), []);
    assert.deepEqual(state.audits(), []);
  });
}
for (const kind of ['inventory', 'delivery']) {
  test(`${kind} retains legacy result and feature semantics without parcel approval fields`, async t => {
    const state = fixture();
    if (kind === 'inventory') state.change('users/driver', {role: 'Inventory'});
    const tabular = {label: kind === 'inventory' ? 'Reorder Risk' : 'High', confidence: 0.75,
      model: 'RandomForest', modelVersion: 'legacy-v1', globalFeatureImportance: {example: 0.3}};
    remote(t, tabular);
    await command(kind);
    const saved = state.predictions()[0];
    assert.equal(saved.label, tabular.label);
    assert.equal(saved.modelVersion, 'legacy-v1');
    assert.deepEqual(saved.globalFeatureImportance, {example: 0.3});
    assert.equal(saved.evidenceSha256, null);
    if (kind === 'inventory') {
      assert.equal(saved.features.available_quantity, 18);
      assert.equal(saved.features.reorder_distance, 8);
    } else {
      assert.equal(saved.features.parcel_count, 1);
      assert.equal(saved.features.failed_attempts, 0);
    }
  });
}
test('delivery reassignment during delayed tabular inference prevents final writes', async t => {
  const state = fixture(), delayed = pauseRemote(t, {label: 'High', confidence: 0.75, model: 'RandomForest', modelVersion: 'legacy-v1'});
  const prediction = command('delivery');
  await delayed.started;
  state.change('shipments/shipment', {driverUid: 'other-driver'});
  delayed.release();
  await assert.rejects(prediction, {code: 'permission-denied'});
  assert.deepEqual(state.predictions(), []);
});

async function withResearchEnvironment(local,work) {
  const keys=['RESEARCH_API_URL','RESEARCH_API_TOKEN','IILAS_PARCEL_LOCAL_EVAL_MANIFEST','IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256'];
  const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  try {
    for(const key of keys)delete process.env[key];
    const researchToken=randomUUID();
    Object.assign(process.env,{RESEARCH_API_URL:'http://127.0.0.1:1',RESEARCH_API_TOKEN:researchToken},local);
    return await work(researchToken);
  } finally {
    for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
  }
}
const localParcelConfigurations=[
  ['both keys with absent target',{IILAS_PARCEL_LOCAL_EVAL_MANIFEST:fileURLToPath(new URL('../outputs/parcel-local-eval-20261022/never-created-generic-test/manifest.json',import.meta.url)),IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256:'a'.repeat(64)}],
  ['path only',{IILAS_PARCEL_LOCAL_EVAL_MANIFEST:'absent-manifest.json'}],
  ['hash only',{IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256:'a'.repeat(64)}],
  ['malformed pair',{IILAS_PARCEL_LOCAL_EVAL_MANIFEST:'not-an-absolute-manifest',IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256:'invalid'}],
  ['empty path',{IILAS_PARCEL_LOCAL_EVAL_MANIFEST:''}],
  ['empty hash',{IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256:''}],
  ['both empty',{IILAS_PARCEL_LOCAL_EVAL_MANIFEST:'',IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256:''}],
];
for(const kind of ['inventory','delivery']){
  for(const [name,local] of localParcelConfigurations){
    test(`parcel-only isolation: ${kind} never fetches with ${name}`,async t=>withResearchEnvironment(local,async()=>{
      const state=fixture();if(kind==='inventory')state.change('users/driver',{role:'Inventory'});
      const before=JSON.stringify([...state.records]);let calls=0;
      t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Generic inference reached the parcel-only endpoint.');});
      await assert.rejects(command(kind,productionCommand),error=>error.code==='unavailable'&&/labelled datasets/.test(error.message));
      assert.equal(calls,0);assert.equal(JSON.stringify([...state.records]),before);
    }));
  }
  test(`parcel-only isolation: ${kind} retains configured general research without local keys`,async t=>withResearchEnvironment({},async researchToken=>{
    const state=fixture();if(kind==='inventory')state.change('users/driver',{role:'Inventory'});
    const calls=[],tabular={label:kind==='inventory'?'Reorder Risk':'High',confidence:0.75,model:'RandomForest',modelVersion:'general-research-v1',globalFeatureImportance:{example:0.3}};
    t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>tabular};});
    await command(kind,productionCommand);
    assert.equal(calls.length,1);assert.equal(calls[0].url,'http://127.0.0.1:1/predict');
    assert.equal(calls[0].options.headers.Authorization,`Bearer ${researchToken}`);
    const payload=JSON.parse(calls[0].options.body),saved=state.predictions()[0];
    assert.equal(payload.kind,kind);assert.deepEqual(payload.features,saved.features);
    assert.equal(saved.label,tabular.label);assert.equal(saved.modelVersion,tabular.modelVersion);
    assert.deepEqual(saved.globalFeatureImportance,tabular.globalFeatureImportance);assert.equal(state.audits().length,1);
  }));
}
