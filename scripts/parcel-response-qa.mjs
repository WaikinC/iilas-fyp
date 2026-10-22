import assert from 'node:assert/strict';
import {test} from 'node:test';

const boundary = await import('../backend/functions/parcelResponse.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const digest = character => character.repeat(64);
const acceptance = Object.freeze({
  model: 'MobileNetV2', modelVersion: digest('a'), selectionSha256: digest('b'),
  evaluationSha256: digest('c'), acceptanceSha256: digest('d'),
  preprocessing: 'opencv-rgb-resize224-mobilenet_v2', contrast: 'clahe',
  intendedUse: 'registered-photo',
  classOrder: ['Normal','Damaged'],
});
const response = () => ({
  status: 'predicted', label: 'Damaged', confidence: 0.8, probabilities: [0.2, 0.8],
  confidenceMeaning: 'uncalibrated', model: acceptance.model,
  modelVersion: acceptance.modelVersion, selectionSha256: acceptance.selectionSha256,
  evaluationSha256: acceptance.evaluationSha256, preprocessing: acceptance.preprocessing,
  acceptanceSha256: acceptance.acceptanceSha256, classOrder: ['Normal','Damaged'],
  contrast: acceptance.contrast, evidenceSha256: digest('e'),
  requestId: '269080be-580a-47cf-a32e-d8f0e1d8c127',
  processingTimeMs: 12, totalProcessingTimeMs: 25,
  humanReviewRequired: true, operationally_approved: true,
});
function validate(result = response(), trusted = acceptance, evidence = digest('e')) {
  assert.equal(typeof boundary.validateParcelResponse, 'function', 'Parcel validation boundary must exist');
  return boundary.validateParcelResponse(result, {acceptance: trusted, evidenceSha256: evidence});
}

test('accepted exact bindings preserve a Damaged decision and review requirement', () => {
  assert.equal(validate().label, 'Damaged');
  assert.equal(validate().humanReviewRequired, true);
});
test('accepted exact bindings preserve a Normal decision', () => {
  assert.equal(validate({...response(), label: 'Normal', probabilities: [0.8, 0.2]}).label, 'Normal');
});
test('exact ties remain explicit abstentions', () => {
  assert.equal(validate({...response(), status: 'abstained', label: null, confidence: 0.5, probabilities: [0.5, 0.5]}).status, 'abstained');
});
test('remote approval alone cannot open the default closed acceptance gate', () => {
  assert.throws(() => validate(response(), null), {code: 'unavailable'});
});
for (const [field, value] of [
  ['model', 'EfficientNetB0'], ['model', undefined],
  ['modelVersion', digest('f')], ['modelVersion', 'legacy-v1'],
  ['selectionSha256', digest('f')], ['selectionSha256', undefined],
  ['evaluationSha256', digest('f')], ['evaluationSha256', undefined],
  ['acceptanceSha256', digest('f')], ['acceptanceSha256', undefined],
  ['classOrder', undefined], ['classOrder', ['Damaged','Normal']],
  ['classOrder', new Array(2)], ['probabilities', new Array(2)],
  ['evidenceSha256', digest('f')], ['evidenceSha256', undefined],
  ['operationally_approved', false], ['operationally_approved', undefined],
  ['operationally_approved', 'true'], ['humanReviewRequired', false],
  ['humanReviewRequired', undefined], ['confidenceMeaning', 'calibrated'],
  ['confidence', NaN], ['confidence', Infinity], ['confidence', 0.7],
  ['confidence', '0.8'], ['probabilities', [0.2, 0.7]],
  ['probabilities', [0.2, Infinity]], ['probabilities', [-0.2, 1.2]],
  ['probabilities', ['0.2', 0.8]], ['probabilities', [0.2, 0.8, 0]],
  ['status', 'ready'], ['status', 'abstained'], ['label', 'Normal'],
  ['label', null], ['processingTimeMs', NaN], ['processingTimeMs', -1],
  ['processingTimeMs', '12'], ['processingTimeMs', 25001],
  ['totalProcessingTimeMs', Infinity], ['totalProcessingTimeMs', undefined],
  ['totalProcessingTimeMs', 11], ['totalProcessingTimeMs', 30001],
  ['preprocessing', 'other-pipeline'], ['contrast', 'none'],
  ['requestId', undefined], ['requestId', 'not-a-request-id'],
]) {
  test(`rejects malformed or unpinned ${field}: ${String(value)}`, () => {
    assert.throws(() => validate({...response(), [field]: value}), {code: 'failed-precondition'});
  });
}
test('a predicted tie cannot become Normal', () => {
  assert.throws(() => validate({...response(), label: 'Normal', confidence: 0.5, probabilities: [0.5, 0.5]}), {code: 'failed-precondition'});
});
for (const field of ['modelVersion', 'selectionSha256', 'evaluationSha256', 'acceptanceSha256']) {
  test(`malformed trusted ${field} keeps admission closed`, () => {
    assert.throws(() => validate(response(), {...acceptance, [field]: 'not-a-digest'}), {code: 'unavailable'});
  });
}
test('photo acceptance cannot be used as live acceptance', () => {
  assert.throws(() => validate(response(), {...acceptance, intendedUse: 'live-camera'}), {code: 'unavailable'});
});
