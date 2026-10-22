"""Bounded crop-only Kaputt intake. No training and no held-out image decoding.

Only a completed receipt admits output. A failed/unfinished destination must
never be resumed. Explicit bounds/expected payload arguments support crafted
fixtures; production callers must use PUBLISHER_SHA256/PUBLISHER_BYTES and the
default limits, under runner_runtime.ResourceSupervisor.
"""
from dataclasses import dataclass
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import tarfile
import time

from runner_runtime import create_run_directory, native_snapshot, write_json_exclusive

PUBLISHER_BYTES = 31_564_000_506
PUBLISHER_SHA256 = 'de3fe46bac181ec1a369bd957e56d8c6f595669fc3f5c8df42ca12434995ccc1'
CHUNK = 1024 * 1024
UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
FILE = re.compile(r'data/(train|validation|test)/query-data/crop/(' + UUID + r')\.jpg\Z')
DIRECTORIES = {'data'} | {p for split in ('train','validation','test') for p in
    (f'data/{split}', f'data/{split}/query-data', f'data/{split}/query-data/crop')}

class IntakeError(RuntimeError):
    pass

@dataclass(frozen=True)
class IntakeLimits:
    max_members: int = 150000
    max_regular_files: int = 110000
    max_file_bytes: int = 16 * 1024**2
    max_decompressed_bytes: int = 64 * 1024**3
    max_selected_files: int = 2000
    max_output_bytes: int = 1024**3
    max_trailer_bytes: int = 1024**2
    max_pixels: int = 16_000_000
    min_side: int = 64
    max_wall_seconds: float = 1800
    max_rss_bytes: int = 512 * 1024**2
    min_available_bytes: int = 2 * 1024**3
    available_floor_bytes: int = 1024**3
    min_free_disk_bytes: int = 20 * 1024**3

    def __post_init__(self):
        for key,value in vars(self).items():
            if not isinstance(value,(int,float)) or not math.isfinite(value) or value < 0:
                raise IntakeError('Invalid bound: '+key)
        for key in ('max_members','max_regular_files','max_file_bytes','max_decompressed_bytes',
                'max_selected_files','max_output_bytes','max_pixels','min_side','max_wall_seconds'):
            if getattr(self,key) <= 0:
                raise IntakeError('Non-positive bound: '+key)

def _safe_ancestors(path):
    for node in (Path(path), *Path(path).parents):
        if not node.exists() and not node.is_symlink():
            continue
        stat = node.lstat()
        if node.is_symlink() or getattr(stat,'st_file_attributes',0) & 0x400:
            raise IntakeError('Link/junction/reparse path forbidden')

def _canonical(name):
    if not isinstance(name,str) or not name or len(name)>240 or any(ord(c)<32 or ord(c)>126 for c in name):
        raise IntakeError('Invalid member name')
    if '\\' in name or ':' in name or name.startswith('/'):
        raise IntakeError('Absolute/Windows alias member forbidden')
    for part in name.split('/'):
        if part in ('','.','..') or part.endswith(('.', ' ')):
            raise IntakeError('Non-canonical member component')
        if re.fullmatch(r'(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?',part,re.I):
            raise IntakeError('Windows device member forbidden')
    return name

def _identity(stat):
    return {'device':stat.st_dev,'inode':stat.st_ino,'bytes':stat.st_size,
        'mtime_ns':stat.st_mtime_ns,
        # On this Windows/Python 3.13 build stat().ctime reports creation while
        # fstat().ctime reports change time; compare the explicit birth field.
        'birthtime_ns':getattr(stat,'st_birthtime_ns',stat.st_ctime_ns)}

