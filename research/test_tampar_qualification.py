"""Artificial-only qualification contracts; never fetch or decode project data."""
import copy
import hashlib
import http.client
import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import threading
import time
import unittest
import zlib
from unittest.mock import patch

try:
    import tampar_qualification as tq
except ModuleNotFoundError:
    tq = None


class Response(io.BytesIO):
    def __init__(self, data, start, end, *, status=206, total=6407977888,
                 url='https://zenodo.org/api/records/10057090/files/tampar.zip/content', headers=None):
        super().__init__(data)
        self.status = status
        self.headers = {'Content-Range': f'bytes {start}-{end}/{total}',
                        'Content-Length': str(end-start+1), 'Content-Encoding': 'identity'}
        if headers:
            self.headers.update(headers)
        self.url = url
        self.read_calls = 0

    def geturl(self):
        return self.url

    def read1(self, amount):
        self.read_calls += 1
        return super().read(amount)


def member(data=b'synthetic jpeg bytes', *, method=8, flags=0, extra=b''):
    name = 'tampar/validation/base/id_00_20230512_102251.jpg'
    if method == 8:
        encoder = zlib.compressobj(wbits=-15)
        payload = encoder.compress(data) + encoder.flush()
    else:
        payload = data
    header = struct.pack('<4s5H3L2H', b'PK\x03\x04', 20, flags, method, 0, 0,
                         zlib.crc32(data), len(payload), len(data), len(name.encode()), len(extra))
    row = dict(source_path=name, review_id='Q01', future_local_original_name='Q01.jpg',
               source_width=8, source_height=6,
               archive_entry=dict(path=name, header_offset=0, size=len(data),
                                  compressed_size=len(payload), crc32=zlib.crc32(data), method=method),
               iilas_visible_condition=None, iilas_visibility=None, approved_physical_identity=None,
               publisher_original_category_id=0, publisher_original_category_name='normal box')
    return header+name.encode()+extra+payload, row


def segment(kind, body):
    return bytes([255,kind])+struct.pack('>H',len(body)+2)+body


def structural_jpeg(kind=0xc0, entropy=b'pixels\xff\x00x\xff\xd0y\xff\xff\xd7z', *, app=b'', scans=1):
    frame=segment(kind,b'\x08\x00\x06\x00\x08\x03\x01\x11\x00\x02\x11\x00\x03\x11\x00')
    scan=segment(0xda,b'\x03\x01\x00\x02\x00\x03\x00\x00'+bytes([0 if kind==0xc2 else 63,0]))
    return b'\xff\xd8'+app+frame+(scan+entropy)*scans+b'\xff\xd9'


def sef_suffix(*, version=0xfedcba98, records=((0xa01,b'A',b'opaque'),(0xaa1,b'B',b'\xff\xd9'))):
    data=b'';entries=[]
    for kind,name,payload in records:
        record=struct.pack('<HHI',0,kind,len(name))+name+payload
        entries.append((len(data),len(record),kind));data+=record
    directory=b'SEFH'+struct.pack('<II',version,len(entries))
    for start,size,kind in entries:
        directory+=struct.pack('<HHII',0,kind,len(data)-start,size)
    return data+directory+struct.pack('<I',len(directory))+b'SEFT'


