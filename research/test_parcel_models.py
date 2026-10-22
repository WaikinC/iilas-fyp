"""No TensorFlow import at collection; one explicitly supervised software worker."""
import unittest
from pathlib import Path
from parcel_models import CLASSES, build_classifier


class ModelContractTests(unittest.TestCase):
    def test_class_order_and_reject_unknown(self):
        self.assertEqual(CLASSES, ('Normal', 'Damaged'))
        with self.assertRaises(ValueError): build_classifier('unknown', None)
        with self.assertRaises(ValueError): build_classifier('mobilenetv2', Path('missing-fixture.weights.h5'))


def software_worker(output, local_fixture=False):
    from runner_runtime import require_supervised_worker, write_json_exclusive
    require_supervised_worker()
    from parcel_train import worker_environment
    import sys
    if 'tensorflow' not in sys.modules: worker_environment(output)
    import tensorflow as tf
    import numpy as np
    import gc
    tf.config.set_visible_devices([], 'GPU')
    tf.config.threading.set_intra_op_parallelism_threads(1)
    tf.config.threading.set_inter_op_parallelism_threads(1)
    results = []
    for name in (('efficientnetb0',) if local_fixture else ('mobilenetv2', 'efficientnetb0')):
        tf.keras.utils.set_random_seed(42)
        weights_path = None
        if local_fixture:
            fixture = build_classifier(name, None)
            weights_path = Path(output)/'synthetic-backbone.weights.h5'
            fixture.get_layer(name+'_backbone').save_weights(weights_path)
            del fixture
            tf.keras.backend.clear_session(); gc.collect()
        model = build_classifier(name, weights_path)
        x = np.random.default_rng(42).uniform(0,255,(1,224,224,3)).astype('float32')
        before = model(x, training=False).numpy()
        assert before.shape == (1,2) and np.isfinite(before).all()
        backbone = model.get_layer(name + '_backbone')
        assert not backbone.trainable
        if name == 'mobilenetv2':
            scaling = model.get_layer('mobilenet_scaling')
            np.testing.assert_allclose(scaling(np.array([0.,255.], dtype='float32')).numpy(), [-1.,1.])
        else:
            scaling = next(layer for layer in backbone.layers if isinstance(layer, tf.keras.layers.Rescaling))
            assert abs(scaling.scale - 1./255.) < 1e-9
            if local_fixture:
                import math
                correction = backbone.get_layer('imagenet_stddev_correction')
                np.testing.assert_allclose(correction.scale, [1./math.sqrt(s) for s in (.229,.224,.225)])
                assert isinstance(correction.input._keras_history.operation, tf.keras.layers.Normalization)
                # Verify the installed implementation still uses the declared constants.
                import inspect
                from keras.src.applications import efficientnet
                assert efficientnet.IMAGENET_STDDEV_RGB == [.229,.224,.225]
                assert 'if weights == "imagenet":' in inspect.getsource(efficientnet.EfficientNet)
        frozen = [v.numpy().copy() for v in backbone.weights]
        head = [v.numpy().copy() for v in model.trainable_weights]
        model.train_on_batch(x, np.array([1]))
        assert any(not np.array_equal(a,b.numpy()) for a,b in zip(head,model.trainable_weights))
        assert all(np.array_equal(a,b.numpy()) for a,b in zip(frozen,backbone.weights))
        expected = model(x, training=False).numpy()
        path = Path(output)/(name+'.keras'); model.save(path)
        loaded = tf.keras.models.load_model(path, safe_mode=True)
        np.testing.assert_allclose(expected, loaded(x, training=False).numpy(), rtol=1e-5, atol=1e-6)
        results.append(dict(architecture=name, weights='local-random-fixture' if local_fixture else 'random', evidence='software-only', scores=before.tolist(), head_update=True, frozen_backbone=True, safe_load_parity=True, local_normalization_checked=local_fixture))
        del model, loaded, backbone, frozen, head
        tf.keras.backend.clear_session(); gc.collect()
    write_json_exclusive(Path(output)/'models.json', dict(tensorflow=tf.__version__, results=results))


if __name__ == '__main__':
    import sys
    if len(sys.argv) == 3 and sys.argv[1] == '--software-worker': software_worker(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == '--local-fixture-worker': software_worker(sys.argv[2], True)
    elif len(sys.argv) == 3 and sys.argv[1] == '--all-software-worker':
        for suffix, local in (('random',False), ('local',True)):
            out = Path(sys.argv[2])/suffix; out.mkdir()
            software_worker(out, local)
    else: unittest.main()
