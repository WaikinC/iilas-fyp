"""Frozen Olist V2 model and paired validation calculations."""
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import precision_recall_curve
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

import olist_train as v1
from olist_v2_prepare import BASE_FEATURES, FEATURES, STATES

CATEGORICAL = FEATURES[:3] + FEATURES[7:]
NUMERIC = FEATURES[3:7]
IMPUTED = NUMERIC[1:]
STATE_VALUES = STATES | {"UNKNOWN"}
V1_THRESHOLDS = {"RF": 0.05, "DT": 0.59, "LR": 0.54, "Dummy": 0.5}
COMPARISONS = [(f"V2_{family}", f"V1_{family}") for family in v1.FAMILIES]
COMPARISONS += [("V2_RF", "V2_DT"), ("V2_RF", "V2_LR")]


def registry():
    return [{**spec, "id": f"v2-{spec['index']:02d}-{spec['family']}"} for spec in v1.registry()]


def feature_frame(frame, *, training=False):
    if list(frame.columns) != FEATURES:
        raise ValueError("Exact ordered ten-feature allowlist required")
    v1.feature_frame(frame[BASE_FEATURES])
    numeric = frame[IMPUTED].to_numpy(dtype=float)
    present = ~np.isnan(numeric)
    if not np.isfinite(numeric[present]).all() or (numeric[present] < 0).any():
        raise ValueError("Invalid expanded numeric predictor")
    counts = numeric[:, 0][present[:, 0]]
    if (counts < 1).any() or not np.equal(counts, np.floor(counts)).all():
        raise ValueError("Invalid item record count")
    if training and not present.any(axis=0).all():
        raise ValueError("Expanded numeric predictor entirely missing in TRAIN")
    for column, allowed in (
        ("customer_state", STATE_VALUES),
        ("seller_state", STATE_VALUES | {"MULTIPLE"}),
        ("all_sellers_same_state_as_customer", {"SAME", "DIFFERENT", "UNKNOWN"}),
    ):
        if not frame[column].isin(allowed).all():
            raise ValueError(f"Invalid category in {column}")
    return frame


