"""Reproducible training and inference. Missing models never produce fallback predictions."""
from pathlib import Path
import argparse
import hashlib
import json
import platform
from datetime import datetime, timezone
import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import StratifiedGroupKFold, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix

SCHEMAS = {
    'inventory': {'features': ['available_quantity','reserved_quantity','movement_frequency','reorder_distance','adjustment_count','days_since_replenishment'], 'labels': ['Normal','Reorder Risk','Critical Stock Risk']},
    'delivery': {'features': ['expected_duration_hours','elapsed_hours','failed_attempts','has_proof','status_event_count','parcel_count'], 'labels': ['Low','Medium','High']},
}
MODEL_DIR = Path(__file__).parent / 'models'

def read_dataset(path, kind):
    schema = SCHEMAS[kind]
    frame = pd.read_csv(path)
    required = schema['features'] + ['label','group_id']
    if not set(required).issubset(frame.columns):
        raise ValueError(f'Required CSV columns: {required}')
    if frame[required].isna().any().any() or frame[required].duplicated().any():
        raise ValueError('Resolve missing values and duplicate observations before training.')
    if set(frame.label) != set(schema['labels']):
        raise ValueError(f'All expected label classes are required: {schema["labels"]}')
    features = frame[schema['features']].apply(pd.to_numeric, errors='raise')
    if not np.isfinite(features.to_numpy()).all():
        raise ValueError('Features must be finite numbers.')
    if frame.groupby('label').group_id.nunique().min() < 5:
        raise ValueError('Each class needs at least five independent groups for grouped evaluation.')
    return frame, features

def train_tabular(path, kind, output=MODEL_DIR, provenance=''):
    if not provenance.strip():
        raise ValueError('Supply dataset provenance and the human labelling method.')
    schema = SCHEMAS[kind]
    frame, features = read_dataset(path, kind)
    labels = frame.label
    # Grouped split prevents observations of the same product/delivery leaking into test data.
    train, test = next(StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42).split(features, labels, groups=frame.group_id))
    for indices in [train, test]:
        if set(labels.iloc[indices]) != set(schema['labels']):
            raise ValueError('Split misses a class. Collect more independent groups.')
    candidates = {'RandomForest': RandomForestClassifier(n_estimators=200, class_weight='balanced', random_state=42, n_jobs=-1), 'DecisionTree': DecisionTreeClassifier(class_weight='balanced', random_state=42)}
    if kind == 'delivery':
        candidates['LogisticRegression'] = make_pipeline(StandardScaler(), LogisticRegression(class_weight='balanced', max_iter=2000, random_state=42))
    reports = {}
    train_counts = frame.iloc[train].groupby('label').group_id.nunique().min()
    folds = min(5, int(train_counts))
    if folds < 2:
        raise ValueError('Not enough training groups for cross-validation.')
    cv = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=43)
    for name, model in candidates.items():
        scores = cross_val_score(model, features.iloc[train], labels.iloc[train], groups=frame.group_id.iloc[train], cv=cv, scoring='f1_macro')
        model.fit(features.iloc[train], labels.iloc[train])
        predicted = model.predict(features.iloc[test])
        reports[name] = {'classification_report': classification_report(labels.iloc[test], predicted, labels=schema['labels'], output_dict=True, zero_division=0), 'confusion_matrix': confusion_matrix(labels.iloc[test], predicted, labels=schema['labels']).tolist(), 'cv_macro_f1': scores.tolist()}
    version = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    metadata = {'kind':kind, 'model':'RandomForest', 'version':version, 'features':schema['features'], 'classes':schema['labels'], 'provenance':provenance, 'createdAt':datetime.now(timezone.utc).isoformat(), 'train_rows':len(train), 'test_rows':len(test), 'class_counts':frame.label.value_counts().to_dict(), 'train_groups':sorted(map(str, frame.group_id.iloc[train].unique())), 'test_groups':sorted(map(str, frame.group_id.iloc[test].unique())), 'python':platform.python_version(), 'sklearn':sklearn.__version__, 'evaluation':reports, 'humanReviewRequired':True}
    output = Path(output); output.mkdir(parents=True, exist_ok=True)
    joblib.dump({'model':candidates['RandomForest'], 'metadata':metadata}, output / f'{kind}.joblib')
    (output / f'{kind}-evaluation.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    return metadata

def predict_tabular(kind, values, directory=MODEL_DIR):
    path = Path(directory) / f'{kind}.joblib'
    if not path.is_file():
        raise FileNotFoundError(f'{kind} model unavailable: collect labelled data and complete training/evaluation first.')
    # Load only operator-installed local artefacts; never accept uploaded pickle/joblib files.
    bundle = joblib.load(path); schema = SCHEMAS[kind]
    row = pd.DataFrame([{key:float(values[key]) for key in schema['features']}])
    if not np.isfinite(row.to_numpy()).all():
        raise ValueError('Features must be finite numbers.')
    model = bundle['model']; probability = model.predict_proba(row)[0]
    index = int(np.argmax(probability))
    return {'label':str(model.classes_[index]), 'confidence':float(probability[index]), 'probabilities':dict(zip(map(str, model.classes_), map(float, probability))), 'model':'RandomForest', 'modelVersion':bundle['metadata']['version'], 'features':values, 'globalFeatureImportance':dict(zip(schema['features'], map(float, model.feature_importances_))), 'humanReviewRequired':True}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('kind', choices=SCHEMAS); parser.add_argument('csv'); parser.add_argument('--provenance', required=True); parser.add_argument('--output', default=str(MODEL_DIR))
    args = parser.parse_args(); result = train_tabular(args.csv, args.kind, args.output, args.provenance)
    print(f'Trained {args.kind} RandomForest. Evaluation saved; {result["test_rows"]} held-out observations. Human review required.')