class JpegStructureContracts(unittest.TestCase):
    def test_valid_trailer_is_accepted_by_compatibility_wrapper(self):
        try:dimensions=tq._jpeg_dimensions(structural_jpeg()+sef_suffix())
        except tq.QualificationError as error:self.fail('Structured trailer must be accepted: '+str(error))
        self.assertEqual(dimensions,(8,6))

    def test_embedded_thumbnail_eoi_and_multiscan_entropy_are_structural(self):
        for kind in (0xc0,0xc1,0xc2):
            raw=structural_jpeg(kind,app=segment(0xe1,b'EXIF\xff\xd9\xff\xd8thumbnail'),scans=2)
            facts=tq.inspect_jpeg(raw+sef_suffix())
            self.assertEqual((facts['width'],facts['height']),(8,6))
            self.assertEqual(facts['jpeg_codestream_end'],len(raw))
            self.assertEqual(facts['jpeg_trailer_kind'],'SEFH/SEFT')
            self.assertEqual(facts['jpeg_trailer_bytes'],len(sef_suffix()))
            self.assertEqual(facts['jpeg_trailer_directory_count'],2)
            self.assertEqual(facts['jpeg_trailer_version'],0xfedcba98)
            self.assertEqual(facts['jpeg_trailer_records'][0],dict(type=0xa01,name='A',start=len(raw),end=len(raw)+15))
        plain=tq.inspect_jpeg(structural_jpeg())
        self.assertEqual(plain['jpeg_trailer_kind'],'none')
        self.assertEqual(plain['jpeg_trailer_records'],[])

    def test_malformed_jpeg_structure_fails_even_with_embedded_eoi(self):
        raw=structural_jpeg();frame=raw[2:21];scan=raw[21:35]
        cases=[raw[:-2],raw+b'junk',b'\xff\xd8\xff\xd9',b'\xff\xd8'+scan+b'x\xff\xd9',
               b'\xff\xd8'+frame+b'\xff\xd9',raw[:2]+b'\xff\xd8'+raw[2:],
               b'\xff\xd8'+segment(0xe1,b'\xff\xd9')+frame+scan+b'x',
               b'\xff\xd8\xff\xe1\x00\x01'+raw[2:],b'\xff\xd8\xff\xe1\xff\xff',
               structural_jpeg(0xc3),raw[:21]+frame.replace(b'\x00\x08',b'\x00\x09',1)+raw[21:],
               raw[:21]+frame.replace(b'\x08\x00',b'\x0c\x00',1)+raw[21:],
               raw[:21]+segment(0xda,b'\x01\x09\x00\x00\x3f\x00')+b'x\xff\xd9',
               raw.replace(b'\x03\x01\x11',b'\x04\x01\x11',1),
               b'\xff\xd8'+segment(0xe1,b'\xff\xd9')+b'\xff\xd9',
               raw+b'x'*(16*tq.MIB)]
        for index,value in enumerate(cases):
            with self.subTest(case=index),self.assertRaises(tq.QualificationError):tq.inspect_jpeg(value)

    def test_malformed_sef_suffix_fails_closed(self):
        good=sef_suffix();directory=len(good)-44
        cases=[good[:-1],good+b'junk',b'\xff\xd9',b'x'*65537,
               sef_suffix(records=()),sef_suffix(records=((1,b'',b'x'),)),
               sef_suffix(records=((1,b'A'*129,b'x'),)),sef_suffix(records=((1,b'\x1f',b'x'),))]
        for offset,value in ((len(good)-4,b'NOPE'),(len(good)-8,struct.pack('<I',35)),
                             (directory,b'NOPE'),(directory+8,struct.pack('<I',1025)),
                             (directory+12,b'\x01\x00'),(directory+14,b'\xff\xff'),
                             (directory+16,struct.pack('<I',0xffffffff)),
                             (directory+16,struct.pack('<I',1)),
                             (directory+20,struct.pack('<I',8)),
                             (directory+20,struct.pack('<I',14)),
                             (directory+28,struct.pack('<I',len(good))),
                             (directory+28,struct.pack('<I',directory)),
                             (4,struct.pack('<I',128))):
            changed=bytearray(good);changed[offset:offset+len(value)]=value;cases.append(bytes(changed))
        cases.append(b'x'+good)  # unaccounted byte before records
        for index,suffix in enumerate(cases):
            with self.subTest(case=index),self.assertRaises(tq.QualificationError):
                tq.inspect_jpeg(structural_jpeg()+suffix)

    def test_full_original_decode_and_hashes_unchanged_with_valid_trailer(self):
        import cv2
        import numpy as np
        source=np.empty((6,8,3),dtype=np.uint8);source[:]=[17,73,191]
        for progressive in (0,1):
            success,encoded=cv2.imencode('.jpg',source,[cv2.IMWRITE_JPEG_PROGRESSIVE,progressive])
            self.assertTrue(success);plain=encoded.tobytes();original=plain+sef_suffix()
            before=hashlib.sha256(original).hexdigest();real_decode=cv2.imdecode;seen=[]
            def observe(buffer,flags):
                seen.append(buffer.tobytes());return real_decode(buffer,flags)
            reference=tq.decode_jpeg(plain,8,6)
            with patch.object(cv2,'imdecode',side_effect=observe):result=tq.decode_jpeg(original,8,6)
            self.assertEqual(seen,[original]);self.assertEqual(hashlib.sha256(original).hexdigest(),before)
            for key in ('decoded_bgr_sha256','decoded_rgb_sha256','decoded_digest_convention'):
                self.assertEqual(result[key],reference[key])
            self.assertEqual(result['jpeg_codestream_end'],len(plain))
            with self.assertRaises(tq.QualificationError):tq.decode_jpeg(original,9,6)


