"""Freeze public binary benchmark splits without training or changing IILAS models."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

DATA_ROOT = Path(__file__).parent / 'datasets'
SOURCES = DATA_ROOT / 'public-sources-2026-10-17'
INVENTORY_COLUMNS = ['SKU','INV','TIM','INQ','FOR3','FOR6','FOR9','SAL1','SAL3','SAL6','SAL9',
                     'MIN','RSK1','OVRP','SUP1','SUP2','OVRA','RSK2','RSK3','RSK4','RSK5','RSK6','BO']
# Omit identifiers, the target, undocumented INQ, generic flags and overdue-order amount.
INVENTORY_FEATURES = ['INV','TIM','FOR3','FOR6','FOR9','SAL1','SAL3','SAL6','SAL9','MIN','OVRP','SUP1','SUP2']
DELIVERY_FEATURES = ['payment_type','scheduled_shipping_days','shipping_mode','item_quantity','category_id']
DELIVERY_COLUMNS = ['group_id',*DELIVERY_FEATURES,'late_delivery_target']
PINNED = {
    'inventory': ('bopredict.csv','70604707896dc5eb03e68a907962246f786b464d7ba4ccf3964c139de55c4c99'),
    'delivery': ('dataco-benchmark-minimised.csv','facefe4930d1db9f3b0ad7865e6968483427b02afedb5015a49d24bf62ec7091'),
}


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1024*1024), b''): digest.update(block)
    return digest.hexdigest()


def schema(frame, expected):
    if len(frame.columns) != len(expected) or set(frame.columns) != set(expected):
        raise ValueError('Unexpected source schema; no input values were printed.')
    if frame.empty or frame.isna().any().any():
        raise ValueError('Empty source or missing values require review.')


def numeric(frame, fields):
    try: result = frame[fields].apply(pd.to_numeric, errors='raise')
    except (ValueError, TypeError): raise ValueError('Invalid numeric source value.') from None
    if not np.isfinite(result.to_numpy(dtype=float)).all(): raise ValueError('Nonfinite source value.')
    return result


def identifiers(series):
    if series.isna().any(): raise ValueError('Missing group identifier.')
    values = series.astype(str).str.strip()
    if values.eq('').any(): raise ValueError('Blank group identifier.')
    return values


def prepare_inventory(frame):
    schema(frame, INVENTORY_COLUMNS)
    values = numeric(frame, [c for c in INVENTORY_COLUMNS if c != 'SKU'])
    if not values[['BO',*[f'RSK{i}' for i in range(1,7)]]].isin([0,1]).all().all():
        raise ValueError('Invalid binary target or source flag.')
    if (values.drop(columns='INV') < 0).any().any(): raise ValueError('Unexpected negative source encoding.')
    groups = identifiers(frame.SKU)
    if groups.duplicated().any(): raise ValueError('Repeated SKU requires a reviewed longitudinal policy.')
    prepared = values[INVENTORY_FEATURES].copy()
    prepared['group_id'] = groups.map(lambda x: hashlib.sha256(('inventory:'+x).encode()).hexdigest()[:24])
    if prepared.group_id.nunique() != len(groups): raise ValueError('Group hash collision.')
    prepared['label'] = values.BO.astype(int)
    prepared['negative_inventory'] = values.INV < 0
    return prepared, {'negative_inventory_rows': int(prepared.negative_inventory.sum()),
        'negative_inventory_by_target': {str(k):int(v) for k,v in prepared.loc[prepared.negative_inventory,'label'].value_counts().items()},
        'cleaning_policy': 'Retain publisher encodings unchanged; flag negative INV for sensitivity analysis; no imputation, clipping or relabelling.',
        'excluded_features': ['SKU','INQ','OVRA',*[f'RSK{i}' for i in range(1,7)]],
        'limitations': ['Publisher preprocessing and complete encoding semantics are not documented in the accessed source.',
                        'No raw quantity, reorder-distance or temporal-generalisation claim is supported.']}


def prepare_delivery(frame):
    schema(frame, DELIVERY_COLUMNS)
    values = numeric(frame, ['scheduled_shipping_days','item_quantity','category_id','late_delivery_target'])
    if not values.late_delivery_target.isin([0,1]).all(): raise ValueError('Invalid binary target.')
    if ((values.scheduled_shipping_days < 0).any() or (values.item_quantity <= 0).any()
            or (values.category_id < 0).any() or (values % 1 != 0).any().any()):
        raise ValueError('Invalid delivery count or category encoding.')
    if (not frame.payment_type.isin(['DEBIT','TRANSFER','CASH','PAYMENT']).all()
            or not frame.shipping_mode.isin(['Same Day','First Class','Second Class','Standard Class']).all()):
        raise ValueError('Unknown source category requires dictionary review.')
    prepared = frame[DELIVERY_FEATURES].copy()
    for field in ['scheduled_shipping_days','item_quantity','category_id']: prepared[field] = values[field]
    prepared['group_id'] = identifiers(frame.group_id)
    prepared['label'] = values.late_delivery_target.astype(int)
    return prepared, {'cleaning_policy': 'Preserve same-day zero duration and repeated order-item rows; group by order; no imputation or resampling.',
        'upstream_exclusions': {'cancelled_shipping_rows':7754, 'record':'public-sources-2026-10-17/tabular-profile.json'},
        'limitations': ['Order-item benchmark; group splits prevent order overlap but do not establish temporal or customer-level generalisation.',
                        'Only native late-delivery labels; no proof, attempts or IILAS three-class labels inferred.']}


def assign_splits(frame, kind, seed=42):
    if kind not in PINNED: raise ValueError('Unsupported benchmark.')
    groups = identifiers(frame.group_id)
    labels = numeric(frame, ['label']).label
    if set(labels.unique()) != {0,1}: raise ValueError('Both binary classes are required.')
    pairs = pd.DataFrame({'group_id':groups,'label':labels}).drop_duplicates()
    if pairs.group_id.duplicated().any(): raise ValueError('Conflicting group targets require review.')
    assignments = {}
    for label in [0,1]:
        subset = pairs.loc[pairs.label==label,'group_id'].tolist()
        if len(subset) < 20: raise ValueError('Need at least 20 independent groups per class for this split protocol.')
        subset.sort(key=lambda group: (hashlib.sha256(f'{seed}\0{group}'.encode()).digest(),group))
        train_end = len(subset)* (80 if kind=='inventory' else 70)//100
        validation_end = train_end if kind=='inventory' else train_end + len(subset)*15//100
        for index,group in enumerate(subset):
            assignments[group] = 'train' if index<train_end else 'validation' if index<validation_end else 'test'
    return groups.map(assignments)


def build_tabular(source, output, kind, expected_sha256, seed=42):
    source, output = Path(source), Path(output)
    if output.exists(): raise FileExistsError('Destination exists; refusing overwrite.')
    if sha256(source) != expected_sha256: raise ValueError('Source checksum mismatch; review source version.')
    raw = pd.read_csv(source, dtype={'SKU':'string'} if kind=='inventory' else {'group_id':'string'})
    prepared, quality = prepare_inventory(raw) if kind=='inventory' else prepare_delivery(raw)
    split = assign_splits(prepared, kind, seed)
    manifest = pd.DataFrame({'source_row':np.arange(2,len(prepared)+2), 'group_id':prepared.group_id,
                             'label':prepared.label,'split':split})
    if kind=='inventory': manifest['negative_inventory'] = prepared.negative_inventory
    summaries = {}
    for name,part in manifest.groupby('split'):
        if set(part.label.unique())!={0,1}: raise ValueError('Split is missing a class.')
        summaries[name] = {'rows':len(part),'groups':int(part.group_id.nunique()),
            'class_rows':{str(k):int(v) for k,v in part.label.value_counts().items()},
            'class_groups':{str(k):int(v) for k,v in part.groupby('label').group_id.nunique().items()}}
        if kind=='inventory': summaries[name]['negative_inventory_rows'] = int(part.negative_inventory.sum())
    if manifest.groupby('group_id').split.nunique().max()!=1: raise ValueError('Group leakage detected.')
    if sha256(source) != expected_sha256: raise ValueError('Source changed during preparation.')
    output.mkdir(parents=True,exist_ok=False)
    manifest.to_csv(output/'splits.csv',index=False)
    report = {'protocol_version':'public-benchmark-splits-1.0','benchmark':kind,'seed':seed,
        'algorithm':'SHA256(seed + NUL + group_id), sorted separately per native target; integer-floor group quotas',
        'fractions':{'train':.8,'test':.2} if kind=='inventory' else {'train':.7,'validation':.15,'test':.15},
        'source_file':source.name,'source_sha256':expected_sha256,'source_rows':len(raw),
        'features':INVENTORY_FEATURES if kind=='inventory' else DELIVERY_FEATURES,
        'target':'BO' if kind=='inventory' else 'late_delivery_target', 'target_values':[0,1],
        'quality':quality,'splits':summaries,'split_sha256':sha256(output/'splits.csv'),
        'preparation_code_sha256':sha256(__file__),'pandas_version':pd.__version__,
        'model_trained':False,'primary_iilas_task_evaluated':False,
        'status':'split_preparation_complete_not_model_acceptance',
        'training_constraints':['Fit all encoders/scalers/imputers/resampling on training data only.',
            'Keep identifiers, source_row, cohort flags and labels out of predictors.',
            'Do not select seeds, thresholds or hyperparameters using held-out test results.',
            'Existing primary-task trainers do not consume this manifest; a benchmark-specific runner is required.']}
    with (output/'manifest.json').open('x',encoding='utf-8') as handle: json.dump(report,handle,indent=2)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kind',choices=PINNED)
    parser.add_argument('--source',type=Path)
    parser.add_argument('--output',type=Path)
    args = parser.parse_args()
    source = args.source or SOURCES/PINNED[args.kind][0]
    output = args.output or DATA_ROOT/'benchmark-splits-v1'/args.kind
    try:
        if any(not path.resolve().is_relative_to(DATA_ROOT.resolve()) or path.resolve()==DATA_ROOT.resolve()
               for path in [source,output]): raise ValueError('Use ignored dataset subfolders.')
        report = build_tabular(source,output,args.kind,PINNED[args.kind][1])
        print(json.dumps({key:report[key] for key in ['benchmark','source_rows','splits','model_trained']},indent=2))
        return 0
    except (OSError,ValueError,TypeError,KeyError):
        print('Preparation stopped: check source hash/schema, group coverage and unused output path. No source values printed.')
        return 1


if __name__=='__main__':raise SystemExit(main())
