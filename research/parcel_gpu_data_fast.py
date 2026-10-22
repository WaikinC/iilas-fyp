"""Linux-only full transport verification with anchored cached directory FDs.

The frozen slow loader remains the metadata/provenance reference. Every input
is still hashed; no pixel decoder, ML package, or Windows admission is imported.
"""
import hashlib
import os
from pathlib import Path, PurePosixPath
import stat
import sys
from types import SimpleNamespace

import parcel_gpu_data as slow


class _BytesPath:
    """Read-only path-shaped view of exactly the bytes already hashed."""
    __slots__=('_data',)
    def __init__(self,data):
        slow._require(isinstance(data,bytes) and len(data)<=32*slow.MiB,'Immutable metadata buffer bound failed')
        object.__setattr__(self,'_data',data)
    def __setattr__(self,*unused):raise AttributeError('Immutable metadata snapshot')
    def is_file(self):return True
    def stat(self):return SimpleNamespace(st_size=len(self._data))
    def read_text(self,encoding='utf-8',errors='strict'):return self._data.decode(encoding,errors)


def _supported():
    slow._require(sys.platform=='linux' and hasattr(os,'O_NOFOLLOW') and hasattr(os,'O_DIRECTORY') and hasattr(os,'O_NONBLOCK')
                  and os.open in os.supports_dir_fd,'Supported Linux descriptor flags required')


class _Reader:
    def __init__(self,root):
        _supported();self.root=PurePosixPath(str(Path(root).absolute()));self.cache={}
        slow._require('..' not in self.root.parts,'Unsafe descriptor root')
        opened=[]
        try:
            fd=os.open('/',self._flags(True));opened.append(fd)
            for part in self.root.parts[1:]:
                fd=os.open(part,self._flags(True),dir_fd=fd);opened.append(fd)
                slow._require(stat.S_ISDIR(os.fstat(fd).st_mode),'Non-directory root component')
            self.cache['']=opened.pop();self._canonical(self.cache[''],'')
        except BaseException:
            self.close();raise
        finally:
            for fd in reversed(opened):os.close(fd)

    @staticmethod
    def _flags(directory=False):
        return os.O_RDONLY|os.O_NOFOLLOW|getattr(os,'O_CLOEXEC',0)|(os.O_DIRECTORY if directory else os.O_NONBLOCK)

    def __enter__(self):return self
    def __exit__(self,*unused):self.close()

    def close(self):
        descriptors=set(self.cache.values());self.cache.clear();errors=[]
        for fd in descriptors:
            try:os.close(fd)
            except OSError as error:errors.append(error)
        if errors:raise errors[0]

    def _canonical(self,fd,relative):
        target=os.readlink('/proc/self/fd/'+str(fd))
        slow._require(not target.endswith(' (deleted)') and PurePosixPath(target)==self.root/relative,
                      'Descriptor target escaped containment or changed name')

    def _parent(self,relative):
        parts=PurePosixPath(slow._portable(relative)).parts;parent=''
        self._canonical(self.cache[''],'')
        for part in parts[:-1]:
            prefix=part if not parent else parent+'/'+part
            if prefix not in self.cache:
                self.cache[prefix]=os.open(part,self._flags(True),dir_fd=self.cache[parent])
                slow._require(stat.S_ISDIR(os.fstat(self.cache[prefix]).st_mode),'Non-directory descriptor component')
            self._canonical(self.cache[prefix],prefix);parent=prefix
        return self.cache[parent],parts[-1]

    @staticmethod
    def _snapshot(value):
        return tuple(getattr(value,name) for name in ('st_dev','st_ino','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns'))

    def read(self,relative,limit,parser=None):
        slow._require(parser is None or limit<=32*slow.MiB,'Metadata parser buffer exceeds fixed bound')
        parent,name=self._parent(relative)
        fd=os.open(name,self._flags(),dir_fd=parent)
        try:
            before=os.fstat(fd)
            slow._require(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and 0<before.st_size<=limit,
                          'Descriptor file type/hardlink/size bound failed')
            self._canonical(fd,relative);digest=hashlib.sha256();total=0;chunks=[] if parser is not None else None
            while block:=os.read(fd,slow.MiB):
                total+=len(block);slow._require(total<=limit,'Descriptor file grew beyond size bound');digest.update(block)
                if chunks is not None:chunks.append(block)
            parsed=parser(_BytesPath(b''.join(chunks))) if parser is not None else None
            after=os.fstat(fd);self._canonical(fd,relative)
            # Actual DrvFS proof showed this coupled advancing access stamp,
            # with identity/mode/size/mtime and the complete expected SHA intact.
            ctime_ok=(after.st_ctime_ns==before.st_ctime_ns or
                (after.st_ctime_ns>before.st_ctime_ns and after.st_atime_ns>before.st_atime_ns
                 and after.st_ctime_ns==after.st_atime_ns))
            slow._require(total==before.st_size and self._snapshot(before)[:-1]==self._snapshot(after)[:-1] and ctime_ok,
                          'Descriptor file metadata/inode changed during hash/parse')
            return digest.hexdigest(),parsed
        finally:os.close(fd)


