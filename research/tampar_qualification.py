"""Fixed twenty-view TAMPAR development qualification; no models or labels.

prepare is metadata-only. run requires a separately reviewed immutable request.
Only the suspended, resource-contained _worker acquires or decodes originals.
Imports stay stdlib-only until a worker decodes one bounded JPEG at a time.
"""
import argparse
from contextlib import contextmanager
import ctypes
from ctypes import wintypes as W
import hashlib
import http.client
import json
import os
from pathlib import Path, PurePosixPath
import re
import struct
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import zlib

import runner_runtime as native

ROOT = Path(__file__).resolve().parents[1]
CODE = Path(__file__).resolve()
MIB = 1024**2
CAP = 128*MIB
TERMINAL_RESERVE = 64*1024
METADATA_ALLOWANCE = 4*MIB
TOTAL = 6407977888
URL = 'https://zenodo.org/api/records/10057090/files/tampar.zip/content'
DEST = ROOT/'research/datasets/tampar-development-qualification-20261022/attempt-02'
JPEG_AMENDMENT = ROOT/'outputs/parcel-warm-integration-20261022/tampar-runner/jpeg-format-amendment-v2.json'
JPEG_AMENDMENT_SHA = '3a71c15f6a82983f7e8958e66e9c30e543435023d72e66ab90e99d91fb45d1b5'
PLAN_ROOT = ROOT/'outputs/parcel-warm-integration-20261022/tampar-next-photo-qualification'
PACKET = PLAN_ROOT/'qualification-packet-plan'
MANIFEST_SHA = '2702f323de45d2360d49efc488e26ab99fb0759b6e3d7c0edf54a2d1736320ef'
PROTOCOL_SHA = 'fb89b90ef5829888837844f53f34d460e09ea220c8e6f7a678ccc259783033d3'
FREEZE_SHA = '0c70bb82ec6f9183c61f47fde64b916f83953b8792e44eda78be8e3868177f90'
PLAN_REVIEW_SHA = '06ee62960ef0384f58dabde9598b634daf8742da9b34c7cd295a30c2e568421e'
PLAN_REVIEW_TEXT_SHA = 'e0e6b9ebb294bfe074c00b66394cd6b7d93b52d6964dc36916b1c4bcacfcc561'
FAMILIES = ('00','14','16','18','20','22','23','24','27','28')
HASH = re.compile(r'[0-9a-f]{64}\Z')
_UNCERTAIN_JOBS = []  # retain original handles/ownership if drain cannot be proved


