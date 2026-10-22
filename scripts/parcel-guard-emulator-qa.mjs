// Existing loopback Firestore emulator only:
// node --experimental-test-module-mocks --test scripts/parcel-guard-emulator-qa.mjs
// Synthetic acceptance/HTTP/Storage doubles exercise the real command against
// real Firestore transactions. They are not model evaluation or activation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash, randomUUID} from 'node:crypto';
import {after, mock, test} from 'node:test';
import config from '../firebase-config.json' with {type: 'json'};

if (process.env.FIRESTORE_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8081') {
  throw new Error('This suite requires the configured loopback Firestore emulator.');
}
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8081';
const require = createRequire(new URL('../backend/functions/service.mjs', import.meta.url));
const {initializeApp, deleteApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const app = initializeApp({projectId: config.projectId});
const db = getFirestore(app);
const image = Buffer.from('synthetic transport fixture; not evaluation evidence');
const evidenceSha256 = createHash('sha256').update(image).digest('hex');
let storageReads=0;
mock.method(require('firebase-admin/storage'), 'getStorage', () => ({
  bucket: () => ({file: () => ({download: async () => {storageReads++;return [image];}})}),
}));
const {executeCommand: productionCommand} = await import('../backend/functions/service.mjs');
const acceptance = Object.freeze({
  model: 'MobileNetV2', modelVersion: 'a'.repeat(64), selectionSha256: 'b'.repeat(64),
  evaluationSha256: 'c'.repeat(64), acceptanceSha256: 'd'.repeat(64),
  preprocessing: 'opencv-rgb-resize224-mobilenet_v2', contrast: 'clahe', intendedUse: 'registered-photo',
});
mock.module('../backend/functions/parcelAcceptance.mjs', {namedExports: {parcelAcceptance: acceptance}});
const {executeCommand} = await import('../backend/functions/service.mjs?accepted-emulator-fixture');
process.env.RESEARCH_API_URL = 'http://127.0.0.1:1';
process.env.RESEARCH_API_TOKEN = randomUUID();
const scope = (await db.doc('system/config').get()).data()?.dataScopeId;
assert.ok(scope, 'Initialize the shared-system emulator fixture before running this suite.');
const fixtures = [];
after(async () => {
  for (const fixture of fixtures) {
    const predictions = await db.collection('predictions').where('actor', '==', fixture.actor).get();
    const audits = await db.collection('auditLogs').where('actor', '==', fixture.actor).get();
    const batch = db.batch();
    for (const record of [...predictions.docs, ...audits.docs]) batch.delete(record.ref);
    for (const reference of fixture.references) batch.delete(reference);
    await batch.commit();
  }
  await deleteApp(app);
});
async function fixture() {
  const actor = `parcel-guard-${randomUUID()}`, photo = `${actor}-photo`, shipment = `${actor}-shipment`;
  const records = {
    [`users/${actor}`]: {uid: actor, role: 'Driver', active: true, status: 'Approved', version: 1},
    [`evidence/${photo}`]: {ownerId: scope, shipmentId: shipment, type: 'Parcel Image',
      path: `evidence/${scope}/${shipment}/${photo}`, sha256: evidenceSha256, version: 1},
    [`transportPlans/${shipment}`]: {ownerId: scope, driverUid: actor, version: 1},
  };
  const references = Object.keys(records).map(path => db.doc(path));
  const state = {actor, photo, shipment, references};
  fixtures.push(state);
  const batch = db.batch();
  for (const [path, data] of Object.entries(records)) batch.set(db.doc(path), data);
  await batch.commit();
  return state;
}
async function writes(state) {
  const predictions = await db.collection('predictions').where('actor', '==', state.actor).get();
  const audits = await db.collection('auditLogs').where('actor', '==', state.actor).get();
  return {predictions, audits};
}

// Positive accepted-model and delayed-completion cases moved to the dedicated
// parcel-analysis-emulator suite. The legacy callable must never bypass it.
for (const [name, command] of [['production', productionCommand], ['external accepted fixture', executeCommand]]) {
  test(`${name} legacy parcel callable rejects without inference or saved writes`, {timeout: 15000}, async t => {
    const state = await fixture();
    const previousStorageReads=storageReads;
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {calls++;throw new Error('Legacy parcel HTTP must not run.');});
    await assert.rejects(command({uid:state.actor},{action:'predict',workspaceId:scope,input:{kind:'parcel',id:state.photo}}), error => error.code==='failed-precondition' && /request|workflow/i.test(error.message));
    assert.equal(calls,0);
    assert.equal(storageReads,previousStorageReads);
    const saved=await writes(state);
    assert.equal(saved.predictions.size,0);
    assert.equal(saved.audits.size,0);
  });
}
