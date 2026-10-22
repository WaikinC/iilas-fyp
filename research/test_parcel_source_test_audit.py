"""Artificial metadata/ZIP fixtures only; no native jobs, ML or real assets."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import struct
import unittest
import zipfile
import zlib
from contextlib import ExitStack
from unittest.mock import patch

SPEC = importlib.util.find_spec('parcel_source_test_audit')
if SPEC:
    import parcel_source_test_audit as audit
else:
    audit = None


def digest(data):
    return hashlib.sha256(data).hexdigest()


class AuditFixture(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(audit, 'source TEST audit implementation is missing')
        self.temp = tempfile.TemporaryDirectory(prefix='tsa-',
            dir=Path(__file__).resolve().parents[1]/'outputs')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = self.root/'research'/'datasets'
        self.data.mkdir(parents=True)
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(audit, 'ROOT', self.root))
        self.stack.enter_context(patch.object(audit, 'COUNTS', dict(source=8,test=6,rights=1,dev=2,normal=3,damaged=3)))
        self.stack.enter_context(patch.object(audit, 'REFERENCE_COUNTS', ()))
        self.stack.enter_context(patch.object(audit, '_code_bindings', return_value={'fixture.py':'1'*64}))
        self.stack.enter_context(patch.object(audit.runtime, '_validate_output_path', side_effect=self.safe_output))
        self.records = self.data/'fixture'
        self.records.mkdir()
        self.key = 'a'*64
        self.fit_ids = ['mobilenetv2-clahe','efficientnetb0-none']
        self.source = self.records/'artificial.zip'
        self.source.write_bytes(b'artificial archive placeholder')
        self.source_sha = digest(self.source.read_bytes())
        self.rows = []
        for i in range(8):
            split = 'train' if i<2 else 'test'
            label = 'Normal' if i%2==0 else 'Damaged'
            pub = 'undamagedpackages' if label=='Normal' else 'damagedpackages'
            member = f'{split}/{pub}/fixture{i}.png'
            sid = digest(member.encode())[:24]
            self.rows.append(dict(sample_id=sid,member=member,split=split,label=label,publisher_class=pub,
                source_family=f'fixture{i}',sha256=digest(f'image{i}'.encode()),pixel_sha256=None,dhash=None,
                dependency_group_id='old-'+sid,rights='rights_uncleared_stock' if i==7 else 'source_CC_BY_4_0_not_asset_warranty',
                reasons=['rights_uncleared_stock'] if i==7 else [],disposition='test_reserved' if i>=2 else 'selected'))
        self.manifest = dict(rows=copy.deepcopy(self.rows[:2]),dispositions=copy.deepcopy(self.rows),
            source_inventory=[dict(path=r['member'],bytes=6,compressed_bytes=6,crc32='00000000') for r in self.rows],
            source=dict(path=str(self.source),sha256=self.source_sha,version=1))
        self.manifest_record = self.write('admitted.json', self.manifest, sealed=True)
        self.receipt = self.write('completion.json', {'fixture':True})
        self.report = dict(source=str(self.source),source_sha256=self.source_sha,images_inventory=self.manifest['source_inventory'])
        self.stack.enter_context(patch.object(audit.review_base, 'load_manifest', side_effect=lambda p:copy.deepcopy(self.manifest)))
        self.stack.enter_context(patch.object(audit.base, '_source_receipt', return_value=(self.report,[self.receipt])))
        self.native, self.fits = {}, []
        for fit in self.fit_ids:
            native = {}
            unit='iilas-gpu-develop-'+self.key[:12]+'-'+str(self.fit_ids.index(fit))+'.service'
            properties=dict(MemoryMax=4096*1024**2,MemorySwapMax=0,CPUQuotaPerSecUSec=1000000,RuntimeMaxUSec=3000000000,TimeoutStopUSec=5000000,KillMode='control-group')
            native['request.json'] = self.write(f'{fit}-request.json',dict(command=['python','frozen.py','_fit','--output','/fixture','--fit-id',fit],max_output_bytes=512*1024**2,output_tree='/fixture',
                output='/fixture/'+fit,unit_name=unit,phase_deadline_monotonic=None,armed_monotonic=100,effective_wall_seconds=3000,requested_max_wall_seconds=3000,
                resource_profile='parcel_gpu_memory_v3',memory_limit_bytes=4096*1024**2,admission_memory_bytes=6144*1024**2,live_memory_floor_bytes=2048*1024**2,
                root_cache_policy='fixed_root_linux_cache_once_v1',code_sha256='5'*64,activation_sha256='6'*64))
            native['worker-envelope.json'] = self.write(f'{fit}-envelope.json',dict(request_sha256=native['request.json']['sha256'],proof=dict(unit_name=unit,properties=properties)))
            native['worker-terminal.json'] = self.write(f'{fit}-terminal.json',{'returncode':0})
            native['native-result.json'] = self.write(f'{fit}-native.json',dict(status='success',returncode=0,
                elapsed_seconds=10,peak_rss_bytes=1024,requested_max_wall_seconds=3000,
                effective_wall_seconds=3000,phase_deadline_monotonic=None,armed_monotonic=100,max_output_bytes=512*1024**2,output_tree='/fixture',
                unit_name=unit,
                resource_profile='parcel_gpu_memory_v3',memory_limit_bytes=4096*1024**2,admission_memory_bytes=6144*1024**2,
                live_memory_floor_bytes=2048*1024**2,root_cache_policy='fixed_root_linux_cache_once_v1',
                properties=properties,
                cleanup=dict(status='clean',unit_inactive=True,cgroup_empty=True,remaining_pids=[],actions=[]),
                request_sha256=native['request.json']['sha256'],worker_envelope_sha256=native['worker-envelope.json']['sha256'],
                worker_terminal_sha256=native['worker-terminal.json']['sha256']))
            self.native[fit] = native
            self.fits.append(dict(status='success',fit_id=fit,key=self.key,artifact_sha256=digest(fit.encode()),
                optimizer_iterations=189,expected_optimizer_iterations=189,scoring='compiled_validation_batch4_partial_v1',
                raw_predictions_from='reloaded_classifier.keras',history_sha256='2'*64,validation_predictions_sha256='3'*64,
                validation_diagnostic_sha256='4'*64,checkpoint_component_stable_ce=.2))
        self.comparison = self.write('comparison.json',dict(status='success',profile='parcel_visible_gpu_development_v4',
            operationally_approved=False,serving_gates='closed',key=self.key,primary=self.fit_ids[0],
            binding=dict(code={'parcel_gpu_runtime.py':'5'*64},activation_helper=dict(sha256='6'*64)),
            all_fits=self.fits,native_records={fit:{n:r['sha256'] for n,r in rec.items()} for fit,rec in self.native.items()}),sealed=True)
        self.claim = self.write('completed.json',{'result_sha256':self.comparison['sha256']})
        fit_records={f['fit_id']:self.write(f['fit_id']+'-fit.json',f,sealed=True) for f in self.fits}
        readback={}
        for name in ('source','receipt','log'):
            rec=self.write('readback-'+name+'.json',{'fixture':True})
            readback[name+'_path']=rec['path'];readback[name+'_sha256']=rec['sha256']
        readback.update(no_model_execution=True,verification_performed_by='parent',reviewer_metadata_only=True)
        self.independent_value=dict(schema_version=1,kind='independent_gpu_development_scientific_attestation_v1',status='pass',key=self.key,
            development_manifest_sha256=self.manifest_record['sha256'],comparison_sha256=self.comparison['sha256'],ordered_fit_ids=self.fit_ids,
            primary=self.fit_ids[0],paired_statistics_verified=True,operationally_approved=False,serving_gates='closed',reviewer_binary_access=False,
            parent_binary_readback=readback,fit_guards=[dict(f,fit_sha256=fit_records[f['fit_id']]['sha256'],epochs=1,
                min_val_loss=.2,absolute_checkpoint_difference=0,native_bindings={n:r['sha256'] for n,r in self.native[f['fit_id']].items()}) for f in self.fits])
        self.independent = self.write('independent.json',self.independent_value)
        self.proof_value = dict(schema_version=1,status='verified_complete',development_key=self.key,development_manifest_sha256=self.manifest_record['sha256'],comparison=self.comparison,
            completed_claim=self.claim,fit_ids=self.fit_ids,fit_records=fit_records,
            native_records=self.native,independent_review=self.independent,relocations=[])
        self.proof = self.write('proof.json',self.proof_value)
        ledger = self.write('exposure.json',dict(schema_version=1,entries=[],known_links=[],unresolved_preview_status='not_fully_matched'))
        self.protocol_value = dict(schema_version=1,kind='parcel_source_test_audit_protocol_v1',source_receipt=self.receipt,
            development_manifest=self.manifest_record,development_proof=self.proof,exposure_ledger=ledger,reference_bindings=[],
            policy=audit.POLICY,code_bindings=audit._code_bindings())
        self.protocol = self.write('protocol.json',self.protocol_value)

    def safe_output(self, path, repo_root=None):
        path = Path(path).absolute()
        if '..' in path.parts or not path.is_relative_to(self.data) or path==self.data:
            raise ValueError('Unsafe fixture output')
        return path

    def write(self, name, value, sealed=False):
        path = self.records/name
        path.parent.mkdir(parents=True,exist_ok=True)
        if sealed:
            value = dict(payload=value,sha256=digest(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()))
        path.write_text(json.dumps(value,sort_keys=True,allow_nan=False),encoding='utf-8')
        return dict(path=str(path),sha256=digest(path.read_bytes()))

    def rewrite_proof(self, change):
        value = copy.deepcopy(self.proof_value)
        change(value)
        self.proof = self.write('proof.json',value)
        self.protocol_value['development_proof']=self.proof
        self.protocol=self.write('protocol.json',self.protocol_value)


class ProofGateTests(AuditFixture):
    def test_cli_dispatch_is_only_the_explicit_public_api(self):
        with patch.object(audit,'prepare_audit',return_value=self.data/'candidate.json') as prepare:
            self.assertEqual(audit.main(['prepare','--protocol',self.protocol['path'],'--output',str(self.data/'out')]),0)
            prepare.assert_called_once_with(Path(self.protocol['path']),self.data/'out')
        with patch.object(audit,'admit_audit',return_value=self.data/'final.json') as admit:
            self.assertEqual(audit.main(['admit','--candidate','c.json','--review','r.json','--output','f.json']),0)
            admit.assert_called_once_with(Path('c.json'),Path('r.json'),Path('f.json'))
    def test_exact_completed_two_fit_metadata_gate(self):
        context = audit._protocol(Path(self.protocol['path']))
        self.assertEqual(len(context['test']),6)
        self.assertEqual(len(context['candidates']),5)
        self.assertEqual(context['proof']['development_key'],self.key)

    def test_pending_failed_one_model_and_wrong_independent_proof_rejected(self):
        for bad in ('pending','failed','one_model','foreign_review'):
            with self.subTest(bad=bad):
                def change(value):
                    if bad in ('pending','failed'): value['status']=bad
                    elif bad=='one_model': value['fit_ids']=self.fit_ids[:1]
                    else: value['independent_review']=self.write('wrong-review.json',{'status':'verified_complete'})
                self.rewrite_proof(change)
                with self.assertRaises(ValueError): audit._protocol(Path(self.protocol['path']))

    def test_native_hash_guard_and_optimizer_guard_are_not_a_flag_only(self):
        for kind in ('native','optimizer','comparison'):
            with self.subTest(kind=kind):
                def change(value):
                    if kind=='native': value['native_records'][self.fit_ids[0]]['native-result.json']=self.write('bad-native.json',{'status':'failed'})
                    elif kind=='optimizer': value['fit_records'][self.fit_ids[0]]=self.write('bad-fit.json',dict(self.fits[0],optimizer_iterations=190),True)
                    else: value['completed_claim']=self.write('bad-claim.json',{'result_sha256':'f'*64})
                self.rewrite_proof(change)
                with self.assertRaises(ValueError): audit._protocol(Path(self.protocol['path']))

    def test_explicit_relocations_reject_unused_duplicate_or_hash_drift(self):
        for relocs in ([dict(original_path='/linux/original.json',local_path=self.proof['path'],sha256=self.proof['sha256'])],
                       [dict(original_path='/linux/x',local_path=self.proof['path'],sha256='0'*64)]*2):
            self.rewrite_proof(lambda value:value.update(relocations=relocs))
            with self.assertRaises(ValueError): audit._protocol(Path(self.protocol['path']))

    def test_failed_preflight_preserves_receipt_without_consuming_population(self):
        class FailingSupervisor:
            def __init__(self,*args): pass
            def preflight(self): raise audit.runtime.RuntimeSafetyError('available_memory')
            def run(self,*args,**kwargs): raise AssertionError('Must not launch')
        with patch.object(audit.runtime,'ResourceSupervisor',FailingSupervisor):
            with self.assertRaises(audit.runtime.RuntimeSafetyError):
                audit.prepare_audit(Path(self.protocol['path']),self.data/'out')
        self.assertTrue((self.data/'out'/'preflight.json').is_file())
        self.assertFalse((self.data/'parcel-source-test-audit-registry').exists())

    def test_reservation_identity_ignores_output_and_is_exclusive(self):
        context=audit._protocol(Path(self.protocol['path']))
        first=audit._reserve(context,self.data/'one')
        self.assertTrue(Path(first['path']).is_file())
        with self.assertRaises((ValueError,FileExistsError)):
            audit._reserve(context,self.data/'two')

    def test_explicit_original_linux_binding_resolves_declared_same_hash_copy(self):
        def change(value):
            value['relocations']=[dict(original_path='/linux/comparison.json',local_path=self.comparison['path'],sha256=self.comparison['sha256'])]
            value['comparison']=dict(path='/linux/comparison.json',sha256=self.comparison['sha256'])
        self.rewrite_proof(change)
        self.assertEqual(audit._protocol(Path(self.protocol['path']))['proof']['development_key'],self.key)

    def test_resealed_native_request_source_mismatch_is_not_just_a_hash_check(self):
        fid=self.fit_ids[0];native=copy.deepcopy(self.native)
        request=json.loads(Path(native[fid]['request.json']['path']).read_text());request['code_sha256']='0'*64
        native[fid]['request.json']=self.write('changed-request.json',request)
        envelope=json.loads(Path(native[fid]['worker-envelope.json']['path']).read_text());envelope['request_sha256']=native[fid]['request.json']['sha256']
        native[fid]['worker-envelope.json']=self.write('changed-envelope.json',envelope)
        result=json.loads(Path(native[fid]['native-result.json']['path']).read_text());result.update(request_sha256=native[fid]['request.json']['sha256'],worker_envelope_sha256=native[fid]['worker-envelope.json']['sha256'])
        native[fid]['native-result.json']=self.write('changed-native.json',result)
        comparison=json.loads(Path(self.comparison['path']).read_text())['payload'];comparison['native_records']={f:{n:r['sha256'] for n,r in rec.items()} for f,rec in native.items()}
        comp=self.write('changed-comparison.json',comparison,True);claim=self.write('changed-claim.json',dict(result_sha256=comp['sha256']))
        independent=copy.deepcopy(self.independent_value);independent['comparison_sha256']=comp['sha256'];independent['fit_guards'][0]['native_bindings']=comparison['native_records'][fid]
        ind=self.write('changed-independent.json',independent)
        self.rewrite_proof(lambda p:p.update(comparison=comp,completed_claim=claim,native_records=native,independent_review=ind))
        with self.assertRaises(ValueError):audit._protocol(Path(self.protocol['path']))


def png(width=64,height=64,colour=1):
    def chunk(kind,data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',
        zlib.compress((b'\0'+bytes([colour])*width*3)*height))+chunk(b'IEND',b'')


class TechnicalAndGraphTests(AuditFixture):
    def make_archive(self,extra=None):
        self.images={r['member']:png(colour=i+1) for i,r in enumerate(self.manifest['dispositions'])}
        with zipfile.ZipFile(self.source,'w') as archive:
            for member,data in self.images.items(): archive.writestr(member,data)
            if extra: archive.writestr(extra,b'unsafe')
            infos={i.filename:i for i in archive.infolist()}
        for r in self.manifest['dispositions']:
            r['sha256']=digest(self.images[r['member']])
        self.manifest['rows']=copy.deepcopy(self.manifest['dispositions'][:2])
        self.manifest['source_inventory']=[dict(path=r['member'],bytes=infos[r['member']].file_size,
            compressed_bytes=infos[r['member']].compress_size,crc32=f"{infos[r['member']].CRC:08x}") for r in self.manifest['dispositions']]
        self.source_sha=digest(self.source.read_bytes())
        self.manifest['source']['sha256']=self.source_sha
        self.report.update(source_sha256=self.source_sha,images_inventory=self.manifest['source_inventory'])

    def context(self):
        return audit._protocol(Path(self.protocol['path']))

    def fake_fingerprint(self,data):
        return dict(width=64,height=64,pixel_sha256=digest(b'pixels'+data),dhash=digest(data)[:16]), data

    def fake_render(self,rgb,path):
        path.write_bytes(rgb)

    def test_initial_rights_never_read_and_full_census_is_rendered(self):
        self.make_archive();out=self.data/'worker';out.mkdir()
        context=self.context();reservation=audit._reserve(context,out)
        opened=[];original=zipfile.ZipFile.open
        def spy(archive,name,*args,**kwargs):
            member=getattr(name,'filename',name);opened.append(member)
            self.assertNotEqual(member,self.rows[7]['member'])
            return original(archive,name,*args,**kwargs)
        with patch.object(audit.runtime,'require_supervised_worker'),patch.object(audit,'_fingerprint',side_effect=self.fake_fingerprint),patch.object(audit,'_render',side_effect=self.fake_render),patch.object(zipfile.ZipFile,'open',spy):
            candidate=audit._build_audit(context,out,reservation)
        payload=audit.base._unseal(candidate)
        self.assertEqual(len(opened),5)
        self.assertEqual(len(payload['dispositions']),8)
        self.assertEqual(payload['summary']['rendered'],5)
        self.assertFalse(payload['audit_admission'])
        held=next(r for r in payload['dispositions'] if r['sample_id']==self.rows[7]['sample_id'])
        self.assertIsNone(held.get('pixel_sha256'));self.assertNotIn('path',held)

    def test_full_zip_closure_precedes_every_member_read(self):
        self.make_archive(extra='../escape.png');out=self.data/'bad-worker';out.mkdir()
        with patch.object(audit.runtime,'require_supervised_worker'),patch.object(zipfile.ZipFile,'open',side_effect=AssertionError('member opened')):
            with self.assertRaises(ValueError): audit._build_audit(self.context(),out,audit._reserve(self.context(),out))

    def test_header_rejections_precede_decoder(self):
        for data in (png(17,64),png(5000,4000),png()[:-1],b'\xff\xd8broken',b'x'*(16*1024**2+1)):
            with self.subTest(length=len(data)),patch.object(audit,'_decode_rgb',side_effect=AssertionError('decoder called')):
                with self.assertRaises(ValueError): audit._fingerprint(data)

    def test_unused_dev_is_only_strict_hold_actual_or_review_exposure_is_primary_hold(self):
        rows=copy.deepcopy(self.rows)
        rows[2]['dependency_group_id']=rows[3]['dependency_group_id']='relay'
        rows[4]['dependency_group_id']=rows[0]['dependency_group_id']
        manifest=copy.deepcopy(self.manifest);manifest['dispositions']=rows
        result=audit._overlay(manifest,{},dict(entries=[],known_links=[],unresolved_preview_status='unknown'),[],None)
        byid={r['sample_id']:r for r in result['dispositions']}
        self.assertIn('actual_exposure_candidate_family',byid[rows[4]['sample_id']]['audit_reasons'])
        self.assertFalse(byid[rows[4]['sample_id']]['strict_publisher_partition_eligible'])
        self.assertNotIn('verified_label_conflict',byid[rows[2]['sample_id']]['audit_reasons'])

    def test_excluded_dev_relay_and_incompatible_external_bgr(self):
        manifest=copy.deepcopy(self.manifest);rows=manifest['dispositions']
        excluded=dict(rows[0],sample_id='excluded',member='train/undamagedpackages/excluded.png',source_family='unused',sha256='c'*64,
            dependency_group_id='unused-relay',disposition='held')
        rows.append(excluded);rows[2]['dependency_group_id']='unused-relay'
        ledger=dict(entries=[],known_links=[],unresolved_preview_status='unknown')
        first=audit._overlay(manifest,{},ledger,[],None)
        row=next(r for r in first['dispositions'] if r['sample_id']==rows[2]['sample_id'])
        self.assertEqual(row['audit_reasons'],[]);self.assertFalse(row['strict_publisher_partition_eligible'])
        excluded['sha256']=rows[0]['sha256']
        second=audit._overlay(manifest,{},ledger,[],None)
        row=next(r for r in second['dispositions'] if r['sample_id']==rows[2]['sample_id'])
        self.assertIn('actual_exposure_candidate_family',row['audit_reasons'])
        manifest=copy.deepcopy(self.manifest)
        fp={rows[2]['sample_id']:dict(width=64,height=64,pixel_sha256='e'*64,dhash='0'*16)}
        external=dict(reference_id='old-BGR',sha256='b'*64,width=64,height=64,pixel_sha256='e'*64,dhash='0'*16,kind='human_review',fingerprint_convention='unoriented_BGR')
        third=audit._overlay(manifest,fp,ledger,[external],None)
        self.assertEqual(next(r for r in third['dispositions'] if r['sample_id']==rows[2]['sample_id'])['audit_reasons'],[])
        external['fingerprint_convention']='oriented_RGB_v1'
        fourth=audit._overlay(manifest,fp,ledger,[external],None)
        self.assertIn('actual_exposure_candidate_family',next(r for r in fourth['dispositions'] if r['sample_id']==rows[2]['sample_id'])['audit_reasons'])

    def test_exact_conflict_not_merely_conservative_labels_and_shape_aware_pixels(self):
        rows=copy.deepcopy(self.rows)
        rows[2]['sha256']=rows[3]['sha256'];rows[4]['source_family']=rows[2]['source_family']
        manifest=copy.deepcopy(self.manifest);manifest['dispositions']=rows
        result=audit._overlay(manifest,{},dict(entries=[],known_links=[],unresolved_preview_status='unknown'),[],None)
        byid={r['sample_id']:r for r in result['dispositions']}
        self.assertIn('verified_label_conflict',byid[rows[2]['sample_id']]['audit_reasons'])
        self.assertIn('conflict_candidate_family',byid[rows[4]['sample_id']]['audit_reasons'])
        pixels={rows[2]['sample_id']:dict(width=64,height=64,pixel_sha256='e'*64,dhash='0'*16),
                rows[5]['sample_id']:dict(width=128,height=32,pixel_sha256='e'*64,dhash='f'*16)}
        manifest['dispositions'][3]['sha256']='b'*64
        result=audit._overlay(manifest,pixels,dict(entries=[],known_links=[],unresolved_preview_status='unknown'),[],None)
        byid={r['sample_id']:r for r in result['dispositions']}
        self.assertNotEqual(byid[rows[2]['sample_id']]['audit_dependency_group_id'],byid[rows[5]['sample_id']]['audit_dependency_group_id'])

    def test_differently_encoded_equal_rgb_joins_exactly_but_perceptual_is_conservative(self):
        ledger=dict(entries=[],known_links=[],unresolved_preview_status='unknown')
        a,b=self.rows[2],self.rows[4]
        self.assertNotEqual(a['sha256'],b['sha256'])
        fp={a['sample_id']:dict(width=64,height=64,pixel_sha256='e'*64,dhash='0'*16),
            b['sample_id']:dict(width=64,height=64,pixel_sha256='e'*64,dhash='f'*16)}
        result=audit._overlay(self.manifest,fp,ledger,[],None)
        rows={r['sample_id']:r for r in result['dispositions']}
        self.assertEqual(rows[a['sample_id']]['audit_dependency_group_id'],rows[b['sample_id']]['audit_dependency_group_id'])
        self.assertTrue(any(e['basis']=='pixel_sha256' and e['verified'] for e in result['graph']['edges']))
        fp[b['sample_id']]['pixel_sha256']='d'*64;fp[b['sample_id']]['dhash']='0000000000000001'
        result=audit._overlay(self.manifest,fp,ledger,[],None)
        self.assertTrue(any(e['basis']=='dhash_candidate' and not e['verified'] for e in result['graph']['edges']))

    def test_encoded_member_drift_is_fatal_not_technical_attrition(self):
        self.make_archive();out=self.data/'drift';out.mkdir();context=self.context()
        for row in context['candidates']:row['sha256']='0'*64
        with patch.object(audit.runtime,'require_supervised_worker'),patch.object(audit,'_fingerprint',side_effect=AssertionError('decoder')):
            with self.assertRaisesRegex(ValueError,'encoded hash'):
                audit._build_audit(context,out,audit._reserve(context,out))


class AdmissionTests(AuditFixture):
    make_archive=TechnicalAndGraphTests.make_archive
    context=TechnicalAndGraphTests.context
    fake_fingerprint=TechnicalAndGraphTests.fake_fingerprint
    fake_render=TechnicalAndGraphTests.fake_render

    def build_candidate(self):
        self.make_archive();out=self.data/'candidate';out.mkdir()
        context=self.context();reservation=audit._reserve(context,out)
        audit.runtime.write_json_exclusive(out/'request.json',dict(protocol=context['protocol_binding'],reservation=reservation,
            limits=vars(audit.audit_limits()),code_bindings=audit._code_bindings()))
        request=audit._record(out/'request.json')
        with patch.object(audit.runtime,'require_supervised_worker'),patch.object(audit,'_fingerprint',side_effect=self.fake_fingerprint),patch.object(audit,'_render',side_effect=self.fake_render):
            candidate=audit._build_audit(context,out,reservation)
        audit.runtime.write_json_exclusive(out/'audit.result.json',dict(status='success',returncode=0,reason=None,elapsed_seconds=1,peak_rss_bytes=1024))
        native=audit._record(out/'audit.result.json')
        audit.runtime.write_json_exclusive(out/'audit-completion.json',dict(candidate=audit._record(candidate),request=request,native=native,reservation=reservation))
        return candidate

    def make_review(self,candidate,quality=None,rights=None,links=None):
        payload=audit.base._unseal(candidate)
        key=audit.base._unseal(Path(payload['neutral_review']['sample_key']['path']))
        observations=[];reviews=[]
        for row in key['samples']:
            obs=dict(case_id=row['case_id'],quality='suitable',observed_condition='Damaged' if row['label']=='Normal' else 'Normal',notes='independent fixture observation')
            if quality and row['sample_id']==quality:obs['quality']='ambiguous';obs['observed_condition']='Uncertain'
            if rights and row['sample_id']==rights:obs['rights_flag']='stock watermark'
            observations.append(obs)
            reviews.append(dict(obs,sample_id=row['sample_id'],sha256=row['sha256']))
        obs_binding=self.write('observations.json',dict(schema_version=1,publisher_key_opened=False,model_predictions_seen=False,observations=observations))
        lock=self.write('lock.json',dict(observations_sha256=obs_binding['sha256'],key_unopened=True,predictions_unseen=True))
        independent=self.write('review-note.json',dict(schema_version=1,kind='independent_source_test_audit_review_v1',status='accepted',
            source_sha256=self.source_sha,candidate_sha256=digest(candidate.read_bytes()),independent_reviewer='fixture reviewer',
            observations_sha256=obs_binding['sha256'],sample_key_sha256=payload['neutral_review']['sample_key']['sha256'],
            neutral_manifest_sha256=payload['neutral_review']['neutral_manifest']['sha256'],lock_sha256=lock['sha256']))
        value=dict(schema_version=1,candidate_sha256=digest(candidate.read_bytes()),source_sha256=self.source_sha,decision='accept',
            independent_reviewer='fixture reviewer',bindings=dict(policy=self.protocol,**payload['neutral_review'],observations=obs_binding,lock=lock,
                independent_review=independent),sampled_reviews=reviews,
            rights_holds=[] if not rights else [dict(sample_id=rights,sha256=next(r['sha256'] for r in key['samples'] if r['sample_id']==rights),reason='stock watermark')],
            dependency_links=links or [])
        return self.write('review.json',value),value

    def test_complete_suitable_disagreement_keeps_publisher_labels_and_no_claim(self):
        candidate=self.build_candidate();review,_=self.make_review(candidate)
        output=self.data/'admitted.json'
        result=audit.admit_audit(candidate,Path(review['path']),output)
        with patch.object(audit,'_decode_rgb',side_effect=AssertionError('load decoded pixels')):
            payload=audit.load_audit(result)
        self.assertTrue(payload['audit_admission']);self.assertFalse(payload['training_admission'])
        self.assertEqual(payload['evaluation_status'],'not_run')
        original={r['sample_id']:r['label'] for r in self.rows}
        self.assertTrue(all(r['label']==original[r['sample_id']] for r in payload['rows']))

    def test_suitable_stock_is_rights_hold_without_quality_lie(self):
        candidate=self.build_candidate();sid=self.rows[2]['sample_id'];review,_=self.make_review(candidate,rights=sid)
        result=audit.admit_audit(candidate,Path(review['path']),self.data/'rights-admitted.json')
        payload=audit.load_audit(result)
        held=next(r for r in payload['dispositions'] if r['sample_id']==sid)
        self.assertEqual(held['audit_quality_observation']['quality'],'suitable')
        self.assertIn('rights_candidate_family',held['audit_reasons'])
        self.assertNotIn(sid,{r['sample_id'] for r in payload['rows']})

    def test_missing_case_wrong_lock_omitted_rights_and_duplicate_link_rejected(self):
        candidate=self.build_candidate();sid=self.rows[2]['sample_id']
        review,value=self.make_review(candidate,rights=sid)
        for kind in ('case','lock','rights','link'):
            bad=copy.deepcopy(value)
            if kind=='case':bad['sampled_reviews'].pop()
            elif kind=='lock':bad['bindings']['lock']=self.write('bad-lock.json',dict(observations_sha256='f'*64,key_unopened=True))
            elif kind=='rights':bad['rights_holds']=[]
            else:
                a,b=self.rows[2:4]
                link=dict(left_sample_id=a['sample_id'],right_sample_id=b['sample_id'],left_sha256=next(r['sha256'] for r in self.manifest['dispositions'] if r['sample_id']==a['sample_id']),
                    right_sha256=next(r['sha256'] for r in self.manifest['dispositions'] if r['sample_id']==b['sample_id']),basis='same photo',strength='conservative_review_dependency')
                bad['dependency_links']=[link,link]
            rec=self.write('bad-review.json',bad)
            with self.subTest(kind=kind),self.assertRaises(ValueError):
                audit.admit_audit(candidate,Path(rec['path']),self.data/('bad-'+kind+'.json'))

    def test_hold_propagation_no_backfill_and_frozen_review_drift(self):
        candidate=self.build_candidate();rows=self.manifest['dispositions'];a,b=rows[2:4]
        link=dict(left_sample_id=a['sample_id'],right_sample_id=b['sample_id'],left_sha256=a['sha256'],right_sha256=b['sha256'],basis='same photo',strength='conservative_review_dependency')
        review,value=self.make_review(candidate,quality=a['sample_id'],links=[link])
        result=audit.admit_audit(candidate,Path(review['path']),self.data/'held-admitted.json')
        payload=audit.load_audit(result)
        self.assertTrue({a['sample_id'],b['sample_id']}.isdisjoint({r['sample_id'] for r in payload['rows']}))
        self.assertEqual(len(payload['dispositions']),8)
        Path(review['path']).write_text('{}',encoding='utf-8')
        with self.assertRaises(ValueError):audit.load_audit(result)

    def test_encoded_and_native_drift_are_rejected_without_decode(self):
        candidate=self.build_candidate();payload=audit.load_audit(candidate)
        path=self.root/payload['rows'][0]['path'];path.write_bytes(b'changed fixture')
        with self.assertRaises(ValueError):audit.load_audit(candidate)

    def test_missing_class_preserves_blocked_overlay_and_unsafe_output_rejected(self):
        candidate=self.build_candidate();review,value=self.make_review(candidate)
        value['rights_holds']=[dict(sample_id=r['sample_id'],sha256=r['sha256'],reason='explicit fixture stock evidence') for r in self.manifest['dispositions'] if r['split']=='test' and r['label']=='Normal']
        rec=self.write('no-normal-review.json',value);output=self.data/'blocked.json'
        with self.assertRaises(ValueError):audit.admit_audit(candidate,Path(rec['path']),output)
        blocked=audit.load_audit(output)
        self.assertFalse(blocked['audit_admission']);self.assertEqual(blocked['admission_blockers'],['missing_Normal'])
        with self.assertRaises(ValueError):audit.admit_audit(candidate,Path(review['path']),self.root/'unsafe.json')

    def test_native_completion_and_neutral_case_drift_rejected(self):
        candidate=self.build_candidate();completion=candidate.parent/'audit-completion.json'
        doc=json.loads(completion.read_text());native=doc['native'];Path(native['path']).write_text('{}',encoding='utf-8')
        with self.assertRaises(ValueError):audit.load_audit(candidate)

    def test_relocated_neutral_bundle_and_native_sidecar_are_rejected(self):
        candidate=self.build_candidate();payload=audit.base._unseal(candidate)
        # A complete re-sealed foreign bundle remains outside the monitored tree.
        folder=self.data/'foreign';(folder/'neutral').mkdir(parents=True)
        original_key=Path(payload['neutral_review']['sample_key']['path'])
        (folder/'private-key.json').write_bytes(original_key.read_bytes())
        neutral=audit.base._unseal(Path(payload['neutral_review']['neutral_manifest']['path']))
        for row in neutral['cases']:
            path=folder/'neutral'/Path(row['neutral_path']).name
            path.write_bytes((self.root/row['neutral_path']).read_bytes())
            row['neutral_path']=path.relative_to(self.root).as_posix()
        audit.base._seal(folder/'neutral-manifest.json',neutral)
        payload['neutral_review']=dict(sample_key=audit._record(folder/'private-key.json'),neutral_manifest=audit._record(folder/'neutral-manifest.json'))
        candidate.write_text(json.dumps(dict(payload=payload,sha256=audit.base._digest(payload))),encoding='utf-8')
        completion=candidate.parent/'audit-completion.json';doc=json.loads(completion.read_text());doc['candidate']=audit._record(candidate)
        completion.write_text(json.dumps(doc),encoding='utf-8')
        with self.assertRaises(ValueError):audit.load_audit(candidate)

    def test_relocated_native_sidecar_is_not_monitored_output(self):
        candidate=self.build_candidate();completion=candidate.parent/'audit-completion.json';doc=json.loads(completion.read_text())
        original=Path(doc['native']['path']);foreign=self.records/'foreign-audit.result.json';foreign.write_bytes(original.read_bytes())
        doc['native']=audit._record(foreign);completion.write_text(json.dumps(doc),encoding='utf-8')
        with self.assertRaises(ValueError):audit.load_audit(candidate)

    def test_independent_acceptance_must_bind_the_observation_lock(self):
        candidate=self.build_candidate();review,value=self.make_review(candidate)
        independent=json.loads(Path(value['bindings']['independent_review']['path']).read_text());independent.pop('lock_sha256')
        value['bindings']['independent_review']=self.write('unbound-lock-independent.json',independent)
        bad=self.write('unbound-lock-review.json',value)
        with self.assertRaises(ValueError):audit.admit_audit(candidate,Path(bad['path']),self.data/'bad-lock-final.json')

    def test_blindness_flags_and_independent_acceptance_are_semantic(self):
        candidate=self.build_candidate();review,value=self.make_review(candidate)
        obs=json.loads(Path(value['bindings']['observations']['path']).read_text());obs['model_predictions_seen']=True
        newobs=self.write('seen-observations.json',obs);value['bindings']['observations']=newobs
        value['bindings']['lock']=self.write('seen-lock.json',dict(observations_sha256=newobs['sha256'],key_unopened=True,predictions_unseen=True))
        bad=self.write('seen-review.json',value)
        with self.assertRaises(ValueError):audit.admit_audit(candidate,Path(bad['path']),self.data/'seen.json')
        review,value=self.make_review(candidate)
        value['bindings']['independent_review']=self.write('empty-independent.json',{'status':'accepted'})
        bad=self.write('bad-independent-review.json',value)
        with self.assertRaises(ValueError):audit.admit_audit(candidate,Path(bad['path']),self.data/'foreign-review.json')

    def test_prepare_public_boundary_uses_only_fake_supervisor_and_fixed_limits(self):
        self.make_archive();owner=self;calls=[]
        class FakeSupervisor:
            def __init__(self,output,limits):self.output=output;self.limits=limits
            def preflight(self):calls.append('preflight');return dict(fixture=True)
            def run(self,command,**kwargs):
                calls.append('run');self.preflight()
                owner.assertEqual(vars(self.limits),vars(audit.audit_limits()))
                audit._worker(Path(command[-1]))
                result=dict(status='success',returncode=0,reason=None,elapsed_seconds=1,peak_rss_bytes=1024)
                audit.runtime.write_json_exclusive(self.output/'audit.result.json',result)
                return result
        with patch.object(audit.runtime,'ResourceSupervisor',FakeSupervisor),patch.object(audit.runtime,'require_supervised_worker'),patch.object(audit,'_fingerprint',side_effect=self.fake_fingerprint),patch.object(audit,'_render',side_effect=self.fake_render):
            candidate=audit.prepare_audit(Path(self.protocol['path']),self.data/'public')
        self.assertEqual(calls,['preflight','run','preflight'])
        self.assertEqual(audit.load_audit(candidate)['summary']['attempted'],5)


if __name__=='__main__':
    unittest.main()