class QualificationError(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise QualificationError(message)


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Duplicate JSON key')
        result[key] = value
    return result


def read_json(path, limit=2*MIB):
    path=Path(path)
    require(not path.is_symlink() and path.stat().st_size <= limit, 'Bounded JSON required')
    with path.open('rb') as stream:
        data=stream.read(limit+1)
    require(len(data)<=limit,'Bounded JSON required')
    try:
        return json.loads(data,object_pairs_hook=_pairs,
                          parse_constant=lambda value: (_ for _ in ()).throw(QualificationError('Nonfinite JSON')))
    except (ValueError,UnicodeError) as error:
        raise QualificationError('Invalid JSON') from error


def _json_bytes(value):
    return (json.dumps(value,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()


def _safe_source(path):
    raw=Path(path)
    require(not raw.is_absolute() and '..' not in raw.parts,'Unsafe source path')
    resolved=(ROOT/raw).resolve()
    require(resolved.is_relative_to(ROOT),'Source escaped checkout')
    for entry in (ROOT/raw,*(ROOT/raw).parents):
        require(not entry.is_symlink() and not (hasattr(entry,'is_junction') and entry.is_junction()),'Source link forbidden')
        if entry==ROOT:break
    return resolved


def verify_identity(identity):
    path=Path(identity['path'])
    path=path if path.is_absolute() else _safe_source(path)
    require(path.is_file() and not path.is_symlink(),'Source file missing')
    require(path.stat().st_size==identity['bytes'] and native.sha256_file(path)==identity['sha256'],
            'Pinned source changed')
    return path


def _pinned_json(path, pin):
    require(isinstance(pin,str) and HASH.fullmatch(pin) and native.sha256_file(path)==pin,'SHA256 mismatch')
    value=read_json(path)
    require(isinstance(value,dict),'JSON object required')
    return value


def validate_manifest(manifest):
    require(manifest.get('schema')=='iilas.tampar.development-qualification-manifest.v1','Wrong manifest schema')
    rows=manifest.get('selected',[])
    require(len(rows)==20 and manifest.get('selected_count')==20,'Exactly twenty selections required')
    require(manifest.get('fixed_family_order')==list(FAMILIES),'Family order changed')
    require(len(manifest.get('omitted_annotated_members',[]))==712 and
            len(manifest.get('id00_unannotated_extras_excluded',[]))==4,'Disposition coverage changed')
    require(manifest.get('source_annotated_universe_count')==732 and
            manifest.get('selected_encoded_output_bytes')==106506935,'Original denominator changed')
    require(manifest.get('archive_identity',{}).get('url')==URL and
            manifest['archive_identity'].get('bytes')==TOTAL,'Archive identity changed')
    paths=[]
    for number,row in enumerate(rows,1):
        require(row.get('review_id')==f'Q{number:02}' and
                row.get('future_local_original_name')==f'Q{number:02}.jpg','Review order changed')
        require(row.get('source_parcel_id')==FAMILIES[(number-1)//2],'Family changed')
        require(row.get('role')==('base' if number%2 else 'nonbase'),'Selection role changed')
        require(row.get('publisher_original_category_id')==0 and
                row.get('publisher_original_category_name')=='normal box','Source category changed')
        for key in ('iilas_visible_condition','iilas_visibility','approved_physical_identity','encoded_sha256','decoded_sha256'):
            require(key in row and row[key] is None,'Condition/approval fields must remain null')
        path=PurePosixPath(row['source_path']);entry=row['archive_entry']
        require(not path.is_absolute() and '..' not in path.parts and '\\' not in row['source_path'] and
                str(path)==entry['path'] and path.suffix=='.jpg','Unsafe archive path')
        require(row.get('archive_source_url')==URL,'Archive URL changed')
        for key in ('size','compressed_size','header_offset','crc32','method'):
            require(type(entry[key]) is int,'Integer ZIP metadata required')
        require(0<entry['size']<=16*MIB and 0<entry['compressed_size']<=16*MIB and
                0<=entry['crc32']<=0xffffffff and entry['method'] in (0,8),'ZIP metadata out of bounds')
        require(0<=entry['header_offset']<TOTAL and
                entry['header_offset']+30+len(str(path).encode())+65535+entry['compressed_size']<=TOTAL,
                'ZIP member envelope outside archive')
        require(row['source_width']==4032 and row['source_height']==3024,'Source dimensions changed')
        paths.append(str(path))
    require(len(set(paths))==20 and sum(r['archive_entry']['size'] for r in rows)==106506935,'Duplicate/replaced selections')


def frozen_inputs():
    amendment=_pinned_json(JPEG_AMENDMENT,JPEG_AMENDMENT_SHA)
    require(amendment.get('original_manifest_sha256')==MANIFEST_SHA and
            amendment.get('original_protocol_sha256')==PROTOCOL_SHA and
            amendment.get('next_output')=='research/datasets/tampar-development-qualification-20261022/attempt-02',
            'JPEG amendment basis changed')
    prior=amendment['prior_failed_attempt'];prior_path=_safe_source(prior['path'])
    controller=_pinned_json(prior_path/'controller.json',prior['controller_sha256'])
    worker=_pinned_json(prior_path/'worker.json',prior['worker_sha256'])
    failure_review=_pinned_json(JPEG_AMENDMENT.parent/'failure-01-review.json',prior['independent_failure_review_sha256'])
    require(controller.get('status')=='failed' and controller.get('cleanup_confirmed') is True and
            controller.get('remaining_job_members')==[] and worker.get('status')=='failed' and
            worker.get('completed_members')==0 and
            failure_review.get('decision')=='VERIFIED_FAILED_ATTEMPT_PRESERVE_NO_RETRY' and
            failure_review.get('expected_receipt_hashes',{}).get('controller.json')==prior['controller_sha256'] and
            failure_review.get('expected_receipt_hashes',{}).get('worker.json')==prior['worker_sha256'],
            'Prior failed attempt metadata mismatch')
    manifest=_pinned_json(PACKET/'selection-manifest.json',MANIFEST_SHA)
    protocol=_pinned_json(PACKET/'prospective-protocol.json',PROTOCOL_SHA)
    freeze=_pinned_json(PACKET/'freeze-receipt.json',FREEZE_SHA)
    review=_pinned_json(PLAN_ROOT/'packet-plan-review-evidence.json',PLAN_REVIEW_SHA)
    require(native.sha256_file(PLAN_ROOT/'packet-plan-review.md')==PLAN_REVIEW_TEXT_SHA,'Review text changed')
    require(review.get('decision')=='APPROVE_PLAN_ONLY_FUTURE_IMPLEMENTATION_REVIEW_REQUIRED' and
            review.get('checks_passed')==846 and review.get('blocking_findings')==[] and
            review.get('manifest_sha256')==MANIFEST_SHA and review.get('protocol_sha256')==PROTOCOL_SHA,
            'Independent metadata review missing')
    for identity in freeze['files']+manifest['source_identities']+protocol['future_code_reuse_static_inspection']:
        verify_identity(identity)
    validate_manifest(manifest)
    require(protocol['manifest']['sha256']==MANIFEST_SHA,'Protocol manifest changed')
    return manifest,protocol


def policy():
    return dict(maximum_images=20,maximum_total_output_bytes=CAP,network_reserved_response_byte_cap=CAP,
                maximum_response_attempts_per_selected_entry=3,automatic_retries=0,parallel_requests=0,
                maximum_worker_wall_seconds=600,socket_timeout_seconds=45,cpu_affinity_logical_processors=1,
                native_threads=1,opencv_threads=1,startup_minimum_available_physical_bytes=3072*MIB,
                runtime_available_floor_bytes=768*MIB,maximum_process_or_job_memory_bytes=2048*MIB,
                maximum_monitored_aggregate_rss_bytes=2048*MIB,minimum_free_disk_bytes=1024*MIB,
                sampling_interval_seconds=.2,terminal_receipt_reserved_bytes=TERMINAL_RESERVE,
                metadata_log_allowance_bytes=METADATA_ALLOWANCE)


def _code_identities():
    return [dict(path=p.relative_to(ROOT).as_posix(),bytes=p.stat().st_size,sha256=native.sha256_file(p))
            for p in (CODE,ROOT/'research/runner_runtime.py',ROOT/'research/parcel_runtime.py')]


def _output(path):
    raw=Path(path).absolute()
    require(raw==DEST,'Only frozen fresh attempt destination is permitted')
    try:return native._validate_output_path(raw)
    except Exception as error:raise QualificationError('Unsafe/unignored attempt destination') from error


def _request(output, manifest):
    return dict(schema='iilas.tampar.qualification-request.v2',output=str(output),purpose='DEVELOPMENT QUALIFICATION ONLY',
                manifest_sha256=MANIFEST_SHA,protocol_sha256=PROTOCOL_SHA,plan_review_sha256=PLAN_REVIEW_SHA,
                jpeg_amendment_sha256=JPEG_AMENDMENT_SHA,
                code_identities=_code_identities(),policy=policy(),selected_paths=[r['source_path'] for r in manifest['selected']],
                independent_request_review_file='code-request-review.json',condition_labels=None,human_approval=None)


def prepare(output):
    output=_output(output)
    manifest,_=frozen_inputs()
    request=_request(output,manifest)
    native.create_run_directory(output)
    budget=Budget(output)
    budget.write('request.json',_json_bytes(request))
    return output/'request.json'


def load_request(path,pin):
    path=Path(path).absolute()
    require(path.name=='request.json','Wrong request file')
    value=_pinned_json(path,pin)
    require(set(value)=={'schema','output','purpose','manifest_sha256','protocol_sha256','plan_review_sha256','jpeg_amendment_sha256',
                         'code_identities','policy','selected_paths','independent_request_review_file',
                         'condition_labels','human_approval'},'Closed request schema required')
    output=_output(value['output'])
    require(path.parent==output and output.is_dir(),'Request destination mismatch')
    manifest,protocol=frozen_inputs()
    require(value==_request(output,manifest),'Request/source/code/resource drift')
    return value,manifest,protocol


def check_review(output,request,pin):
    review=read_json(output/request['independent_request_review_file'],16*1024)
    expected=dict(schema='iilas.tampar.qualification-code-request-review.v2',
                  decision='APPROVE_ONE_BOUNDED_DEVELOPMENT_ACQUISITION',request_sha256=pin,
                  manifest_sha256=MANIFEST_SHA,protocol_sha256=PROTOCOL_SHA,
                  jpeg_amendment_sha256=JPEG_AMENDMENT_SHA,
                  code_identities=request['code_identities'],policy=policy(),output=str(output),blocking_findings=[])
    require(set(review)==set(expected)|{'reviewer','reviewed_utc'},'Closed independent review schema required')
    require(all(review[key]==value for key,value in expected.items()),'Independent code/request review missing or mismatched')
    require(isinstance(review['reviewer'],str) and 0<len(review['reviewer'])<=200 and
            isinstance(review['reviewed_utc'],str) and 0<len(review['reviewed_utc'])<=80,'Review identity required')
    return native.sha256_file(output/request['independent_request_review_file'])


class Budget:
    """Cumulative response reservations and actual complete/partial output bounds."""
    def __init__(self,output,*,output_cap=CAP,network_cap=CAP,terminal_reserve=TERMINAL_RESERVE):
        require(0<output_cap<=CAP and 0<network_cap<=CAP and 0<=terminal_reserve<=output_cap,'Invalid budget')
        self.output=Path(output);self.output_cap=output_cap;self.network_cap=network_cap
        self.terminal_reserve=terminal_reserve;self.network_reserved=0;self.network_received=0
        self.request_count=0;self.journal_bytes=0
        require(self.output.is_dir(),'Output directory missing')
        require(not (self.output/'network.jsonl').exists(),'Existing attempt journal; no resume')

    def _target(self,name):
        raw=Path(name)
        require(not raw.is_absolute() and '..' not in raw.parts and raw.parts and
                ':' not in str(name) and '\\' not in str(name) and
                all(part.rstrip('. ')==part for part in raw.parts),'Unsafe output name')
        target=self.output/raw
        for p in (target,*target.parents):
            require(not p.is_symlink() and not (hasattr(p,'is_junction') and p.is_junction()),'Output link forbidden')
            if p==self.output:break
        require(target.resolve().is_relative_to(self.output.resolve()),'Output escaped attempt')
        return target

    def reserve_output(self,count,*,terminal=False):
        require(type(count) is int and count>=0,'Invalid output reservation')
        used=native._output_bytes(self.output)
        require(used+count<=self.output_cap-(0 if terminal else self.terminal_reserve),'Output budget exhausted')

    def write(self,name,data,*,terminal=False):
        target=self._target(name)
        if target.exists():raise FileExistsError(str(target))
        self.reserve_output(len(data),terminal=terminal)
        target.parent.mkdir(parents=True,exist_ok=True)
        with target.open('xb') as stream:
            stream.write(data);stream.flush();os.fsync(stream.fileno())

    def event(self,value):
        payload=(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode()
        require(self.journal_bytes+len(payload)<=METADATA_ALLOWANCE//2,'Network journal bound exceeded')
        self.reserve_output(len(payload))
        with self._target('network.jsonl').open('ab') as stream:
            stream.write(payload);stream.flush();os.fsync(stream.fileno())
        self.journal_bytes+=len(payload)


class ZenodoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        # Zero transparent redirect follow-ups: precisely three HTTP attempts per member.
        raise QualificationError('Redirect response requires a separately reviewed source identity')


def _opener():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}),ZenodoRedirect()).open


def get_range(start,end,budget,*,opener=None):
    require(type(start) is int and type(end) is int and 0<=start<=end<TOTAL,'Invalid archive range')
    count=end-start+1
    require(budget.request_count<60 and budget.network_reserved+count+1<=budget.network_cap,'Network budget exhausted')
    budget.network_reserved+=count+1;budget.request_count+=1
    number=budget.request_count;began=time.monotonic();received=0;chunks=[];status='failed';reason=None
    next_progress=65536
    try:
        budget.event(dict(kind='reserved',request=number,start=start,end=end,reserved_body_bytes=count+1,
                          monotonic=began,cumulative_reserved=budget.network_reserved))
        request=urllib.request.Request(URL,headers={'Range':f'bytes={start}-{end}','Accept-Encoding':'identity',
                                                  'User-Agent':'IILAS-TAMPAR-development-qualification/1'})
        with (opener or _opener())(request,timeout=45) as response:
            require(response.status==206,'Expected exact HTTP206 before body')
            require(response.geturl()==URL,'Source redirect/identity changed')
            require(response.headers.get('Content-Range')==f'bytes {start}-{end}/{TOTAL}','Incorrect Content-Range')
            length=response.headers.get('Content-Length')
            require(length is None or length==str(count),'Incorrect Content-Length')
            require(response.headers.get('Content-Encoding','identity').lower()=='identity','Encoded transfer forbidden')
            while received<count+1:
                try:
                    block=response.read1(min(65536,count+1-received))
                except http.client.IncompleteRead as error:
                    partial=error.partial
                    require(len(partial)<=count+1-received,'Oversized partial delivery')
                    received+=len(partial);budget.network_received+=len(partial)
                    budget.event(dict(kind='partial',request=number,received_body_bytes=received,monotonic=time.monotonic()))
                    raise
                if not block:break
                require(len(block)<=count+1-received,'Oversized response block')
                chunks.append(block);received+=len(block);budget.network_received+=len(block)
                # A stream may return arbitrarily short reads. Journal at most
                # one progress entry per 64KiB; failures retain the exact final
                # delivered count in a separately reserved terminal receipt.
                if received>=next_progress:
                    budget.event(dict(kind='progress',request=number,received_body_bytes=received,monotonic=time.monotonic()))
                    next_progress=received+65536
            require(received==count,'Truncated or trailing response body')
        status='complete'
        return b''.join(chunks)
    except Exception as error:
        reason=type(error).__name__
        raise QualificationError('Range request failed; preserve charged attempt') from error
    finally:
        terminal=dict(kind='terminal',request=number,status=status,reason_type=reason,start=start,end=end,
                      received_body_bytes=received,reserved_body_bytes=count+1,elapsed_seconds=time.monotonic()-began,
                      monotonic=time.monotonic(),cumulative_received=budget.network_received)
        budget.write(f'network-terminal/{number:02}.json',_json_bytes(terminal),terminal=True)
        # Sidecar capacity is independent from optional journal progress. A full
        # journal never suppresses the terminal timing/partial-byte evidence.
        try:budget.event(terminal)
        except QualificationError:pass


def validate_header(header,row):
    require(len(header)==30,'Truncated ZIP header')
    sig,version,flags,method,tm,dt,crc,comp,raw,nlen,xlen=struct.unpack('<4s5H3L2H',header)
    entry=row['archive_entry']
    require(sig==b'PK\x03\x04' and version<=20,'Invalid/unsupported ZIP header')
    require(flags & ~0x806==0 and flags & 0x6 in (0,2,4,6),'Encrypted/data-descriptor/unsupported ZIP flags')
    require(method in (0,8) and method==entry['method'] and (method==8 or flags & 6==0),'Unsupported ZIP method')
    require((crc,comp,raw)==(entry['crc32'],entry['compressed_size'],entry['size']),'Local ZIP metadata mismatch')
    require(nlen==len(row['source_path'].encode('utf-8')) and nlen>0,'ZIP filename length mismatch')
    require(entry['header_offset']+30+nlen+xlen+comp<=TOTAL,'ZIP payload outside archive')
    return nlen,xlen


def validate_name_extra(data,row,nlen,xlen):
    require(len(data)==nlen+xlen and data[:nlen]==row['source_path'].encode('utf-8'),'ZIP name/extra mismatch')
    extra=data[nlen:];position=0
    while position<len(extra):
        require(position+4<=len(extra),'Truncated ZIP extra field')
        kind,length=struct.unpack('<HH',extra[position:position+4]);position+=4
        require(kind not in (1,0x9901) and position+length<=len(extra),'ZIP64/encryption/malformed extra forbidden')
        position+=length


def inflate(payload,entry):
    require(len(payload)==entry['compressed_size'],'Compressed payload size mismatch')
    if entry['method']==8:
        decoder=zlib.decompressobj(-15)
        try:data=decoder.decompress(payload,entry['size']+1)
        except zlib.error as error:raise QualificationError('Invalid deflate payload') from error
        require(decoder.eof and not decoder.unused_data and not decoder.unconsumed_tail,'Incomplete/trailing/bomb deflate')
    else:
        require(entry['method']==0,'Unsupported compression');data=payload
    require(len(data)==entry['size'] and zlib.crc32(data)==entry['crc32'],'Original size/CRC mismatch')
    return data


def _jpeg_trailer(data,end):
    """Recognize only the bounded, completely accounted SEFH/SEFT subset.

    Ranges are absolute half-open byte offsets. Names/version are structural
    facts only; record payloads are neither interpreted nor returned.
    """
    facts=dict(jpeg_codestream_end=end,jpeg_trailer_kind='none',jpeg_trailer_bytes=len(data)-end,
               jpeg_trailer_directory_count=0,jpeg_trailer_version=None,jpeg_trailer_records=[])
    if end==len(data):return facts
    require(8<=len(data)-end<=65536 and data[-4:]==b'SEFT','Unrecognized JPEG trailer')
    length=struct.unpack_from('<I',data,len(data)-8)[0];directory=len(data)-8-length
    require(directory>=end and length>=24 and data[directory:directory+4]==b'SEFH','Invalid SEF directory')
    version,count=struct.unpack_from('<II',data,directory+4)
    require(1<=count<=1024 and length==12+12*count,'Invalid SEF directory length/count')
    records=[]
    for index in range(count):
        entry=directory+12+12*index
        reserved,kind,backward,size=struct.unpack_from('<HHII',data,entry)
        start=directory-backward;stop=start+size
        require(reserved==0 and size>=9 and end<=start<stop<=directory,'Invalid SEF record range/identity')
        require(data[start:start+4]==data[entry:entry+4],'SEF record type mismatch')
        name_length=struct.unpack_from('<I',data,start+4)[0]
        require(1<=name_length<=128 and 8+name_length<=size,'Invalid SEF record name length')
        name=data[start+8:start+8+name_length]
        require(all(32<=value<=126 for value in name),'Invalid SEF record name')
        records.append(dict(type=kind,name=name.decode('ascii'),start=start,end=stop))
    records.sort(key=lambda record:record['start']);cursor=end
    for record in records:
        require(record['start']==cursor,'SEF records overlap or leave unaccounted bytes')
        cursor=record['end']
    require(cursor==directory,'SEF records do not tile data region')
    facts.update(jpeg_trailer_kind='SEFH/SEFT',jpeg_trailer_directory_count=count,
                 jpeg_trailer_version=version,jpeg_trailer_records=records)
    return facts


def inspect_jpeg(data):
    """Bounded structural inspection, without entropy/pixel decoding.

    Segment lengths protect embedded thumbnail markers; find skips non-marker
    entropy bytes in C rather than walking each pixel byte in Python.
    """
    require(2<=len(data)<=16*MIB and data[:2]==b'\xff\xd8','Bounded JPEG SOI required')
    position=2;frame=None;frame_kind=None;scans=0;entropy=False
    while position<len(data):
        if entropy:
            position=data.find(b'\xff',position)
            require(position>=0,'JPEG EOI missing')
        require(data[position]==255,'Malformed JPEG marker');position+=1
        while position<len(data) and data[position]==255:position+=1
        require(position<len(data),'Truncated JPEG marker');kind=data[position];position+=1
        if entropy and (kind==0 or 0xd0<=kind<=0xd7):continue
        entropy=False
        if kind==0xd9:
            require(frame is not None and scans>0,'JPEG frame/scan missing')
            return dict(width=frame[1],height=frame[2],**_jpeg_trailer(data,position))
        require(kind in (0xc0,0xc1,0xc2,0xc4,0xda,0xdb,0xdd,0xfe) or 0xe0<=kind<=0xef,
                'Unsupported or misplaced JPEG marker')
        require(position+2<=len(data),'Truncated JPEG segment')
        length=int.from_bytes(data[position:position+2],'big');stop=position+length
        require(length>=2 and stop<=len(data),'Invalid JPEG segment length')
        body=data[position+2:stop]
        if kind in (0xc0,0xc1,0xc2):
            require(len(body)>=6,'Truncated JPEG frame')
            precision=body[0];height=int.from_bytes(body[1:3],'big');width=int.from_bytes(body[3:5],'big');count=body[5]
            require((precision==8 if kind==0xc0 else precision in (8,12)) and
                    width>0 and height>0 and width*height<=16_000_000 and 1<=count<=4 and
                    len(body)==6+3*count,'Invalid JPEG frame dimensions/components')
            components=tuple(tuple(body[i:i+3]) for i in range(6,len(body),3))
            require(len({part[0] for part in components})==count and
                    all(1<=part[1]>>4<=4 and 1<=part[1]&15<=4 and part[2]<=3 for part in components),
                    'Invalid JPEG frame components')
            current=(precision,width,height,components)
            require(scans==0 and (frame is None or (frame==current and frame_kind==kind)),
                    'Inconsistent or late JPEG frame')
            frame=current;frame_kind=kind
        elif kind==0xda:
            require(frame is not None and len(body)>=6,'JPEG dimensions absent before scan')
            count=body[0]
            require(1<=count<=len(frame[3]) and len(body)==4+2*count,'Invalid JPEG scan components')
            ids=body[1:1+2*count:2];tables=body[2:1+2*count:2]
            require(len(set(ids))==count and set(ids)<={part[0] for part in frame[3]} and
                    all(value>>4<=3 and value&15<=3 for value in tables),'Invalid JPEG scan selectors')
            first,last,approx=body[-3:]
            require((first==0 and last==63 and approx==0) if frame_kind!=0xc2 else
                    (0<=first<=last<=63 and (last==0 if first==0 else count==1) and
                     approx>>4<=13 and approx&15<=13),'Unsupported JPEG scan structure')
            scans+=1;entropy=True
        elif kind==0xdd:
            require(length==4,'Invalid JPEG restart interval')
        position=stop
    raise QualificationError('JPEG EOI missing')


def _jpeg_dimensions(data):
    facts=inspect_jpeg(data)
    return facts['width'],facts['height']


def decode_jpeg(data,width,height):
    facts=inspect_jpeg(data)
    require(0<width*height<=16_000_000 and (facts['width'],facts['height'])==(width,height),'JPEG/source dimensions mismatch')
    import cv2
    import numpy as np
    cv2.setNumThreads(1)
    pixels=cv2.imdecode(np.frombuffer(data,dtype=np.uint8),cv2.IMREAD_COLOR)
    require(pixels is not None and pixels.shape==(height,width,3) and cv2.getNumThreads()==1,'JPEG decode failed')
    digest=hashlib.sha256(memoryview(pixels)).hexdigest()
    rgb=cv2.cvtColor(pixels,cv2.COLOR_BGR2RGB)
    rgb_digest=hashlib.sha256(memoryview(rgb)).hexdigest()
    del pixels,rgb
    return dict(decoded_bgr_sha256=digest,decoded_rgb_sha256=rgb_digest,
                decoded_digest_convention='OpenCV IMREAD_COLOR BGR to uint8 RGB, row-major HWC bytes',
                opencv_threads=1,**facts)


def acquire_rows(rows,budget,*,opener=None):
    files=[]
    for row in rows:
        entry=row['archive_entry'];start=entry['header_offset'];phase='reserve';encoded=None;preserved=False
        name='originals/'+row['future_local_original_name']
        result=dict(review_id=row['review_id'],source_path=row['source_path'],original_path=name,
                    publisher_original_category_id=0,publisher_original_category_name='normal box',
                    iilas_visible_condition=None,iilas_visibility=None,approved_physical_identity=None,
                    human_condition=None,human_approval=None)
        try:
            budget.reserve_output(entry['size']);phase='header'
            header=get_range(start,start+29,budget,opener=opener)
            nlen,xlen=validate_header(header,row);phase='name_extra'
            extra=get_range(start+30,start+29+nlen+xlen,budget,opener=opener)
            validate_name_extra(extra,row,nlen,xlen)
            position=start+30+nlen+xlen;phase='payload'
            compressed=get_range(position,position+entry['compressed_size']-1,budget,opener=opener)
            phase='inflate';data=inflate(compressed,entry);del compressed
            phase='write_original';budget.write(name,data);preserved=True
            encoded=hashlib.sha256(data).hexdigest();phase='decode'
            decoded=decode_jpeg(data,row['source_width'],row['source_height']);del data
            result.update(status='success',encoded_sha256=encoded,bytes=entry['size'],crc32=entry['crc32'],
                          crc32_verified=True,original_preserved=True,**decoded)
        except BaseException as error:
            result.update(status='failed',phase=phase,reason_type=type(error).__name__,
                          encoded_sha256=encoded,original_preserved=preserved,decoded_bgr_sha256=None,decoded_rgb_sha256=None)
            budget.write('members/'+row['review_id']+'.json',_json_bytes(result),terminal=True)
            raise
        budget.write('members/'+row['review_id']+'.json',_json_bytes(result))
        files.append(result)
    return files


def acquire(request_path,pin):
    native.require_supervised_worker()
    sys.dont_write_bytecode=True
    request,manifest,protocol=load_request(request_path,pin)
    out=Path(request['output']);review_pin=check_review(out,request,pin)
    require(os.environ.get('TEMP')==str(out/'tmp') and os.environ.get('TMP')==str(out/'tmp'), 'Worker temp ownership missing')
    tempfile.tempdir=str(out/'tmp')
    budget=Budget(out);began=time.monotonic();status='failed';files=[];reason=None
    try:
        require(not (out/'network.jsonl').exists(),'No retry/resume')
        files=acquire_rows(manifest['selected'],budget)
        require(len(files)==20,'Incomplete fixed packet')
        require(len({r['encoded_sha256'] for r in files})==20 and len({r['decoded_rgb_sha256'] for r in files})==20,
                'Duplicate selected originals preserved; stop for review')
        load_request(request_path,pin)
        require(check_review(out,request,pin)==review_pin,'Independent review changed')
        budget.write('ATTRIBUTION.txt',(protocol['rights']['attribution']+'\n').encode())
        status='success'
    except BaseException as error:
        reason=type(error).__name__
        raise
    finally:
        dispositions=[]
        for row in manifest['selected']:
            member=out/'members'/str(row['review_id']+'.json')
            # At most 1024 bounded names/ranges can exceed the old 16KiB
            # receipt bound; terminal dispositions still contain only 3 fields.
            record=read_json(member,512*1024) if member.exists() else {}
            dispositions.append(dict(review_id=row['review_id'],status=record.get('status','not_attempted'),
                                     original_preserved=record.get('original_preserved',False)))
        budget.write('worker.json',_json_bytes(dict(status=status,reason_type=reason,request_sha256=pin,
                     request_review_sha256=review_pin,completed_members=sum(r['status']=='success' for r in dispositions),
                     dispositions=dispositions,network_reserved_bytes=budget.network_reserved,
                     network_received_body_bytes=budget.network_received,network_requests=budget.request_count,
                     elapsed_seconds=time.monotonic()-began,full_archive_checksum_verified=False,
                     condition_labels=None,human_approval=None)),terminal=True)


def limits(deadline_seconds=600):
    require(type(deadline_seconds) in (int,float) and 0<deadline_seconds<=600,'Invalid narrowed deadline')
    return native.Limits(deadline_seconds,deadline_seconds,2048*MIB,3072*MIB,1024*MIB,
                         CAP-TERMINAL_RESERVE,poll_seconds=.2,threads=1,available_floor_bytes=768*MIB)


class HardJob(native._ProcessJob):
    """Configure and query the original Job handle before any worker resumes."""
    def __init__(self):
        super().__init__()
        try:self.hard_limits=self.configure()
        except BaseException:
            self.close();raise

    def configure(self):
        class BASIC(ctypes.Structure):
            _fields_=[('process_time',ctypes.c_longlong),('job_time',ctypes.c_longlong),('flags',W.DWORD),
                      ('min_working',ctypes.c_size_t),('max_working',ctypes.c_size_t),('active',W.DWORD),
                      ('affinity',ctypes.c_size_t),('priority',W.DWORD),('scheduling',W.DWORD)]
        class IO(ctypes.Structure):
            _fields_=[(name,ctypes.c_ulonglong) for name in ('read_ops','write_ops','other_ops','read_bytes','write_bytes','other_bytes')]
        class EXTENDED(ctypes.Structure):
            _fields_=[('basic',BASIC),('io',IO),('process_memory',ctypes.c_size_t),('job_memory',ctypes.c_size_t),
                      ('peak_process',ctypes.c_size_t),('peak_job',ctypes.c_size_t)]
        kernel=self.kernel
        kernel.GetCurrentProcess.restype=W.HANDLE
        kernel.GetProcessAffinityMask.argtypes=[W.HANDLE,ctypes.POINTER(ctypes.c_size_t),ctypes.POINTER(ctypes.c_size_t)]
        available=ctypes.c_size_t();system=ctypes.c_size_t()
        require(kernel.GetProcessAffinityMask(kernel.GetCurrentProcess(),ctypes.byref(available),ctypes.byref(system)),
                'Native affinity unavailable')
        require(available.value>0,'No permitted logical CPU')
        affinity=available.value & -available.value
        flags=0x2000|0x100|0x200|0x10  # kill-on-close, process memory, Job memory, affinity
        value=EXTENDED();value.basic.flags=flags;value.basic.affinity=affinity
        value.process_memory=2048*MIB;value.job_memory=2048*MIB
        require(kernel.SetInformationJobObject(self.handle,9,ctypes.byref(value),ctypes.sizeof(value)),
                'Hard Job memory/CPU configuration failed')
        observed=EXTENDED()
        kernel.QueryInformationJobObject.argtypes=[W.HANDLE,ctypes.c_int,ctypes.c_void_p,W.DWORD,ctypes.c_void_p]
        require(kernel.QueryInformationJobObject(self.handle,9,ctypes.byref(observed),ctypes.sizeof(observed),None),
                'Hard Job readback failed')
        require(observed.basic.flags & flags==flags and observed.basic.affinity==affinity and
                observed.process_memory==2048*MIB and observed.job_memory==2048*MIB,'Hard Job readback mismatch')
        return dict(flags=observed.basic.flags,affinity_mask=observed.basic.affinity,
                    process_memory_bytes=observed.process_memory,job_memory_bytes=observed.job_memory)


def _install_blocker(guard,output,job_name):
    import parcel_runtime as parcel
    marker=parcel.REQUEST_ROOT/'active.json'
    parcel.REQUEST_ROOT.mkdir(parents=True,exist_ok=True)
    payload=_json_bytes(dict(schema='iilas.tampar.acquisition-blocker.v1',controller_pid=os.getpid(),
                             output=str(output),native_job_name=job_name,
                             explanation='Acquisition ownership; cold parcel admission must fail closed'))
    require(len(payload)<=1024,'Bounded acquisition blocker required')
    with marker.open('xb') as stream:
        stream.write(payload);stream.flush();os.fsync(stream.fileno())
    guard['blocker']=(marker,payload)


@contextmanager
def shared_ownership():
    """Same CPU/GPU leases and parcel mutex as existing model controllers."""
    import parcel_runtime as parcel
    paths=[ROOT/'research/datasets/parcel-gpu-run-registry/active-job',
           ROOT/'research/datasets/parcel-visible-run-registry/active-job']
    owned=[];guard={'retain':False,'blocker':None}
    try:
        for path in paths:
            path=native._validate_output_path(path);path.parent.mkdir(parents=True,exist_ok=True)
            try:path.mkdir()
            except FileExistsError as error:raise QualificationError('Research lease active or unresolved') from error
            owned.append(path)
        with parcel._Mutex():
            require(not (ROOT/'research/datasets/parcel-gpu-runtime-registry/active-runtime').exists() and
                    not (parcel.REQUEST_ROOT/'active.json').exists(),'Native/parcel ownership unresolved')
            try:yield guard
            finally:
                if guard['blocker'] is not None and not guard['retain']:
                    marker,payload=guard['blocker']
                    # Compare exact owned bytes while still holding the mutex;
                    # never unlink another controller's replacement/sentinel.
                    if marker.is_file() and not marker.is_symlink() and marker.read_bytes()==payload:
                        marker.unlink()
                    else:
                        guard['retain']=True
                        raise QualificationError('Acquisition ownership marker changed; retain leases')
    finally:
        for path in reversed(owned):
            if guard['retain']:
                marker=path/'cleanup-unconfirmed.json'
                if not marker.exists():native.write_json_exclusive(marker,dict(reason='TAMPAR native drain unconfirmed; retain shared ownership'))
            else:path.rmdir()


def _environment(out,job):
    environment={key:value for key,value in os.environ.items() if key.upper() in {'SYSTEMROOT','WINDIR','PATH','PATHEXT','COMSPEC'}}
    for key in ('OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','VECLIB_MAXIMUM_THREADS',
                'NUMEXPR_NUM_THREADS','BLIS_NUM_THREADS','OPENCV_FOR_THREADS_NUM'):
        environment[key]='1'
    environment.update(TEMP=str(out/'tmp'),TMP=str(out/'tmp'),PYTHONDONTWRITEBYTECODE='1',
                       IILAS_RUNNER_JOB=job.name,OPENCV_IO_MAX_IMAGE_PIXELS='16000000',
                       OPENCV_LOG_LEVEL='SILENT')
    return environment


def _drain(job,worker,deadline):
    try:
        if job:job.terminate()
    finally:
        # Assignment may have failed after suspended creation. The Job cannot
        # terminate that unassigned process; always reap our exact Popen too.
        if worker and worker.poll() is None:
            try:worker.kill()
            except OSError:
                if worker.poll() is None:raise
    while True:
        remaining=job.pids() if job else []
        terminal=worker is None or worker.poll() is not None
        if not remaining and terminal:return []
        require(time.monotonic()<deadline,'Native cleanup unconfirmed')
        time.sleep(.05)


def supervise(output,command,*,deadline_seconds=600,cancel=None):
    """Local serial controller; command injection is internal fixture API only."""
    require(os.name=='nt','Windows native controller required')
    out=native._validate_output_path(output)
    require(out.is_dir() and not (out/'execution.json').exists(),'No retry/resume')
    budget=Budget(out);began=time.monotonic();job=None;worker=None;reason=None;peak=0;remaining=None
    configured=None;resumed=None;hard=None;last=None;drained=False
    supervisor=native.ResourceSupervisor(out,limits(deadline_seconds))
    budget.write('execution.json',_json_bytes(dict(policy=policy(),deadline_seconds=deadline_seconds)))
    with shared_ownership() as guard:
        try:
            require(cancel is None or not cancel.is_set(),'cancelled')
            supervisor.preflight()
            job=HardJob();supervisor._job=job;hard=job.hard_limits;configured=time.monotonic()
            budget.write('native-configured.json',_json_bytes(dict(job_name=job.name,hard_limits=hard,configured_monotonic=configured)))
            _install_blocker(guard,out,job.name)
            (out/'tmp').mkdir(exist_ok=False)
            # Explicit DEVNULL streams avoid unbounded stdout/stderr files; structured receipts carry evidence.
            worker=subprocess.Popen(command,cwd=out,env=_environment(out,job),stdin=subprocess.DEVNULL,
                                    stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=4)
            guard['retain']=True
            job.assign(worker)
            budget.write('native-assigned.json',_json_bytes(dict(job_name=job.name,worker_pid=worker.pid,
                         suspended=True,hard_limits=hard,monotonic=time.monotonic())))
            job.resume(worker);resumed=time.monotonic()
            while True:
                if cancel is not None and cancel.is_set():raise QualificationError('cancelled')
                last=supervisor.preflight(required_available_bytes=768*MIB)
                peak=max(peak,last['rss_bytes'])
                if worker.poll() is not None:break
                time.sleep(.2)
            if worker.returncode!=0:reason='worker_exit'
        except BaseException as error:
            # Never log exception text/URLs/env; only bounded classifications.
            reason=str(error) if str(error) in ('cancelled','wall_timeout','available_memory','rss_limit','free_disk_limit','output_limit') else type(error).__name__
            if supervisor.last_snapshot:peak=max(peak,supervisor.last_snapshot['rss_bytes'])
        finally:
            try:
                remaining=_drain(job,worker,time.monotonic()+10)
                drained=True
            except BaseException:
                reason='cleanup_unconfirmed'
            result=dict(status='failed' if reason else 'success',reason=reason,
                        returncode=worker.returncode if worker else None,worker_pid=worker.pid if worker else None,
                        job_name=job.name if job else None,hard_limits=hard,configured_monotonic=configured,
                        resumed_monotonic=resumed,remaining_job_members=remaining,cleanup_confirmed=drained,
                        peak_rss_bytes=peak,last_snapshot=last,elapsed_seconds=time.monotonic()-began)
            # Preserve ownership if writing the terminal receipt fails too.
            guard['retain']=not drained
            if drained:
                if job:job.close()
                supervisor._job=None
            elif job:
                _UNCERTAIN_JOBS.append((job,worker))
            budget.write('controller.json',_json_bytes(result),terminal=True)
    return result


def run(request_path,pin):
    require(not {'tensorflow','torch','keras','cv2','numpy'} & set(sys.modules),'Cold metadata-only controller required')
    request,_,_=load_request(request_path,pin)
    out=Path(request['output']);check_review(out,request,pin)
    allowed={'request.json','code-request-review.json'}
    require({p.name for p in out.iterdir()}==allowed,'Fresh reviewed attempt only')
    command=[sys.executable,'-B',str(CODE),'_worker','--request',str(Path(request_path).absolute()),'--request-sha256',pin]
    result=supervise(out,command)
    load_request(request_path,pin)
    require(result['status']=='success' and result['cleanup_confirmed'],'Acquisition failed; preserve original attempt')
    worker=read_json(out/'worker.json',TERMINAL_RESERVE//2)
    require(worker.get('status')=='success' and worker.get('completed_members')==20,'Worker completion missing')
    require(native._output_bytes(out)<=CAP,'Output cap exceeded')
    return out/'worker.json'


def main():
    sys.dont_write_bytecode=True
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=('prepare','run','_worker'))
    parser.add_argument('--output',type=Path)
    parser.add_argument('--request',type=Path)
    parser.add_argument('--request-sha256')
    args=parser.parse_args()
    if args.command=='prepare':
        require(args.output is not None and args.request is None and args.request_sha256 is None,'Prepare requires only output')
        path=prepare(args.output);print(json.dumps(dict(request=str(path),sha256=native.sha256_file(path))))
    else:
        require(args.output is None and args.request is not None and args.request_sha256 is not None,'Request and pin required')
        if args.command=='run':print(run(args.request,args.request_sha256))
        else:acquire(args.request,args.request_sha256)


if __name__=='__main__':main()