class _Resources:
    def __init__(self, destination, limits):
        self.destination=destination
        self.limits=limits
        self.started=time.monotonic()
        self.last=0
        self.peak_rss=0
        self.check(initial=True, force=True)

    def check(self, initial=False, force=False):
        now=time.monotonic()
        if now-self.started>self.limits.max_wall_seconds:
            raise IntakeError('Wall time bound exceeded')
        if not force and now-self.last<1:
            return
        self.last=now
        snap=native_snapshot()
        self.peak_rss=max(self.peak_rss,snap['rss_bytes'])
        floor=self.limits.min_available_bytes if initial else self.limits.available_floor_bytes
        if snap['available_bytes']<floor:
            raise IntakeError('Available RAM floor exceeded')
        if snap['rss_bytes']>self.limits.max_rss_bytes:
            raise IntakeError('Process-tree RSS bound exceeded')
        if shutil.disk_usage(self.destination).free<self.limits.min_free_disk_bytes:
            raise IntakeError('Free disk reserve exceeded')

class _HashedReader:
    def __init__(self, stream, resources, expected):
        self.stream=stream
        self.resources=resources
        self.expected=expected
        self.count=0
        self.digest=hashlib.sha256()

    def read(self, size=-1):
        self.resources.check()
        if size<0:
            raise IntakeError('Unbounded compressed read forbidden')
        data=self.stream.read(min(size,CHUNK))
        self.count+=len(data)
        if self.count>self.expected:
            raise IntakeError('Compressed byte bound exceeded')
        self.digest.update(data)
        return data

class _InflatedReader:
    def __init__(self, stream, resources, limits):
        self.stream=stream
        self.resources=resources
        self.limits=limits
        self.count=0

    def read(self, size):
        self.resources.check()
        data=self.stream.read(min(size,CHUNK))
        self.count+=len(data)
        if self.count>self.limits.max_decompressed_bytes:
            raise IntakeError('Actual decompressed byte bound exceeded')
        return data

    def exact(self, size):
        blocks=[]
        total=0
        while total<size:
            data=self.read(size-total)
            if not data:
                raise IntakeError('Truncated tar stream')
            blocks.append(data)
            total+=len(data)
        return b''.join(blocks)

def _jpeg_dimensions(path):
    """Read bounded JPEG marker segments before any full image allocation."""
    with open(path,'rb') as stream:
        if stream.read(2)!=b'\xff\xd8':
            raise IntakeError('Selected image is not JPEG')
        while True:
            byte=stream.read(1)
            if byte!=b'\xff':
                raise IntakeError('Invalid JPEG marker stream')
            marker=stream.read(1)
            while marker==b'\xff':
                marker=stream.read(1)
            if not marker or marker in (b'\xd9',b'\xda',b'\x00'):
                raise IntakeError('JPEG dimensions missing')
            if marker[0] in range(0xd0,0xd9) or marker==b'\x01':
                continue
            length=stream.read(2)
            if len(length)!=2:
                raise IntakeError('Truncated JPEG segment')
            size=struct.unpack('>H',length)[0]
            if size<2:
                raise IntakeError('Invalid JPEG segment length')
            if marker[0] in (0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf):
                header=stream.read(5)
                if len(header)!=5 or size<7:
                    raise IntakeError('Truncated JPEG frame')
                height,width=struct.unpack('>HH',header[1:])
                return width,height
            stream.seek(size-2,1)

def _verify_selected(path, limits):
    width,height=_jpeg_dimensions(path)
    if min(width,height)<limits.min_side or width*height>limits.max_pixels:
        raise IntakeError('Selected JPEG dimension bound exceeded')
    # cv2 otherwise accepts a truncated JPEG with a warning; require real EOI.
    with open(path,'rb') as stream:
        stream.seek(-2,2)
        if stream.read()!=b'\xff\xd9':
            raise IntakeError('Selected JPEG lacks final EOI')
    import cv2
    cv2.setNumThreads(1)
    image=cv2.imread(str(path),cv2.IMREAD_COLOR | cv2.IMREAD_IGNORE_ORIENTATION)
    if image is None or image.shape!=(height,width,3):
        raise IntakeError('Selected JPEG decode failed or shape changed')
    decoded=hashlib.sha256(memoryview(image)).hexdigest()
    del image
    digest=hashlib.sha256()
    with open(path,'rb') as stream:
        for block in iter(lambda:stream.read(CHUNK),b''):
            digest.update(block)
    return {'width':width,'height':height,'decoded_sha256':decoded,'verified_sha256':digest.hexdigest()}