def pipeline(spec):
    resolve_numeric = ColumnTransformer([
        ("lead", "passthrough", NUMERIC[:1]),
        ("impute", SimpleImputer(strategy="median"), IMPUTED),
    ], verbose_feature_names_out=False)
    numeric = Pipeline([
        ("resolve", resolve_numeric),
        ("scale", StandardScaler() if spec["family"] == "LR" else "passthrough"),
    ])
    preprocess = ColumnTransformer([
        ("categorical", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
        ("numeric", numeric, NUMERIC),
    ])
    return Pipeline([("preprocess", preprocess), ("estimator", v1.estimator(spec))])


def preprocessing_metadata(model, validation):
    preprocessor = model.named_steps["preprocess"]
    encoder = preprocessor.named_transformers_["categorical"]
    numeric = preprocessor.named_transformers_["numeric"].named_steps
    imputer = numeric["resolve"].named_transformers_["impute"]
    scaler = numeric["scale"]
    return {
        "encoded_feature_order": preprocessor.get_feature_names_out().tolist(),
        "numeric_feature_order": NUMERIC,
        "categories": {name: values.tolist() for name, values in zip(CATEGORICAL, encoder.categories_, strict=True)},
        "training_medians": dict(zip(IMPUTED, imputer.statistics_.tolist(), strict=True)),
        "training_scaler": None if scaler == "passthrough" else {
            "mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist(),
        },
        "validation_unseen_counts": {
            name: int((~validation[name].isin(values)).sum())
            for name, values in zip(CATEGORICAL, encoder.categories_, strict=True)
        },
    }


def valid_probabilities(values, size):
    scores = np.asarray(values, dtype=float)
    if scores.shape != (size,) or not np.isfinite(scores).all() or (scores < 0).any() or (scores > 1).any():
        raise ValueError("Invalid validation probabilities")
    return scores


def choose_models(specs, probabilities, labels):
    selected, all_scores = {}, []
    for family in v1.FAMILIES:
        candidates = [(spec, probabilities[spec["id"]]) for spec in specs if spec["family"] == family]
        selected[family], scores = v1.select(candidates, labels)
        all_scores.extend(scores)
    return selected, all_scores


def paired_bootstrap(labels, probabilities, thresholds, groups):
    labels, groups = np.asarray(labels), np.asarray(groups)
    if labels.shape != groups.shape or labels.ndim != 1 or not set(labels.tolist()).issubset({0, 1}):
        raise ValueError("Invalid paired validation bootstrap grain")
    clusters, inverse = np.unique(groups.astype(str), return_inverse=True)
    replicates = 500
    result = {"seed": v1.SEED, "replicates": replicates, "clusters": len(clusters),
              "paired_multiplicities": True, "models": {}, "paired_differences": {}}
    if not len(clusters):
        return result
    rng = np.random.default_rng(v1.SEED)
    multiplicities = np.stack([
        np.bincount(rng.integers(len(clusters), size=len(clusters)), minlength=len(clusters))
        for _ in range(replicates)
    ]).astype(np.float64)
    vectors = {}

    def divide(a, b):
        return np.divide(a, b, out=np.zeros_like(a, dtype=float), where=b != 0)

    def interval(values):
        valid = np.isfinite(values)
        count = int(valid.sum())
        return {"interval": np.percentile(values[valid], [2.5, 97.5]).tolist() if count >= 475 else None,
                "valid_replicates": count, "invalid_replicates": replicates - count,
                "suppression_reason": None if count >= 475 else "Fewer than 475 class-complete replicates"}

    for name, values in probabilities.items():
        predicted = valid_probabilities(values, len(labels)) >= thresholds[name]
        by_cluster = np.column_stack([
            np.bincount(inverse, weights=(labels == a) & (predicted == b), minlength=len(clusters))
            for a, b in ((0, 0), (0, 1), (1, 0), (1, 1))
        ])
        tn, fp, fn, tp = (multiplicities @ by_cluster).T
        alerts = tp + fp
        valid = ((tn + fp) > 0) & ((tp + fn) > 0)
        measures = {
            "macro_f1": (divide(2 * tn, 2 * tn + fp + fn) + divide(2 * tp, 2 * tp + fp + fn)) / 2,
            "positive_precision": divide(tp, alerts),
            "positive_recall": divide(tp, tp + fn),
            "balanced_accuracy": (divide(tn, tn + fp) + divide(tp, tp + fn)) / 2,
            "alert_rate": divide(alerts, tn + fp + fn + tp),
        }
        vectors[name] = {key: np.where(valid, value, np.nan) for key, value in measures.items()}
        result["models"][name] = {key: interval(value) for key, value in vectors[name].items()}
        result["models"][name]["no_alert_replicates"] = int((alerts == 0).sum())
        result["models"][name]["no_alert_precision_convention"] = "undefined; zero used for scoring"
    for left, right in COMPARISONS:
        if left in vectors and right in vectors:
            result["paired_differences"][f"{left}-minus-{right}"] = {
                key: interval(values - vectors[right][key]) for key, values in vectors[left].items()
            }
    return result


def reported_metrics(labels, scores, threshold):
    if len(labels):
        report = v1.metrics(labels, scores, threshold)
    else:
        unavailable = ("accuracy", "macro_f1", "positive_f1", "balanced_accuracy", "average_precision",
                       "positive_prevalence", "alert_rate")
        report = {**dict.fromkeys(unavailable), "denominator": 0, "threshold": threshold,
                  "confusion_matrix": [[0, 0], [0, 0]], "true_predicted_class_order": [0, 1],
                  "classes": {str(label): {"precision": None, "recall": None, "f1": None, "support": 0}
                              for label in (0, 1)},
                  "alert_count": 0, "false_positives": 0, "false_negatives": 0,
                  "positive_precision_undefined": True, "missing_class": True,
                  "unavailable_metrics": list(unavailable)}
    matrix = np.asarray(report["confusion_matrix"])
    report["precision_undefined_by_class"] = {str(label): int(matrix[:, label].sum()) == 0 for label in (0, 1)}
    return report


def validation_report(frame, probabilities, thresholds):
    labels = frame["calendar"].to_numpy(dtype=int)
    if set(labels.tolist()) != {0, 1}:
        raise ValueError("Both validation classes are required")
    scores = {name: valid_probabilities(values, len(frame)) for name, values in probabilities.items()}

    def population(mask):
        return {
            name: {"selected": reported_metrics(labels[mask], values[mask], thresholds[name]),
                   "at_05": reported_metrics(labels[mask], values[mask], 0.5)}
            for name, values in scores.items()
        }

    overall = population(np.ones(len(frame), dtype=bool))
    lead = frame["promised_calendar_lead_days"].to_numpy()
    months = frame["month"].to_numpy()
    masks = {f"purchase_month_{month}": months == month for month in ("2018-01", "2018-02")}
    masks.update({f"lead_{low}_{high}": (lead >= low) & (lead <= high)
                  for low, high in ((0, 7), (8, 14), (15, 21), (22, 30))})
    masks.update(lead_31_plus=lead >= 31,
                 unseen_at_window_origin_customer=frame["unseen_customer"].to_numpy(dtype=bool),
                 maturity_60_day=frame["mature60"].to_numpy(dtype=bool))
    curves = {}
    for name, values in scores.items():
        precision, recall, cutoffs = precision_recall_curve(labels, values, drop_intermediate=False)
        curves[name] = {"precision": precision.tolist(), "recall": recall.tolist(), "thresholds": cutoffs.tolist()}
    return {
        "target": "calendar-late after promised date, conditional on recorded completion",
        "primary_contrast": "V2_RF-minus-V1_RF",
        "overall": overall,
        "selected_macro_f1_differences": {
            f"{left}-minus-{right}": overall[left]["selected"]["macro_f1"] - overall[right]["selected"]["macro_f1"]
            for left, right in COMPARISONS
        },
        "slices": {name: population(mask) for name, mask in masks.items()},
        "precision_recall_curves": curves,
        "paired_uncertainty_at_selected_thresholds": {
            group: paired_bootstrap(labels, scores, thresholds, frame[group].to_numpy())
            for group in ("customer", "week")
        },
    }
