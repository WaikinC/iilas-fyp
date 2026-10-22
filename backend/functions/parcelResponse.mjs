const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const fail = (message, code = 'failed-precondition') => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

// This validates a trusted server pin's shape, not scientific acceptance.
// Only parcelAcceptance.mjs supplies the production caller's pin. It stays null
// until a separate acceptance review establishes these exact immutable bindings.
export function requireParcelAcceptance(acceptance) {
  if (!acceptance || acceptance.model !== 'MobileNetV2'
      || acceptance.intendedUse !== 'registered-photo'
      || !['modelVersion', 'selectionSha256', 'evaluationSha256', 'acceptanceSha256'].every(key => sha256(acceptance[key]))
      || !Array.isArray(acceptance.classOrder) || acceptance.classOrder.length !== 2
      || !Object.hasOwn(acceptance.classOrder,0) || !Object.hasOwn(acceptance.classOrder,1)
      || acceptance.classOrder[0] !== 'Normal' || acceptance.classOrder[1] !== 'Damaged'
      || typeof acceptance.preprocessing !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_. -]{0,255}$/.test(acceptance.preprocessing)
      || acceptance.preprocessing.length > 256 || !['none', 'clahe'].includes(acceptance.contrast)) {
    fail('Parcel analysis is unavailable until an evaluated model has trusted operational acceptance.', 'unavailable');
  }
  return acceptance;
}

export function validateParcelResponse(result, {acceptance, evidenceSha256}) {
  requireParcelAcceptance(acceptance);
  const invalid = () => fail('The research service returned an invalid or unapproved parcel result.');
  if (!result || typeof result !== 'object' || Array.isArray(result)
      || result.operationally_approved !== true || result.humanReviewRequired !== true
      || result.confidenceMeaning !== 'uncalibrated'
      || !sha256(evidenceSha256) || result.evidenceSha256 !== evidenceSha256
      || !Array.isArray(result.classOrder) || result.classOrder.length !== 2
      || !Object.hasOwn(result.classOrder,0) || !Object.hasOwn(result.classOrder,1)
      || result.classOrder[0] !== 'Normal' || result.classOrder[1] !== 'Damaged'
      || !['model', 'modelVersion', 'selectionSha256', 'evaluationSha256', 'acceptanceSha256', 'preprocessing', 'contrast']
        .every(key => result[key] === acceptance[key])) invalid();
  const scores = result.probabilities;
  if (!Array.isArray(scores) || scores.length !== 2 || !Object.hasOwn(scores,0) || !Object.hasOwn(scores,1)
      || !scores.every(score => finite(score) && score >= 0 && score <= 1)
      || Math.abs(scores[0] + scores[1] - 1) > 1e-6
      || !finite(result.confidence) || result.confidence < 0 || result.confidence > 1
      || Math.abs(result.confidence - Math.max(...scores)) > 1e-6) invalid();
  const label = scores[0] === scores[1] ? null : scores[0] > scores[1] ? 'Normal' : 'Damaged';
  if (result.label !== label || result.status !== (label === null ? 'abstained' : 'predicted')
      || !finite(result.processingTimeMs) || result.processingTimeMs < 0 || result.processingTimeMs > 25000
      || !finite(result.totalProcessingTimeMs) || result.totalProcessingTimeMs < result.processingTimeMs
      || result.totalProcessingTimeMs > 30000
      || typeof result.requestId !== 'string'
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(result.requestId)) invalid();
  return result;
}