def load_transport(path,repo_root=None):
    """Same full result as the frozen loader; original transport stays unchanged."""
    _supported();root=Path(repo_root or slow.ROOT).absolute();path=Path(path).absolute()
    slow._require(path.is_relative_to(root),'Transport outside descriptor root')
    relative=slow._portable(path.relative_to(root).as_posix());paths=[relative]
    def data_path(value):
        slow._portable(value);slow._require(value.startswith('research/datasets/'),'Transport asset outside research datasets')
        return value
    data_path(relative)
    with _Reader(root) as reader:
        _,payload=reader.read(relative,32*slow.MiB,slow._unseal)
        code_relative=Path(slow.CODE_PATH).absolute().relative_to(root).as_posix()
        reference_hash,_=reader.read(code_relative,slow.MiB)
        slow._require(payload.get('schema_version')==1 and payload.get('kind')==slow.KIND
            and payload.get('benchmark_profile')==slow.PROFILE and payload.get('class_order')==['Normal','Damaged']
            and payload.get('operationally_approved') is False
            and payload.get('admission_scope')=='relocation_of_Windows_validated_development_inputs_only'
            and payload.get('transport_code_sha256')==reference_hash and payload.get('weight_metadata')==slow.WEIGHT_METADATA
            and payload.get('proof_hashes')==sorted(slow.PROOF_HASHES),'Transport profile/code/pretrained metadata binding changed')
        copies=payload['source_copies'];slow._require(set(copies)=={'manifest','protocol'},'Exact original source copies required')
        parsed={}
        for name,record in copies.items():
            local=data_path(record['repo_path']);paths.append(local)
            parser=slow._unseal if name=='manifest' else lambda value:slow._json(value,slow.MiB)
            digest,parsed[name]=reader.read(local,(32 if name=='manifest' else 1)*slow.MiB,parser)
            slow._require(digest==record['sha256'],'Original source copy hash changed')
            slow._windows_relative(record['source_path'],payload['windows_repo_root'])
        manifest,protocol=parsed['manifest'],parsed['protocol']
        expected=slow._relocations(manifest,protocol,payload['settings'],payload['windows_repo_root'],copies['protocol']['source_path'])
        slow._require(payload['relocations']==expected,'Relocation membership/path table changed')
        slow._require(payload['membership_sha256']==slow._digest(manifest['rows']) and payload['membership_count']==len(manifest['rows']),
                      'Frozen membership changed')
        resolved=dict(images={},weights={},weight_proofs={})
        names={'image':'images','weight':'weights','weight_proof':'weight_proofs'}
        limits={'image':16*slow.MiB,'weight':128*slow.MiB,'weight_proof':slow.MiB}
        for record in expected:
            local=data_path(record['repo_path']);paths.append(local)
            digest,_=reader.read(local,limits[record['kind']])
            slow._require(digest==record['sha256'],'Relocated asset encoded hash changed')
            resolved[names[record['kind']]][record['key']]=str(root/local)
        for name,expected_hash in payload['source_code_bindings'].items():
            slow._require(isinstance(name,str) and '/' not in name and '\\' not in name and name.endswith('.py'),'Unsafe source code binding')
            digest,_=reader.read('research/'+name,slow.MiB)
            slow._require(digest==expected_hash,'Original source code binding changed')
        slow._git_check(root,paths)
        return dict(transport=payload,manifest=manifest,protocol=protocol,
                    settings=slow.copy.deepcopy(payload['settings']),resolved=resolved)
