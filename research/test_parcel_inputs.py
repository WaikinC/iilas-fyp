import unittest
import cv2
import numpy as np
import struct
from parcel_inputs import decode_rgb, prepare_image, augment_train, augment_image


class InputTests(unittest.TestCase):
    def test_rgb_and_rejection(self):
        rgb = np.zeros((64, 80, 3), np.uint8); rgb[:, :40, 0] = 255; rgb[:, 40:, 2] = 255
        ok, encoded = cv2.imencode('.png', cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
        self.assertTrue(ok)
        np.testing.assert_array_equal(decode_rgb(encoded.tobytes()), rgb)
        for data in (b'broken', cv2.imencode('.png', np.zeros((63, 80, 3), np.uint8))[1].tobytes()):
            with self.assertRaises(ValueError): decode_rgb(data)

    def test_exif_applied_once(self):
        rgb = np.zeros((64, 96, 3), np.uint8); rgb[:, :48, 0] = 255
        jpeg = cv2.imencode('.jpg', cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))[1].tobytes()
        exif = b'Exif\x00\x00II' + struct.pack('<HIH', 42, 8, 1) + struct.pack('<HHIHHI', 274, 3, 1, 6, 0, 0)
        encoded = jpeg[:2] + b'\xff\xe1' + struct.pack('>H', len(exif)+2) + exif + jpeg[2:]
        decoded = decode_rgb(encoded)
        self.assertEqual(decoded.shape, (96, 64, 3))
        self.assertGreater(decoded[:48, :, 0].mean(), 240)
        self.assertLess(decoded[48:, :, 0].mean(), 10)

    def test_letterbox_repeatability_and_variants(self):
        rgb = np.full((64, 128, 3), (80, 100, 120), np.uint8)
        for contrast in ('none', 'clahe'):
            out = prepare_image(rgb, contrast)
            self.assertEqual(out.shape, (224, 224, 3)); self.assertEqual(out.dtype, np.float32)
            self.assertTrue(0 <= out.min() <= out.max() <= 255)
            np.testing.assert_array_equal(out, prepare_image(rgb, contrast))
            np.testing.assert_array_equal(out[:56], 127)
        self.assertFalse(np.array_equal(prepare_image(rgb, 'none'), prepare_image(rgb, 'clahe')))
        odd = prepare_image(np.zeros((64, 100, 3), np.uint8), 'none')
        self.assertTrue(np.all(odd[:40] == 127)); self.assertTrue(np.all(odd[183:] == 127))
        with self.assertRaises(ValueError): prepare_image(rgb, 'invalid')

    def test_train_augmentation_is_explicit_and_bounded(self):
        image = np.arange(224*224*3, dtype=np.float32).reshape(224,224,3) % 256
        original = image.copy()
        result = augment_train(image, np.random.default_rng(42))
        np.testing.assert_array_equal(image, original)
        self.assertFalse(np.array_equal(result, image))
        self.assertGreaterEqual(result.min(), 0); self.assertLessEqual(result.max(), 255)
        np.testing.assert_array_equal(augment_image(image, np.random.default_rng(42), False), image)
        np.testing.assert_array_equal(augment_image(image, np.random.default_rng(42), True), result)

if __name__ == '__main__': unittest.main()
