"""Offline serializable model construction. TensorFlow is imported only on build."""
from pathlib import Path

CLASSES = ('Normal', 'Damaged')


def build_classifier(name: str, weights_path: Path | None):
    """None is for random-weight software fixtures, never pretrained evidence.

    Provided weights are local backbone files; invalid/missing files fail without
    attempting acquisition. Callers configure CPU/resource limits before import.
    """
    if name not in ('mobilenetv2', 'efficientnetb0'):
        raise ValueError('Unknown architecture: '+name)
    if weights_path is not None and not Path(weights_path).is_file():
        raise ValueError('Local backbone weights file missing')
    import tensorflow as tf
    keras = tf.keras
    factory = keras.applications.MobileNetV2 if name == 'mobilenetv2' else keras.applications.EfficientNetB0
    backbone = factory(include_top=False, weights=None, input_shape=(224,224,3), name=name+'_backbone')
    if name == 'efficientnetb0' and weights_path is not None:
        # Keras omits this stateless ImageNet correction for weights=None.
        # Clone the graph, inserting it AFTER Normalization, before local loading.
        # No acquisition path is invoked; the saved graph uses builtin layers only.
        import math
        def call_layer(layer, *args, **kwargs):
            value = layer(*args, **kwargs)
            if isinstance(layer, keras.layers.Normalization):
                value = keras.layers.Rescaling([1./math.sqrt(s) for s in (0.229,0.224,0.225)], name='imagenet_stddev_correction')(value)
            return value
        backbone = keras.models.clone_model(backbone, call_function=call_layer)
    if weights_path is not None: backbone.load_weights(str(weights_path))
    backbone.trainable = False
    inputs = keras.Input(shape=(224,224,3), name='rgb_0_255')
    x = keras.layers.Rescaling(1./127.5, offset=-1., name='mobilenet_scaling')(inputs) if name == 'mobilenetv2' else inputs
    x = backbone(x, training=False)
    x = keras.layers.GlobalAveragePooling2D()(x)
    x = keras.layers.Dropout(0.2)(x)
    outputs = keras.layers.Dense(2, activation='softmax', name='normal_damaged')(x)
    model = keras.Model(inputs, outputs, name=name+'_parcel')
    model.compile(optimizer=keras.optimizers.Adam(0.001), loss='sparse_categorical_crossentropy')
    return model
