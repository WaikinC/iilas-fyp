"""Metadata-only local experiment configuration; never scientific acceptance.

The original descriptor, warm protocol and runtime remain the identity authority.
No model bytes, decoder, TensorFlow, dataset traversal or network is used here.
"""
from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import re

import parcel_gpu_serving as adapter
import parcel_runtime as parcel
import parcel_warm_protocol as protocol

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_LIMIT = 65536
WARM_BUNDLE = 'research/datasets/parcel-warm-serving-20261022/bundle-03/bundle.json'
WARM_BUNDLE_SHA256 = 'dab3da809ca11d287a68ab36f7e55680d15b4f50872819c6243c0858c1b2bd10'
DESCRIPTOR = 'research/datasets/parcel-gpu-serving-20261022/descriptor-02/descriptor.json'
LIVE_POLICY = dict(version='parcel-live-v1',
    sha256='50f4160d21f584110bbb7d68a6ff6552c2efe83bd14b119282d4b7a1e9217121')
SOURCE_FILES=('research/parcel_local_eval.py', 'research/serve_parcel_local_eval.py', 'backend/functions/parcelLocalEvaluation.mjs', 'backend/functions/parcelLocalEvaluationResponse.mjs', 'backend/functions/service.mjs', 'backend/functions/parcelAnalysis.mjs', 'backend/functions/parcelLive.mjs', 'backend/functions/parcelResponse.mjs', 'backend/functions/parcelLiveResponse.mjs', 'backend/functions/parcelLiveAcceptance.mjs', 'lib/parcelAnalysis.js', 'lib/parcelLive.js', 'lib/accountRoles.js', 'backend/functions/accountRoles.js', 'lib/completionWorkflow.js', 'backend/functions/completionWorkflow.js', 'lib/completionClient.js', 'backend/functions/completionOperations.mjs', 'lib/integrityWorkflow.js', 'backend/functions/integrityWorkflow.js', 'backend/functions/integrityWorkflow.mjs', 'backend/functions/integritySource.mjs', 'lib/integrityRegistrationClient.js', 'src/features/operations/IntegrityVerification.tsx', 'lib/transportPlanning.js', 'backend/functions/transportPlanning.js', 'backend/functions/fleetTransport.mjs', 'src/features/operations/operationsData.tsx', 'src/features/operations/FleetManagement.tsx', 'src/features/operations/TransportManagement.tsx', 'src/features/operations/TransportPlanningMap.tsx', 'backend/functions/customerAccess.mjs', 'backend/functions/customerEvidence.mjs', 'lib/customerPortal.js', 'src/features/customer/CustomerPortal.tsx', 'src/features/customer/customer.css', 'src/features/operations/CustomerShipmentAccess.tsx', 'src/features/workspace/WorkspaceGate.tsx', 'src/features/workspace/AdminPanel.tsx', 'lib/reporting.js', 'backend/functions/reporting.js', 'backend/functions/reporting.mjs', 'lib/catalogueFilters.js', 'src/features/operations/ReportExplorer.tsx', 'src/features/operations/ReportsWorkspace.tsx', 'src/features/operations/ResearchVerification.tsx', 'src/features/operations/Operations.tsx', 'src/features/operations/operations.css', 'app/page.tsx', 'backend/functions/index.mjs', 'backend/functions/access.mjs', 'firestore.rules', 'firestore.indexes.json', 'storage.rules', 'scripts/prepare-functions.mjs', 'scripts/prepare-fyp-completion-local.mjs', 'lib/reportResponse.js', 'src/features/operations/EvidenceFileComparison.tsx', 'lib/mobileDelivery.js', 'backend/functions/mobileDelivery.js', 'backend/functions/mobileDelivery.mjs', 'backend/functions/mobileEvidence.mjs', 'backend/functions/deliveryWorkflow.mjs', 'backend/functions/evidenceRegistration.mjs', 'lib/demoEnvironment.js', 'backend/functions/demoEnvironment.js', 'backend/functions/demoEnvironment.mjs', 'lib/hybridGateway.js', 'backend/functions/hybridGateway.js', 'backend/functions/hybridGateway.mjs', 'backend/functions/hybridSigning.mjs', 'backend/functions/hybridModelBinding.mjs', 'backend/functions/hybridIntegrity.mjs', 'lib/firebaseRuntime.js', 'lib/firebase.js', 'lib/workspace.js', 'src/main.tsx', 'tools/msi-gateway/models.mjs', 'tools/msi-gateway/authentication.mjs', 'tools/msi-gateway/server.mjs', 'tools/msi-gateway/integrity.mjs', 'tools/msi-gateway/launch.mjs')
_RAW_FIELDS = frozenset(('requestId', 'status', 'label', 'confidence', 'probabilities',
    'confidenceMeaning', 'model', 'modelVersion', 'preprocessing', 'contrast',
    'evidenceSha256', 'selectionSha256', 'evaluationSha256', 'processingTimeMs',
    'humanReviewRequired', 'operationally_approved', 'classOrder', 'acceptanceSha256'))
_UUID4 = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\Z')


def _require(condition):
    if not condition:
        raise ValueError('Local parcel evaluation configuration is unavailable.')


@dataclass(frozen=True)
class LocalEvaluationManifest:
    path: Path
    sha256: str
    bundle: protocol.WarmBundle