class AmendmentContracts(unittest.TestCase):
    def test_large_structural_member_receipt_keeps_terminal_disposition_bounded(self):
        root=tq.ROOT/'outputs/parcel-warm-integration-20261022/tampar-runner/pure-fixtures'
        with tempfile.TemporaryDirectory(dir=root) as folder:
            out=Path(folder);(out/'tmp').mkdir()
            facts=tq.inspect_jpeg(structural_jpeg()+sef_suffix(records=tuple((i,b'A',b'') for i in range(1024))))
            record=dict(status='success',original_preserved=True,**facts)
            self.assertGreater(len(tq._json_bytes(record)),16*1024)
            def synthetic_stop(rows,budget):
                budget.write('members/Q01.json',tq._json_bytes(record))
                raise tq.QualificationError('synthetic stop after member receipt')
            request=dict(output=str(out));manifest=dict(selected=[dict(review_id='Q01')])
            with patch.object(tq.native,'require_supervised_worker'),patch.object(tq,'load_request',return_value=(request,manifest,{})),\
                 patch.object(tq,'check_review',return_value='a'*64),patch.object(tq,'acquire_rows',side_effect=synthetic_stop),\
                 patch.dict(os.environ,{'TEMP':str(out/'tmp'),'TMP':str(out/'tmp')}),\
                 patch.object(tempfile,'tempdir',str(out/'tmp')):
                with self.assertRaisesRegex(tq.QualificationError,'synthetic stop after member receipt'):
                    tq.acquire(out/'request.json','b'*64)
            terminal=json.loads((out/'worker.json').read_text())
            self.assertEqual(terminal['dispositions'],[dict(review_id='Q01',status='success',original_preserved=True)])
            self.assertLess((out/'worker.json').stat().st_size,tq.TERMINAL_RESERVE//2)
            self.assertNotIn('jpeg_trailer_records',terminal)

    def test_pinned_amendment_drift_rejected(self):
        root=tq.ROOT/'outputs/parcel-warm-integration-20261022/tampar-runner/pure-fixtures'
        with tempfile.TemporaryDirectory(dir=root) as folder:
            altered=Path(folder)/'amendment.json';altered.write_text('{}')
            with patch.object(tq,'JPEG_AMENDMENT',altered),self.assertRaises(tq.QualificationError):tq.frozen_inputs()

    def test_fresh_v2_request_review_bind_amendment_and_reject_drift(self):
        root=tq.ROOT/'research/datasets/tampar-qualification-fixtures'
        root.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as folder:
            out=Path(folder)/'attempt-02'
            with patch.object(tq,'DEST',out):
                request_path=tq.prepare(out);request=json.loads(request_path.read_text())
                self.assertEqual(request['schema'],'iilas.tampar.qualification-request.v2')
                self.assertEqual(request['jpeg_amendment_sha256'],'3a71c15f6a82983f7e8958e66e9c30e543435023d72e66ab90e99d91fb45d1b5')
                self.assertIsNone(request['condition_labels']);self.assertIsNone(request['human_approval'])
                pin=tq.native.sha256_file(request_path);tq.load_request(request_path,pin)
                review=dict(schema='iilas.tampar.qualification-code-request-review.v2',
                            decision='APPROVE_ONE_BOUNDED_DEVELOPMENT_ACQUISITION',request_sha256=pin,
                            manifest_sha256=tq.MANIFEST_SHA,protocol_sha256=tq.PROTOCOL_SHA,
                            jpeg_amendment_sha256=request['jpeg_amendment_sha256'],
                            code_identities=request['code_identities'],policy=tq.policy(),output=str(out),
                            blocking_findings=[],reviewer='artificial fixture',reviewed_utc='2026-10-22T00:00:00Z')
                review_path=out/'code-request-review.json';review_path.write_bytes(tq._json_bytes(review))
                tq.check_review(out,request,pin)
                for key,value in (('jpeg_amendment_sha256','0'*64),('schema','iilas.tampar.qualification-code-request-review.v1'),('unexpected',True)):
                    altered=dict(review);altered[key]=value;review_path.write_bytes(tq._json_bytes(altered))
                    with self.subTest(review=key),self.assertRaises(tq.QualificationError):tq.check_review(out,request,pin)
                for key,value in (('jpeg_amendment_sha256','0'*64),('schema','iilas.tampar.qualification-request.v1'),('condition_labels',[]),('unexpected',True)):
                    altered=dict(request);altered[key]=value;request_path.write_bytes(tq._json_bytes(altered))
                    with self.subTest(request=key),self.assertRaises(tq.QualificationError):
                        tq.load_request(request_path,tq.native.sha256_file(request_path))
                with self.assertRaises((tq.QualificationError,tq.native.RuntimeSafetyError)):tq.prepare(out)


class Contracts(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(tq, 'new qualification module is required')
        fixture_root=tq.ROOT/'outputs/parcel-warm-integration-20261022/tampar-runner/pure-fixtures'
        fixture_root.mkdir(parents=True,exist_ok=True)
        self.folder = tempfile.TemporaryDirectory(dir=fixture_root)
        self.addCleanup(self.folder.cleanup)
        self.out = Path(self.folder.name)

    def budget(self, **kwargs):
        return tq.Budget(self.out, **kwargs)

    def test_frozen_twenty_metadata_and_null_condition(self):
        manifest, protocol = tq.frozen_inputs()
        self.assertEqual([r['review_id'] for r in manifest['selected']], [f'Q{i:02}' for i in range(1,21)])
        self.assertEqual(sum(r['archive_entry']['size'] for r in manifest['selected']), 106506935)
        self.assertEqual(len(manifest['omitted_annotated_members']), 712)
        self.assertEqual(len(manifest['id00_unannotated_extras_excluded']), 4)
        for row in manifest['selected']:
            self.assertEqual(row['publisher_original_category_name'], 'normal box')
            for key in ('iilas_visible_condition','iilas_visibility','approved_physical_identity','encoded_sha256','decoded_sha256'):
                self.assertIsNone(row[key])
        self.assertEqual(protocol['later_acquisition_resource_policy']['maximum_total_output_bytes'],134217728)

    def test_manifest_mutation_missing_or_replaced_selection_rejected(self):
        manifest, _ = tq.frozen_inputs()
        for change in ('missing','replacement','condition','traversal','category'):
            altered = copy.deepcopy(manifest)
            if change == 'missing': altered['selected'].pop()
            if change == 'replacement': altered['selected'][1]=copy.deepcopy(altered['selected'][0])
            if change == 'condition': altered['selected'][0]['iilas_visible_condition']='Normal'
            if change == 'traversal': altered['selected'][0]['future_local_original_name']='../Q01.jpg'
            if change == 'category': altered['selected'][0]['publisher_original_category_name']='Normal'
            with self.subTest(change=change), self.assertRaises(tq.QualificationError):
                tq.validate_manifest(altered)

    def test_source_drift_rejected(self):
        path=self.out/'source.json';path.write_bytes(b'original')
        identity=dict(path=str(path),bytes=8,sha256=hashlib.sha256(b'original').hexdigest())
        tq.verify_identity(identity)
        path.write_bytes(b'modified')
        with self.assertRaises(tq.QualificationError):tq.verify_identity(identity)

    def test_json_duplicate_keys_rejected(self):
        path=self.out/'request.json';path.write_bytes(b'{"a":1,"a":2}')
        with self.assertRaises(tq.QualificationError):tq.read_json(path)

    def test_request_pin_and_closed_schema(self):
        path=self.out/'request.json';path.write_bytes(b'{}')
        with self.assertRaises(tq.QualificationError):tq.load_request(path,'0'*64)
        with self.assertRaises(tq.QualificationError):tq.load_request(path,hashlib.sha256(b'{}').hexdigest())

    def test_prepare_wrong_output_does_not_create(self):
        target=self.out/'attempt'
        with self.assertRaises(tq.QualificationError):tq.prepare(target)
        self.assertFalse(target.exists())

    def test_full_http_response_rejected_before_body(self):
        response=Response(b'x'*100,0,2,status=200)
        with self.assertRaises(tq.QualificationError):
            tq.get_range(0,2,self.budget(),opener=lambda *a,**k:response)
        self.assertEqual(response.read_calls,0)
        events=[json.loads(x) for x in (self.out/'network.jsonl').read_text().splitlines()]
        self.assertEqual(events[0]['reserved_body_bytes'],4)
        self.assertEqual(events[-1]['received_body_bytes'],0)

    def test_exact_range_success_and_charged_sentinel(self):
        budget=self.budget()
        data=tq.get_range(3,5,budget,opener=lambda *a,**k:Response(b'abc',3,5))
        self.assertEqual(data,b'abc');self.assertEqual(budget.network_reserved,4)
        self.assertEqual(budget.network_received,3)

    def test_bad_http_headers_rejected_without_read(self):
        for kwargs in ({'headers':{'Content-Range':'bytes 0-2/20'}},
                       {'headers':{'Content-Length':'4'}},
                       {'headers':{'Content-Encoding':'gzip'}},
                       {'url':'https://example.com/x'}):
            with self.subTest(kwargs=kwargs):
                root=self.out/str(len(list(self.out.iterdir())));root.mkdir()
                response=Response(b'abc',0,2,**kwargs)
                with self.assertRaises(tq.QualificationError):
                    tq.get_range(0,2,tq.Budget(root),opener=lambda *a,**k:response)
                self.assertEqual(response.read_calls,0)

    def test_truncated_and_trailing_response_preserve_actual_counts(self):
        for body, count in ((b'a',1),(b'abcd',4)):
            root=self.out/str(count);root.mkdir();budget=tq.Budget(root)
            with self.assertRaises(tq.QualificationError):
                tq.get_range(0,2,budget,opener=lambda *a,**k:Response(body,0,2))
            self.assertEqual(budget.network_received,count)
            self.assertEqual(budget.network_reserved,4)
            self.assertIn('failed',(root/'network.jsonl').read_text())

    def test_timeout_after_partial_is_charged_and_journaled(self):
        class Partial(Response):
            def read1(self, amount):
                if self.tell():raise TimeoutError('synthetic timeout')
                return super().read1(1)
        budget=self.budget()
        with self.assertRaises(tq.QualificationError):
            tq.get_range(0,2,budget,opener=lambda *a,**k:Partial(b'abc',0,2))
        self.assertEqual(budget.network_received,1)
        self.assertEqual(json.loads((self.out/'network.jsonl').read_text().splitlines()[-1])['received_body_bytes'],1)

    def test_incomplete_read_partial_is_recorded(self):
        class Partial(Response):
            def read1(self, amount):raise http.client.IncompleteRead(b'ab',3)
        budget=self.budget()
        with self.assertRaises(tq.QualificationError):
            tq.get_range(0,2,budget,opener=lambda *a,**k:Partial(b'',0,2))
        self.assertEqual(budget.network_received,2)

    def test_network_budget_reserves_before_open(self):
        called=[]
        with self.assertRaises(tq.QualificationError):
            tq.get_range(0,20,self.budget(network_cap=20),opener=lambda *a,**k:called.append(1))
        self.assertEqual(called,[])

    def test_original_exclusive_and_terminal_reserve(self):
        budget=self.budget(output_cap=100,terminal_reserve=20)
        budget.write('Q01.jpg',b'a'*80)
        with self.assertRaises(tq.QualificationError):budget.write('Q02.jpg',b'x')
        with self.assertRaises(FileExistsError):budget.write('Q01.jpg',b'')
        budget.write('terminal.json',b'b'*20,terminal=True)
        self.assertEqual(sum(p.stat().st_size for p in self.out.iterdir()),100)

    def test_external_partial_file_counts_against_output(self):
        (self.out/'partial.bin').write_bytes(b'x'*79)
        with self.assertRaises(tq.QualificationError):
            self.budget(output_cap=100,terminal_reserve=20).write('next',b'xx')

    def test_write_path_escape_rejected(self):
        with self.assertRaises(tq.QualificationError):self.budget().write('../escape',b'x')

    def test_zip_header_and_payload_roundtrip(self):
        archive,row=member();header=archive[:30]
        nlen,xlen=tq.validate_header(header,row)
        offset=30+nlen+xlen
        tq.validate_name_extra(archive[30:offset],row,nlen,xlen)
        self.assertEqual(tq.inflate(archive[offset:],row['archive_entry']),b'synthetic jpeg bytes')

    def test_zip_flags_methods_sizes_crc_and_name_fail_closed(self):
        archive,row=member()
        for offset,value in ((0,b'BAD!'),(6,struct.pack('<H',1)),(6,struct.pack('<H',8)),
                             (8,struct.pack('<H',99)),(14,struct.pack('<L',0)),
                             (18,struct.pack('<L',1)),(22,struct.pack('<L',1)),(26,b'\x00\x00')):
            header=bytearray(archive[:30]);header[offset:offset+len(value)]=value
            with self.subTest(offset=offset,value=value),self.assertRaises(tq.QualificationError):
                tq.validate_header(bytes(header),row)
        nlen=len(row['source_path'].encode())
        with self.assertRaises(tq.QualificationError):tq.validate_name_extra(b'x'*nlen,row,nlen,0)
        with self.assertRaises(tq.QualificationError):tq.validate_name_extra(archive[30:30+nlen]+b'\x01\x00\x00\x00',row,nlen,4)

    def test_bounded_inflate_crc_trailing_and_bomb_rejected(self):
        archive,row=member();payload=archive[30+len(row['source_path']):]
        for data,entry in ((payload+b'trailing',row['archive_entry']),
                           (payload[:-1],row['archive_entry']),
                           (payload,dict(row['archive_entry'],crc32=1)),
                           (payload,dict(row['archive_entry'],size=1))):
            with self.subTest(data=data),self.assertRaises(tq.QualificationError):tq.inflate(data,entry)

    def test_no_retry_after_failed_member_and_no_compressed_files(self):
        archive,row=member();calls=[]
        def opener(request,**kwargs):
            start,end=map(int,request.headers['Range'][6:].split('-'));calls.append((start,end))
            body=archive[start:end+1]
            return Response(body,start,end)
        with self.assertRaises(tq.QualificationError):
            tq.acquire_rows([row,dict(row,review_id='Q02')],self.budget(),opener=opener)
        self.assertEqual(len(calls),3)
        self.assertTrue((self.out/'originals/Q01.jpg').exists())
        self.assertFalse((self.out/'originals/Q02.jpg').exists())
        self.assertFalse(any(p.suffix=='.zip' for p in self.out.rglob('*')))

    def test_synthetic_jpeg_decode_dimensions_and_hash(self):
        import cv2
        import numpy as np
        success,encoded=cv2.imencode('.jpg',np.full((6,8,3),71,dtype=np.uint8))
        self.assertTrue(success)
        raw=encoded.tobytes()
        result=tq.decode_jpeg(raw,8,6)
        self.assertEqual(result['decoded_bgr_sha256'],hashlib.sha256(bytes([71])*144).hexdigest())
        with self.assertRaises(tq.QualificationError):tq.decode_jpeg(raw,9,6)
        with self.assertRaises(tq.QualificationError):tq.decode_jpeg(b'not-jpeg',8,6)

    def test_decoded_rgb_digest_uses_rgb_channel_order(self):
        import cv2
        import numpy as np
        source=np.empty((6,8,3),dtype=np.uint8);source[:]=[17,73,191]
        success,encoded=cv2.imencode('.jpg',source)
        self.assertTrue(success)
        independently_decoded=cv2.imdecode(encoded,cv2.IMREAD_COLOR)
        rgb_bytes=independently_decoded[:,:,::-1].tobytes()
        result=tq.decode_jpeg(encoded.tobytes(),8,6)
        self.assertIn('decoded_rgb_sha256',result)
        self.assertEqual(result['decoded_rgb_sha256'],hashlib.sha256(rgb_bytes).hexdigest())
        self.assertNotEqual(result['decoded_rgb_sha256'],result['decoded_bgr_sha256'])

    def test_redirect_handler_rejects_unrelated_without_followup(self):
        with self.assertRaises(tq.QualificationError):
            tq.ZenodoRedirect().redirect_request(None,None,302,'',{},'https://example.com/archive')

    def test_direct_worker_requires_native_supervision(self):
        with self.assertRaises((tq.QualificationError,RuntimeError)):tq.acquire(self.out/'missing','0'*64)

    def test_synthetic_member_success_preserves_unchanged_jpeg_and_null_fields(self):
        import cv2
        import numpy as np
        _,image=cv2.imencode('.jpg',np.full((6,8,3),71,dtype=np.uint8))
        raw=image.tobytes();archive,row=member(raw);calls=[]
        def opener(request,**kwargs):
            start,end=map(int,request.headers['Range'][6:].split('-'));calls.append((start,end))
            return Response(archive[start:end+1],start,end)
        result=tq.acquire_rows([row],self.budget(),opener=opener)
        self.assertEqual((self.out/'originals/Q01.jpg').read_bytes(),raw)
        self.assertEqual(result[0]['encoded_sha256'],hashlib.sha256(raw).hexdigest())
        self.assertIsNone(result[0]['human_approval']);self.assertIsNone(result[0]['iilas_visible_condition'])
        self.assertEqual(len(calls),3)

    def test_decode_failure_has_member_disposition_and_preserves_original(self):
        archive,row=member()
        def opener(request,**kwargs):
            start,end=map(int,request.headers['Range'][6:].split('-'))
            return Response(archive[start:end+1],start,end)
        with self.assertRaises(tq.QualificationError):tq.acquire_rows([row],self.budget(),opener=opener)
        self.assertTrue((self.out/'members/Q01.json').exists(),'Failed member disposition must persist')
        record=json.loads((self.out/'members/Q01.json').read_text())
        self.assertEqual(record['status'],'failed')
        self.assertTrue(record['original_preserved'])
        self.assertEqual(record['phase'],'decode')
        self.assertEqual(record['encoded_sha256'],hashlib.sha256(b'synthetic jpeg bytes').hexdigest())

    def test_preexisting_network_journal_cannot_be_reopened_as_fresh_budget(self):
        (self.out/'network.jsonl').write_bytes(b'prior attempt')
        with self.assertRaises(tq.QualificationError):self.budget()

    def test_output_name_with_windows_alternate_stream_rejected(self):
        with self.assertRaises(tq.QualificationError):self.budget().write('Q01.jpg:other',b'x')

    def test_review_receipt_must_bind_exact_code_request_policy_and_attempt(self):
        path=self.out/'code-request-review.json'
        request=dict(independent_request_review_file=path.name,code_identities=[])
        bad=dict(schema='iilas.tampar.qualification-code-request-review.v1',decision='APPROVE_PLAN_ONLY')
        path.write_text(json.dumps(bad))
        with self.assertRaises(tq.QualificationError):tq.check_review(self.out,request,'a'*64)

    def test_many_short_reads_preserve_terminal_network_receipt(self):
        class OneByte(Response):
            def read1(self, amount):return super().read1(1)
        budget=self.budget();budget.journal_bytes=2*1024*1024-1000
        result=tq.get_range(0,99,budget,opener=lambda *a,**k:OneByte(b'x'*100,0,99))
        self.assertEqual(result,b'x'*100)
        terminal=json.loads((self.out/'network.jsonl').read_text().splitlines()[-1])
        self.assertEqual(terminal['status'],'complete');self.assertEqual(terminal['received_body_bytes'],100)

    def test_range_journal_failure_uses_reserved_terminal_sidecar(self):
        budget=self.budget();budget.journal_bytes=2*1024*1024-300
        with self.assertRaises(tq.QualificationError):
            tq.get_range(0,2,budget,opener=lambda *a,**k:Response(b'ab',0,2))
        terminal=self.out/'network-terminal/01.json'
        self.assertTrue(terminal.exists(),'Terminal receipt has independent reserved capacity')
        self.assertIn('elapsed_seconds',json.loads(terminal.read_text()))


@unittest.skipUnless(os.name=='nt' and os.environ.get('IILAS_TAMPAR_NATIVE_TESTS')=='1',
                     'explicit serial native fixture window required')
class NativeContracts(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(tq)
        root=tq.ROOT/'research/datasets/tampar-qualification-fixtures'
        root.mkdir(exist_ok=True,parents=True)
        self.out=Path(tempfile.mkdtemp(prefix='native-',dir=root))
        self.addCleanup(self.reconcile_artificial_fixture)

    def reconcile_artificial_fixture(self):
        for job,worker in list(tq._UNCERTAIN_JOBS):
            if worker and worker.poll() is None:worker.kill()
            tq._drain(job,worker,time.monotonic()+5);job.close()
            tq._UNCERTAIN_JOBS.remove((job,worker))
            for relative in ('parcel-gpu-run-registry','parcel-visible-run-registry'):
                lock=tq.ROOT/'research/datasets'/relative/'active-job'
                if lock.exists():
                    (lock/'cleanup-unconfirmed.json').unlink();lock.rmdir()

    def test_caps_queried_before_resume_and_normal_drain(self):
        command=[sys.executable,'-c','import pathlib;pathlib.Path("done").write_text("synthetic")']
        result=tq.supervise(self.out,command,deadline_seconds=10)
        self.assertEqual(result['status'],'success',result)
        self.assertEqual(result['hard_limits']['job_memory_bytes'],2147483648)
        self.assertEqual(result['hard_limits']['process_memory_bytes'],2147483648)
        self.assertEqual(result['hard_limits']['affinity_mask'].bit_count(),1)
        self.assertLess(result['configured_monotonic'],result['resumed_monotonic'])
        self.assertEqual(result['remaining_job_members'],[])
        self.assertIsNotNone(result['returncode'])

    def test_worker_failure_has_terminal_receipt_and_drain(self):
        result=tq.supervise(self.out,[sys.executable,'-c','raise SystemExit(7)'],deadline_seconds=10)
        self.assertEqual(result['status'],'failed');self.assertEqual(result['returncode'],7)
        self.assertEqual(result['remaining_job_members'],[])
        self.assertTrue((self.out/'controller.json').exists())

    def test_timeout_kills_worker_and_descendant_before_return(self):
        command=[sys.executable,'-c','import subprocess,sys,time;subprocess.Popen([sys.executable,"-c","import time;time.sleep(30)"]);time.sleep(30)']
        result=tq.supervise(self.out,command,deadline_seconds=.8)
        self.assertEqual(result['status'],'failed');self.assertEqual(result['reason'],'wall_timeout')
        self.assertEqual(result['remaining_job_members'],[])
        self.assertIsNotNone(result['returncode'])

    def test_cancellation_drains_before_release(self):
        cancel=threading.Event();timer=threading.Timer(.5,cancel.set);timer.start()
        self.addCleanup(timer.join)
        result=tq.supervise(self.out,[sys.executable,'-c','import time;time.sleep(30)'],cancel=cancel,deadline_seconds=10)
        self.assertEqual(result['reason'],'cancelled');self.assertEqual(result['remaining_job_members'],[])

    def test_uncertain_drain_retains_ownership_and_original_handle(self):
        from unittest.mock import patch
        before=len(tq._UNCERTAIN_JOBS)
        with patch.object(tq,'_drain',side_effect=tq.QualificationError('artificial query failure')):
            result=tq.supervise(self.out,[sys.executable,'-B','-c','pass'],deadline_seconds=10)
        self.assertEqual(result['reason'],'cleanup_unconfirmed')
        self.assertFalse(result['cleanup_confirmed'])
        self.assertEqual(len(tq._UNCERTAIN_JOBS),before+1)
        locks=[tq.ROOT/'research/datasets/parcel-gpu-run-registry/active-job',
               tq.ROOT/'research/datasets/parcel-visible-run-registry/active-job']
        self.assertTrue(all((p/'cleanup-unconfirmed.json').exists() for p in locks))
        import parcel_runtime as parcel
        marker=parcel.REQUEST_ROOT/'active.json'
        self.assertTrue(marker.exists(),'Cold parcel admission must remain blocked after uncertain drain')
        value=json.loads(marker.read_text())
        self.assertEqual(value['schema'],'iilas.tampar.acquisition-blocker.v1')
        self.assertEqual(value['native_job_name'],result['job_name'])
        # The frozen cold admission rejects the truthful acquisition sentinel.
        with self.assertRaises(parcel.ParcelUnavailable):parcel._admit_job(self.out)
        # Artificial fixture reconciliation only: query the still-owned original
        # handle, then remove only this test's proved-drained leases.
        job,worker=tq._UNCERTAIN_JOBS.pop()
        self.assertEqual(tq._drain(job,worker,time.monotonic()+5),[])
        job.close()
        marker.unlink()
        for path in locks:
            (path/'cleanup-unconfirmed.json').unlink();path.rmdir()

    def test_resume_failure_has_no_worker_execution_and_drains(self):
        from unittest.mock import patch
        with patch.object(tq.HardJob,'resume',side_effect=tq.QualificationError('artificial resume failure')):
            result=tq.supervise(self.out,[sys.executable,'-B','-c','open("resumed","w").write("wrong")'],deadline_seconds=10)
        self.assertEqual(result['status'],'failed');self.assertTrue(result['cleanup_confirmed'])
        self.assertIsNone(result['resumed_monotonic']);self.assertFalse((self.out/'resumed').exists())

    def test_assignment_failure_drains_still_suspended_worker(self):
        from unittest.mock import patch
        with patch.object(tq.HardJob,'assign',side_effect=tq.QualificationError('artificial assignment failure')):
            result=tq.supervise(self.out,[sys.executable,'-B','-c','open("resumed","w").write("wrong")'],deadline_seconds=10)
        self.assertEqual(result['status'],'failed');self.assertTrue(result['cleanup_confirmed'])
        self.assertIsNotNone(result['returncode']);self.assertFalse((self.out/'resumed').exists())


if __name__=='__main__':unittest.main()
