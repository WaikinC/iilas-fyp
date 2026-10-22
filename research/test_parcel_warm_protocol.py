import base64
import hashlib
import unittest
from pathlib import Path
from unittest.mock import patch
import parcel_runtime as parcel
try:
    import parcel_warm_protocol as protocol
except ImportError:
    protocol = None

class ProtocolTests(unittest.TestCase):
    def test_explicit_warm_profile_changes_only_native_lifetime(self):
        from dataclasses import asdict
        cold = asdict(parcel.parcel_limits())
        warm = asdict(protocol.native_limits())
        self.assertEqual(cold['max_wall_seconds'], 25)
        self.assertEqual(cold['max_fit_seconds'], 25)
        self.assertEqual(warm, dict(cold, max_wall_seconds=120, max_fit_seconds=120))
        self.assertEqual(protocol.policy(), dict(profile='parcel_warm_worker_120s_v2',
            retire_after_seconds=110, request_deadline_seconds=25, reuse_before_seconds=90,
            idle_seconds=12, max_frames=12, native_limits=warm, operationally_approved=False))

    def test_frame_rejects_identity_evidence_and_approval_drift(self):
        self.assertIsNotNone(protocol, 'warm protocol is missing')
        artifacts = parcel.ParcelGPUArtifacts(Path(__file__).resolve(), '4'*64)
        bindings = dict(modelVersion='1'*64, selectionSha256='4'*64, evaluationSha256='2'*64)
        with patch.object(parcel, '_bindings', return_value=bindings), patch.object(parcel, '_artifact_request', return_value=dict(artifactKind='gpu-descriptor-v2',descriptor=str(artifacts.descriptor_path),descriptorSha256='4'*64)):
            request = protocol.frame_request('00000000-0000-0000-0000-000000000001', 'YQ==', artifacts)
            bundle = protocol.WarmBundle(Path(__file__), '3'*64, artifacts, bindings)
            envelope = protocol.frame_envelope(request['requestId'], bundle, request)
            self.assertEqual(protocol.parse_frame(envelope, request['requestId'], bundle), request)
            for field,value in [('evidenceSha256','0'*64),('requestId','bad'),('operationally_approved',True)]:
                altered = dict(envelope, request=dict(request, **{field:value}))
                with self.assertRaises(Exception): protocol.parse_frame(altered, request['requestId'], bundle)
            with self.assertRaises(Exception): protocol.parse_frame(dict(envelope, cacheId='00000000-0000-0000-0000-000000000002'),request['requestId'],bundle)

if __name__ == '__main__': unittest.main()

class BoundedMetadataTests(unittest.TestCase):
    def setUp(self):
        import uuid
        self.directory = parcel.REQUEST_ROOT / str(uuid.uuid4())
        self.directory.mkdir(parents=True)

    def tearDown(self):
        fixture = self.directory/'fixture-source.py'
        if fixture.exists(): fixture.unlink()
        parcel._cleanup(self.directory)

    def test_slot_write_never_overwrites_pending_result_and_bounds_bytes(self):
        temporary = protocol.temporary(self.directory)
        path = temporary/'slot.out.json'
        protocol.write_json(path, {'first':True}, 100)
        with self.assertRaises(Exception): protocol.write_json(path, {'second':True}, 100)
        self.assertEqual(protocol.read_json(path,100), {'first':True})
        with self.assertRaises(Exception): protocol.write_json(temporary/'stop.json', {'tooLarge':'x'*100}, 20)
        self.assertFalse((temporary/'stop.json').exists())
        with self.assertRaises(Exception): protocol.write_json(temporary/'foreign.json', {}, 100)
        with self.assertRaises(Exception): protocol.write_json(self.directory/'slot.in.json', {}, 100)

    def test_strict_json_rejects_duplicate_nonfinite_and_oversize_metadata(self):
        temporary = protocol.temporary(self.directory)
        path = temporary/'ready.json'
        for raw in ('{"x":1,"x":2}', '{"x":NaN}', '{"x":"'+('a'*100)+'"}'):
            path.write_text(raw)
            with self.assertRaises(Exception): protocol.read_json(path,64)

    def test_bundle_freezes_current_sources_and_refuses_drift_or_replacement(self):
        import uuid
        artifacts = parcel.ParcelGPUArtifacts(self.directory/'descriptor.json',protocol.DESCRIPTOR_SHA256)
        bindings = dict(modelVersion='1'*64,selectionSha256=protocol.DESCRIPTOR_SHA256,evaluationSha256='2'*64)
        output = protocol.temporary(self.directory)/'bundle.json'
        original_safe = protocol.adapter.safe_path
        def source_path(relative):
            if relative == 'research/serve_parcel.py' and not original_safe(relative).exists():
                return fixture_source
            return original_safe(relative)
        fixture_source = self.directory/'fixture-source.py'
        fixture_source.write_text('# artificial unbuilt factory source')
        with patch.object(protocol.adapter,'safe_path',side_effect=source_path), patch.object(protocol,'_descriptor',return_value=(artifacts,bindings)):
            bundle = protocol.create_bundle(output,artifacts.descriptor_path,artifacts.descriptor_sha256)
            raw = protocol.read_json(output,65536)
            self.assertEqual(set(raw['code']), {'parcel_warm_model.py','parcel_warm_protocol.py','parcel_warm_worker.py','parcel_warm_runtime.py','serve_parcel.py'})
            self.assertEqual(raw['code']['parcel_warm_protocol.py'],hashlib.sha256(Path(protocol.__file__).read_bytes()).hexdigest())
            with self.assertRaises(Exception): protocol.create_bundle(output,artifacts.descriptor_path,artifacts.descriptor_sha256)
            altered = dict(raw['code'], **{'parcel_warm_worker.py':'0'*64})
            with patch.object(protocol,'_code',return_value=altered):
                with self.assertRaises(Exception): protocol.load_bundle(output,bundle.sha256)
            with self.assertRaises(Exception): protocol.load_bundle(output,'0'*64)
            raw['policy']['operationally_approved'] = True
            output.unlink();output.write_text(__import__('json').dumps(raw))
            pin=hashlib.sha256(output.read_bytes()).hexdigest()
            with self.assertRaises(Exception): protocol.load_bundle(output,pin)


