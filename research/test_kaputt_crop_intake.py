"""Crafted archive tests; never read the downloaded corpus."""
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import cv2
import numpy as np

try:
    import kaputt_crop_intake as intake
except ModuleNotFoundError:
    intake = None

ROOT = Path(__file__).resolve().parent / 'datasets'
TRAIN = 'data/train/query-data/crop/00000000-0000-0000-0000-000000000001.jpg'
TEST = 'data/test/query-data/crop/00000000-0000-0000-0000-000000000002.jpg'

def jpeg():
    ok, encoded = cv2.imencode('.jpg', np.zeros((64,64,3), dtype=np.uint8))
    assert ok
    return encoded.tobytes()

def member(name, data=None, kind=tarfile.REGTYPE, size=None):
    payload = jpeg() if data is None else data
    info = tarfile.TarInfo(name)
    info.type = kind
    info.mode = 0o644
    info.size = len(payload) if size is None else size
    if kind != tarfile.REGTYPE:
        info.size = 0
        info.linkname = '../outside'
    return info.tobuf(format=tarfile.USTAR_FORMAT) + payload[:info.size] + bytes((-info.size) % 512)

class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(intake, 'bounded crop intake implementation is missing')
        ROOT.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix='intake-test-', dir=ROOT)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.archive = self.root / 'fixture.tar.gz'
        self.dest = self.root / 'selected'
        self.limits = intake.IntakeLimits(min_available_bytes=0, available_floor_bytes=0,
            min_free_disk_bytes=0, max_rss_bytes=1024**3, max_decompressed_bytes=1024**2,
            max_file_bytes=10000, max_output_bytes=100000, max_trailer_bytes=16384)

    def write_archive(self, members, trailer=None):
        raw = b''.join(members) + (bytes(1024) if trailer is None else trailer)
        self.archive.write_bytes(gzip.compress(raw))
        return hashlib.sha256(self.archive.read_bytes()).hexdigest(), self.archive.stat().st_size

    def run_intake(self, members, selected=None, **changes):
        digest, size = self.write_archive(members)
        return intake.extract_selected(self.archive, self.dest, selected or [TRAIN],
            changes.pop('expected_sha256', digest), changes.pop('expected_bytes', size),
            limits=self.limits, **changes)

    def test_roundtrip_extracts_only_train_and_receipt_after_full_stream(self):
        receipt = self.run_intake([member(TRAIN), member(TEST, b'not-a-jpeg')])
        self.assertEqual(receipt['status'], 'completed')
        self.assertEqual(receipt['regular_files'], 2)
        self.assertEqual(receipt['selected_files'], 1)
        self.assertTrue((self.dest / TRAIN).is_file())
        self.assertFalse((self.dest / TEST).exists())
        self.assertEqual(json.loads((self.dest / 'receipt.json').read_text())['status'], 'completed')

    def test_unsafe_names_and_types_rejected_before_external_write(self):
        outside = self.root / 'outside'
        outside.write_bytes(b'preserve')
        cases = ['../outside', '/absolute', 'C:/outside', 'C:outside', '//server/a',
            'data\\train\\x', 'data/train/query-data/crop/CON.jpg',
            TRAIN + ':stream', TRAIN + '.', TRAIN.replace('data/', 'data//'),
            TRAIN.replace('/train/', '/./train/'), TRAIN.replace('/train/', '/train /')]
        for index, name in enumerate(cases):
            with self.subTest(name=name):
                self.dest = self.root / ('unsafe' + str(index))
                with self.assertRaises(intake.IntakeError):
                    self.run_intake([member(name)])
        self.assertEqual(outside.read_bytes(), b'preserve')

    def test_links_pax_gnu_sparse_and_devices_rejected(self):
        for index, kind in enumerate([tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.XHDTYPE,
                tarfile.XGLTYPE, tarfile.GNUTYPE_LONGNAME, tarfile.GNUTYPE_SPARSE,
                tarfile.CHRTYPE, tarfile.FIFOTYPE]):
            with self.subTest(kind=kind):
                self.dest = self.root / ('type' + str(index))
                with self.assertRaises(intake.IntakeError):
                    self.run_intake([member(TRAIN, kind=kind)])

    def test_casefold_duplicate_rejected(self):
        with self.assertRaises(intake.IntakeError):
            self.run_intake([member(TRAIN), member(TRAIN.upper())])

    def test_declared_oversize_and_stream_and_output_limits_rejected(self):
        baseline=vars(self.limits).copy()
        for index, (bounds, message) in enumerate([(dict(max_file_bytes=20),'size'),
                (dict(max_decompressed_bytes=1024),'decompressed'),
                (dict(max_output_bytes=100),'output')]):
            with self.subTest(bounds=bounds):
                self.dest = self.root / ('cap' + str(index))
                self.limits = intake.IntakeLimits(**{**baseline, **bounds})
                with self.assertRaisesRegex(intake.IntakeError,message):
                    self.run_intake([member(TRAIN)])

    def test_header_count_and_trailer_limits_are_independent(self):
        self.limits=intake.IntakeLimits(**{**vars(self.limits),'max_members':1})
        with self.assertRaisesRegex(intake.IntakeError,'member count'):
            self.run_intake([member(TRAIN),member(TEST)])
        self.dest=self.root/'trailer-cap'
        self.limits=intake.IntakeLimits(**{**vars(self.limits),'max_members':3,'max_trailer_bytes':10})
        digest,size=self.write_archive([member(TRAIN)], bytes(1024+11))
        with self.assertRaisesRegex(intake.IntakeError,'trailer'):
            intake.extract_selected(self.archive,self.dest,[TRAIN],digest,size,self.limits)

    def test_receipt_inclusive_output_bound_and_pixels_are_enforced(self):
        self.limits=intake.IntakeLimits(**{**vars(self.limits),'max_output_bytes':len(jpeg())+20})
        with self.assertRaisesRegex(intake.IntakeError,'Receipt-inclusive'):
            self.run_intake([member(TRAIN)])
        self.dest=self.root/'pixels'
        self.limits=intake.IntakeLimits(**{**vars(self.limits),'max_output_bytes':100000,'max_pixels':4095})
        with self.assertRaisesRegex(intake.IntakeError,'dimension'):
            self.run_intake([member(TRAIN)])

    def test_embedded_raw_name_alias_rejected(self):
        raw=bytearray(member(TRAIN))
        # Hide non-padding bytes after the first NUL in the name field, then
        # recompute a legitimate header checksum. TarInfo alone ignores it.
        raw[len(TRAIN)+1]=ord('x')
        raw[148:156]=b'        '
        checksum=sum(raw[:512])
        raw[148:156]=('%06o\x00 ' % checksum).encode('ascii')
        with self.assertRaisesRegex(intake.IntakeError,'padding'):
            self.run_intake([bytes(raw)])

    def test_missing_selection_wrong_hash_wrong_size_and_existing_output_rejected(self):
        for index, changes in enumerate([dict(selected=[TRAIN.replace('001.jpg','003.jpg')]),
                dict(expected_sha256='0'*64), dict(expected_bytes=1)]):
            with self.subTest(changes=changes):
                self.dest = self.root / ('bad' + str(index))
                with self.assertRaises(intake.IntakeError):
                    self.run_intake([member(TRAIN)], **changes)
                self.assertFalse((self.dest / 'receipt.json').exists())
        self.dest = self.root / 'existing'
        self.dest.mkdir()
        (self.dest/'keep').write_text('preserve')
        with self.assertRaises(intake.IntakeError):
            self.run_intake([member(TRAIN)])
        self.assertEqual((self.dest/'keep').read_text(), 'preserve')

    def test_truncation_crc_corruption_nonzero_trailer_and_bad_header_rejected(self):
        for index, mutate in enumerate([lambda b:b[:-5], lambda b:b[:-8]+bytes(8)]):
            self.dest = self.root / ('gzip' + str(index))
            self.write_archive([member(TRAIN)])
            payload = mutate(self.archive.read_bytes())
            self.archive.write_bytes(payload)
            with self.assertRaises(intake.IntakeError):
                intake.extract_selected(self.archive,self.dest,[TRAIN],hashlib.sha256(payload).hexdigest(),len(payload),self.limits)
            self.assertFalse((self.dest/'receipt.json').exists())
        self.dest = self.root / 'trailer'
        digest,size = self.write_archive([member(TRAIN)], bytes(1024)+b'x')
        with self.assertRaises(intake.IntakeError):
            intake.extract_selected(self.archive,self.dest,[TRAIN],digest,size,self.limits)
        self.dest = self.root / 'header'
        broken=bytearray(member(TRAIN));broken[0] = ord('X')
        with self.assertRaises(intake.IntakeError):
            self.run_intake([bytes(broken)])

    def test_heldout_selection_and_bad_selected_jpeg_rejected(self):
        with self.assertRaises(intake.IntakeError):
            self.run_intake([member(TEST)], selected=[TEST])
        self.dest = self.root/'bad-image'
        with self.assertRaises(intake.IntakeError):
            self.run_intake([member(TRAIN,b'not-jpeg')])
        self.assertFalse((self.dest/'receipt.json').exists())

    def test_heldout_is_never_decoded(self):
        original = cv2.imread
        seen=[]
        def record(path,*args,**kwargs):
            seen.append(str(path))
            return original(path,*args,**kwargs)
        with patch.object(cv2,'imread',side_effect=record):
            self.run_intake([member(TRAIN),member(TEST,b'invalid-heldout')])
        self.assertTrue(seen)
        self.assertTrue(all('/test/' not in name.replace('\\','/') for name in seen))

if __name__ == '__main__':
    unittest.main()