def _manifest_path(path):
    _require(isinstance(path, (str, Path)) and bool(str(path))
             and not any(ord(c) < 32 for c in str(path)))
    path = Path(path)
    _require(path.is_absolute() and '..' not in path.parts
             and path.is_relative_to(ROOT/'outputs') and path.name == 'manifest.json')
    checked = adapter.safe_path(path.relative_to(ROOT).as_posix())
    _require(path == checked)
    return checked


def _source_code():
    result = {}
    for relative in SOURCE_FILES:
        path = adapter.safe_path(relative)
        # The same bounded regular-file/no-link/stable-read checks as metadata.
        result[relative] = hashlib.sha256(adapter._bytes(path, 1024*1024)).hexdigest()
    return result


def _expected():
    bundle = protocol.load_bundle(adapter.safe_path(WARM_BUNDLE), WARM_BUNDLE_SHA256)
    _require(bundle.artifacts.descriptor_path == adapter.safe_path(DESCRIPTOR)
             and bundle.artifacts.descriptor_sha256 == protocol.DESCRIPTOR_SHA256
             and bundle.bindings == dict(modelVersion=adapter.MODEL_SHA,
                 selectionSha256=protocol.DESCRIPTOR_SHA256, evaluationSha256=adapter.REPORT_SHA))
    value = dict(schema_version=1, kind='parcel_local_evaluation_bundle_v1',
        warmBundle=dict(repo_path=WARM_BUNDLE, sha256=WARM_BUNDLE_SHA256),
        descriptor=dict(repo_path=DESCRIPTOR, sha256=protocol.DESCRIPTOR_SHA256),
        artifact=dict(repo_path=adapter.MODEL_PATH, sha256=adapter.MODEL_SHA),
        bindings=dict(bundle.bindings), contract=adapter.contract(),
        livePolicy=dict(LIVE_POLICY), code=_source_code())
    return value, bundle


def load_manifest(path, expected_sha256):
    """Strict pin + exact current metadata/source identities, with no model I/O."""
    try:
        path = _manifest_path(path)
        _require(isinstance(expected_sha256, str) and parcel.HASH.fullmatch(expected_sha256))
        value = adapter.read_json(path, MANIFEST_LIMIT, expected_sha=expected_sha256)
        expected, bundle = _expected()
        # JSON identity also distinguishes false/0 and true/1; Python equality
        # alone would accept numeric substitutions for the contract booleans.
        _require(type(value.get('schema_version')) is int and adapter.digest(value) == adapter.digest(expected))
        return LocalEvaluationManifest(path, expected_sha256, bundle)
    except (ValueError, OSError, TypeError, KeyError, parcel.ParcelRuntimeError):
        raise ValueError('Local parcel evaluation configuration is unavailable.') from None


def create_manifest(output):
    """Create a fresh version directory/manifest; never replace old configuration.

    Its parent container must already exist. All Task2 sources must be present
    before preparation can succeed. The returned digest pins actual JSON bytes.
    """
    try:
        output = _manifest_path(output)
        value, _ = _expected()
        payload = (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)+'\n').encode()
        _require(0 < len(payload) <= MANIFEST_LIMIT)
        output.parent.mkdir()  # exclusive version directory, no recursive creation
        with output.open('xb') as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        return load_manifest(output, hashlib.sha256(payload).hexdigest())
    except (ValueError, OSError, TypeError, KeyError, parcel.ParcelRuntimeError):
        raise ValueError('Local parcel evaluation configuration is unavailable.') from None


def experimental_result(result, request_id, image_base64, manifest, *, live=None):
    """Validate the unchanged worker contract, then add server-owned provenance.

    `live` contains only the three bindings from api.LiveParcelRequest after
    strict request validation; policy/approval/manifest are never caller inputs.
    """
    try:
        _require(type(result) is dict and set(result) in
                 (_RAW_FIELDS, _RAW_FIELDS | {'totalProcessingTimeMs'}))
        if 'totalProcessingTimeMs' in result:
            duration = result['totalProcessingTimeMs']
            _require(type(duration) in (int, float) and math.isfinite(duration) and 0 <= duration <= 25000)
        request = dict(requestId=request_id, mode='predict', imageBase64=image_base64,
            evidenceSha256=hashlib.sha256(parcel._image(image_base64)).hexdigest(),
            bindings=dict(manifest.bundle.bindings), **parcel._artifact_request(manifest.bundle.artifacts))
        parcel._uuid(request_id)
        safe = parcel._validate_result(result, request)
        safe.update(evaluationKind='local-experimental', evaluationManifestSha256=manifest.sha256,
                    evaluationOnly=True, runtimeMode='local-evaluation', intendedUse='registered-photo')
        if live is not None:
            _require(type(live) is dict and set(live) == {'sessionId', 'frameId', 'sequence'}
                and all(isinstance(live[key], str) and _UUID4.fullmatch(live[key]) for key in ('sessionId', 'frameId'))
                and type(live['sequence']) is int and 1 <= live['sequence'] <= 12)
            safe.update(**live, intendedUse='sampled-live', policyVersion=LIVE_POLICY['version'],
                        policySha256=LIVE_POLICY['sha256'])
        return safe
    except (ValueError, OSError, TypeError, KeyError, AttributeError, parcel.ParcelRuntimeError):
        raise parcel.ParcelUnavailable('Local parcel result is unavailable.') from None
