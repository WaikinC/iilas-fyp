"""MobileNetV2 and EfficientNetB0 experiments with explicit, independent image splits."""
from pathlib import Path
import argparse
import hashlib
import json
import csv
import cv2
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix
from models import MODEL_DIR

CLASSES = ['Normal', 'Damaged']

def inspect_dataset(root):
    root = Path(root); seen = set(); counts = {}
    manifest = root/'manifest.csv'
    if not manifest.is_file(): raise ValueError('Provide manifest.csv with path, parcel_id and label, split by physical parcel.')
    with manifest.open(encoding='utf-8-sig',newline='') as handle:
        rows=list(csv.DictReader(handle))
    parcel_splits={};index={}
    for row in rows:
        if not all(row.get(key) for key in ['path','parcel_id','label']): raise ValueError('Incomplete parcel manifest.')
        path=Path(row['path']);split=path.parts[0]
        if path.is_absolute() or '..' in path.parts or split not in ['train','validation','test'] or len(path.parts)!=3 or path.parts[1]!=row['label']: raise ValueError('Invalid parcel manifest path or label.')
        if row['path'] in index: raise ValueError('Duplicate manifest entry.')
        if row['parcel_id'] in parcel_splits and parcel_splits[row['parcel_id']]!=split: raise ValueError('A physical parcel appears in multiple splits; resolve leakage.')
        parcel_splits[row['parcel_id']]=split;index[path.as_posix()]=row
    discovered=set()
    for split in ['train','validation','test']:
        counts[split] = {}
        for label in CLASSES:
            files = [p for p in (root / split / label).glob('*') if p.suffix.lower() in ['.jpg','.jpeg','.png','.webp']]
            if len(files) < 5:
                raise ValueError(f'{split}/{label} requires at least five independently labelled images.')
            counts[split][label] = len(files)
            for path in files:
                relative=path.relative_to(root).as_posix()
                if relative not in index or index[relative]['label']!=label: raise ValueError('Manifest must correctly label every image.')
                discovered.add(relative)
                image = cv2.imread(str(path))
                if image is None or min(image.shape[:2]) < 64:
                    raise ValueError(f'Unreadable or undersized image: {path.name}')
                digest = hashlib.sha256(image.tobytes()).hexdigest()
                if digest in seen:
                    raise ValueError('Duplicate decoded image across dataset; resolve leakage before training.')
                seen.add(digest)
    if discovered!=set(index): raise ValueError('Manifest contains missing or unsupported image files.')
    return counts

def build_model(name, weights='imagenet'):
    import tensorflow as tf
    inputs = tf.keras.Input(shape=(224,224,3))
    if name == 'MobileNetV2':
        backbone = tf.keras.applications.MobileNetV2(include_top=False, weights=weights, input_shape=(224,224,3))
        x = tf.keras.layers.Rescaling(1/127.5, offset=-1)(inputs)
    elif name == 'EfficientNetB0':
        backbone = tf.keras.applications.EfficientNetB0(include_top=False, weights=weights, input_shape=(224,224,3)); x = inputs
    else:
        raise ValueError('Unsupported image model.')
    backbone.trainable = False
    x = backbone(x, training=False); x = tf.keras.layers.GlobalAveragePooling2D()(x); x = tf.keras.layers.Dropout(0.2)(x)
    model = tf.keras.Model(inputs, tf.keras.layers.Dense(2, activation='softmax')(x))
    model.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss='sparse_categorical_crossentropy', metrics=['accuracy'])
    return model

def train_vision(root, provenance, output=MODEL_DIR, epochs=20):
    if not provenance.strip(): raise ValueError('Provide image provenance, labelling method, and parcel-level split procedure.')
    counts = inspect_dataset(root)
    import tensorflow as tf
    tf.keras.utils.set_random_seed(42)
    datasets = {split:tf.keras.utils.image_dataset_from_directory(Path(root)/split, class_names=CLASSES, image_size=(224,224), batch_size=16, shuffle=split=='train', seed=42) for split in counts}
    augment = tf.keras.Sequential([tf.keras.layers.RandomFlip('horizontal'),tf.keras.layers.RandomRotation(.05),tf.keras.layers.RandomContrast(.1)])
    training = datasets['train'].map(lambda x,y:(augment(x,training=True),y))
    output = Path(output); output.mkdir(parents=True, exist_ok=True)
    evaluation = {}
    for name in ['MobileNetV2','EfficientNetB0']:
        model = build_model(name)
        model.fit(training, validation_data=datasets['validation'], epochs=epochs, callbacks=[tf.keras.callbacks.EarlyStopping(patience=3, restore_best_weights=True)])
        expected = np.concatenate([y.numpy() for _,y in datasets['test']])
        predicted = np.argmax(model.predict(datasets['test'], verbose=0), axis=1)
        evaluation[name] = {'classification_report':classification_report(expected,predicted,labels=[0,1],target_names=CLASSES,output_dict=True,zero_division=0),'confusion_matrix':confusion_matrix(expected,predicted,labels=[0,1]).tolist()}
        model.save(output / f'{name}.keras')
    version = hashlib.sha256((output/'MobileNetV2.keras').read_bytes()).hexdigest()
    metadata = {'model':'MobileNetV2','version':version,'classes':CLASSES,'counts':counts,'provenance':provenance,'evaluation':evaluation,'humanReviewRequired':True}
    (output/'vision-evaluation.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    return metadata

def predict_image(data, directory=MODEL_DIR):
    directory = Path(directory)
    if not (directory/'MobileNetV2.keras').is_file(): raise FileNotFoundError('Parcel model unavailable: labelled Normal/Damaged images and evaluation are required.')
    image = cv2.imdecode(np.frombuffer(data,dtype=np.uint8),cv2.IMREAD_COLOR)
    if image is None or min(image.shape[:2])<64: raise ValueError('Upload a readable parcel image at least 64 pixels wide and high.')
    import tensorflow as tf
    model = tf.keras.models.load_model(directory/'MobileNetV2.keras')
    rgb = cv2.cvtColor(cv2.resize(image,(224,224)),cv2.COLOR_BGR2RGB)
    probabilities = model.predict(np.expand_dims(rgb,0),verbose=0)[0]; index = int(np.argmax(probabilities))
    metadata = json.loads((directory/'vision-evaluation.json').read_text(encoding='utf-8'))
    return {'label':CLASSES[index],'confidence':float(probabilities[index]),'model':'MobileNetV2','modelVersion':metadata['version'],'evidenceSha256':hashlib.sha256(data).hexdigest(),'humanReviewRequired':True}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('dataset');parser.add_argument('--provenance',required=True);parser.add_argument('--epochs',type=int,default=20);args=parser.parse_args()
    train_vision(args.dataset,args.provenance,epochs=args.epochs)