def extract_selected(archive, destination, selected_paths,
        expected_sha256=PUBLISHER_SHA256, expected_bytes=PUBLISHER_BYTES, limits=None):
    """Audit every header; retain/decode exact selected publisher TRAIN crops.

    selected_paths is a finite iterable of exact ``data/train/query-data/crop/
    <lowercase UUID>.jpg`` archive names. Receipt includes all regular names and
    their sorted-name SHA-256, permitting external metadata exact-set validation.
    It does not itself establish metadata membership or semantic parcel labels.
    """
    limits=limits or IntakeLimits()
    destination=Path(destination)
    archive=Path(archive)
    if not re.fullmatch('[0-9a-f]{64}',expected_sha256) or not isinstance(expected_bytes,int) or expected_bytes<=0:
        raise IntakeError('Invalid expected archive identity')
    selected=set()
    for name in selected_paths:
        _canonical(name)
        match=FILE.fullmatch(name)
        if not match or match.group(1)!='train' or name in selected:
            raise IntakeError('Selection must contain unique exact TRAIN crop paths')
        selected.add(name)
        if len(selected)>limits.max_selected_files:
            raise IntakeError('Selection file bound exceeded')
    if not selected:
        raise IntakeError('Empty selection forbidden')
    _safe_ancestors(archive)
    before=_identity(archive.stat())
    if before['bytes']!=expected_bytes or not archive.is_file():
        raise IntakeError('Archive payload size mismatch')
    try:
        destination=create_run_directory(destination)
    except Exception as error:
        raise IntakeError(str(error)) from error
    receipt={'status':'incomplete','archive':str(archive.resolve()),'archive_identity_before':before,
        'limits':vars(limits),'selected_files':0,'retained_bytes':0,'members':0,'regular_files':0,
        'split_files':{name:0 for name in ('train','validation','test')},'selected':[]}
    try:
        resources=_Resources(destination,limits)
        seen=set()
        regular_names=set()
        found=set()
        with open(archive,'rb') as source:
            if _identity(os.fstat(source.fileno()))!=before:
                raise IntakeError('Archive changed before read')
            compressed=_HashedReader(source,resources,expected_bytes)
            with gzip.GzipFile(fileobj=compressed,mode='rb') as gz:
                stream=_InflatedReader(gz,resources,limits)
                while True:
                    header=stream.exact(512)
                    if header==bytes(512):
                        if stream.exact(512)!=bytes(512):
                            raise IntakeError('Tar requires two zero end blocks')
                        trailer=0
                        while True:
                            block=stream.read(min(CHUNK,limits.max_trailer_bytes-trailer+1))
                            if not block:
                                break
                            trailer+=len(block)
                            if trailer>limits.max_trailer_bytes or any(block):
                                raise IntakeError('Nonzero/excessive tar trailer')
                        break
                    # TarInfo.frombuf validates header checksum but never reads
                    # PAX/GNU payloads. Unsupported types are rejected here.
                    info=tarfile.TarInfo.frombuf(header,encoding='ascii',errors='strict')
                    for field in (header[:100],header[345:500]):
                        if b'\0' in field and any(field.split(b'\0',1)[1]):
                            raise IntakeError('Nonzero name-field padding')
                    if info.type not in (tarfile.REGTYPE,tarfile.AREGTYPE,tarfile.DIRTYPE):
                        raise IntakeError('Unsupported tar member type')
                    name=info.name
                    if info.isdir() and name.endswith('/'):
                        name=name[:-1]
                    _canonical(name)
                    key=name.casefold()
                    if key in seen:
                        raise IntakeError('Duplicate/case-alias tar member')
                    seen.add(key)
                    receipt['members']+=1
                    if receipt['members']>limits.max_members:
                        raise IntakeError('Tar member count bound exceeded')
                    if info.isdir():
                        if name not in DIRECTORIES or info.size!=0:
                            raise IntakeError('Unexpected tar directory')
                        continue
                    match=FILE.fullmatch(name)
                    if not match or info.size<=0 or info.size>limits.max_file_bytes or info.mode & 0o111:
                        raise IntakeError('Unexpected crop path/size/executable mode')
                    receipt['regular_files']+=1
                    if receipt['regular_files']>limits.max_regular_files:
                        raise IntakeError('Regular file count bound exceeded')
                    regular_names.add(name)
                    receipt['split_files'][match.group(1)]+=1
                    keep=name in selected
                    output=None
                    digest=hashlib.sha256()
                    if keep:
                        if receipt['retained_bytes']+info.size>limits.max_output_bytes:
                            raise IntakeError('Retained output byte bound exceeded')
                        target=destination.joinpath(*name.split('/'))
                        _safe_ancestors(target)
                        target.parent.mkdir(parents=True,exist_ok=True)
                        _safe_ancestors(target)
                        output=open(target,'xb')
                    try:
                        remaining=info.size
                        while remaining:
                            block=stream.exact(min(remaining,CHUNK))
                            remaining-=len(block)
                            if output:
                                output.write(block)
                                digest.update(block)
                        if output:
                            output.flush()
                            os.fsync(output.fileno())
                    finally:
                        if output:
                            output.close()
                    padding=stream.exact((-info.size)%512)
                    if any(padding):
                        raise IntakeError('Nonzero member padding')
                    if keep:
                        found.add(name)
                        receipt['selected_files']+=1
                        receipt['retained_bytes']+=info.size
                        receipt['selected'].append({'path':name,'bytes':info.size,'sha256':digest.hexdigest()})
                receipt['decompressed_bytes']=stream.count
            # Gzip must have reached its CRC-checked EOF before admission.
            if compressed.count!=expected_bytes or compressed.digest.hexdigest()!=expected_sha256:
                raise IntakeError('Archive payload digest/size mismatch')
            after=_identity(os.fstat(source.fileno()))
        if after!=before or _identity(archive.stat())!=before:
            raise IntakeError('Archive identity changed during intake')
        if selected!=found:
            raise IntakeError('Selected crop missing from complete archive')
        for entry in receipt['selected']:
            resources.check(force=True)
            result=_verify_selected(destination/entry['path'],limits)
            if result['verified_sha256']!=entry['sha256']:
                raise IntakeError('Selected output changed after extraction')
            entry.update(result)
        names_payload=''.join(name+'\n' for name in sorted(regular_names)).encode('ascii')
        receipt.update(status='completed',archive_sha256=expected_sha256,archive_bytes=compressed.count,
            archive_identity_after=after,regular_paths=sorted(regular_names),
            regular_paths_sha256=hashlib.sha256(names_payload).hexdigest(),
            elapsed_seconds=time.monotonic()-resources.started,peak_rss_bytes=resources.peak_rss)
        payload=json.dumps(receipt,sort_keys=True,indent=2,allow_nan=False).encode('utf-8')
        if receipt['retained_bytes']+len(payload)+1>limits.max_output_bytes:
            raise IntakeError('Receipt-inclusive output bound exceeded')
        resources.check(force=True)
        _safe_ancestors(destination/'receipt.json')
        write_json_exclusive(destination/'receipt.json',receipt)
        return receipt
    except Exception as error:
        # No success marker is written on any integrity/resource/decode failure.
        try:
            write_json_exclusive(destination/'FAILED.json',{'status':'failed','error_type':type(error).__name__,
                'reason':str(error),'partial_outputs_admitted':False})
        except Exception:
            pass
        if isinstance(error,IntakeError):
            raise
        raise IntakeError(str(error)) from error
