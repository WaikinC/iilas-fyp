# Native tabular development execution — 20 October 2026

The user's continuation starts the next core AI research step after runner implementation. The assistant operator reviewed the saved protocols and an independent agent reviewed Olist execution controls. This records operator review for a bounded local experiment, not supervisor approval or completion of either report's primary three-class evaluation. Additional features remain deferred.

## Frozen scope and execution decision

- Olist: one development invocation of `olist-native-calendar-lateness-1.0`, using the existing four purchase-time predictors, fixed 13 primary plus eight sensitivity fits, and validation-only selection/reporting. The target is retrospective calendar lateness conditional on recorded completion. Contemporaneous delivery recording and an unchanged estimate communicated at purchase remain unverified assumptions.
- No confirmation invocation is included. Confirmation requires successful sealed development and a separate deliberate execution decision. No model is activated in the application.
- FreshRetailNet: the actual preflight again refused `available_memory`. Its required 10 GiB currently available RAM remains unchanged. No FreshRetailNet fit, feature preparation or prediction was started in this continuation.
- Olist has no global development replay claim. This continuation authorizes one attempt at `research/datasets/olist-development-20261020`; preserve any failure and do not retry by choosing another folder without an append-only amended decision.
- All original sources, models, derived rows and predictions remain local under ignored `research/datasets/`. Code, protocol, environment and source hashes are bound by the runner and the separate execution-review record.

Commands run on verified host **MSI**, using the existing research Python after dot-sourcing `Enter-IILAS.ps1`:

```powershell
python research/freshretailnet_train.py preflight
python research/olist_train.py develop --output research/datasets/olist-development-20261020
```

Immediately before launch, Olist's preflight measured 4,059,840,512 available bytes (about 3.78 GiB), clearing its 3 GiB gate. The runner continues to enforce 3 GiB available before each fit, 2 GiB combined RSS, 600 seconds per fit, 90 minutes total and one numerical thread. The run must complete all required fits and reporting before any complete-result claim.

## Verification and evidence

Fresh pre-execution research suite: 122 tests in 40.198 seconds; 121 passed and one Windows symlink-privilege test skipped. This is software verification, not model-quality evidence. No implementation or dependency changes were made for this execution.

Local evidence is in ignored `outputs/native-development-20261020/`: `execution-review.json`, resource snapshots, `research-tests.txt`, launch log and preservation baseline. The baseline covers 3,769 non-cache research dataset/artifact files, excluding the isolated `_deps` dependency tree and test-temp directories; its count is not directly comparable with earlier baselines using different inclusion rules.

## Parcel prerequisite check

An independent read-only audit found no new human decisions: all 40 pilot decision rows, 400 expanded condition rows and 440 combined family-mapping rows remain pending, with 133 proposed groups and zero approved families or splits. Prior packet hashes still match. The combined 32 quarantine recommendations are proposals, not approved labels. Of the 400 expanded images, 347 previously had only thumbnail screening.

Human original-resolution condition/visibility review and accepted or revised family constraints remain necessary before group-aware splitting or image-model training. A useful next parcel deliverable is a unified review packet containing all 440 originals and the pending 133-group mapping, while preserving existing packets.

## Execution outcome

Olist development completed successfully: all **21 fits**, validation diagnostics and final artifact seal were produced. Whole-phase elapsed time was **117.122 seconds**, with monitored peak combined RSS **681,414,656 bytes (about 650 MiB)**. The 180 run files total 107,924,560 bytes and are all Git-ignored. No confirmation invocation, claim, scoring or final refit occurred. The 12,842-order confirmation cohort remains model-score-unexposed; its earlier aggregate inspection remains disclosed.

Primary validation contains **13,445 orders**, including **1,280 calendar-late orders (9.52%)**. These are development results used for selection, not independent final-test estimates.

| Family | Selected threshold | Macro F1 | Late precision | Late recall | Average precision |
| --- | ---: | ---: | ---: | ---: | ---: |
| Random Forest | 0.05 | 0.506848 | 10.90% | 16.09% | 0.100700 |
| Decision Tree | 0.59 | 0.478825 | 13.04% | 0.47% | 0.099864 |
| Logistic Regression | 0.54 | 0.487507 | 7.56% | 9.14% | 0.090359 |
| Prior Dummy | 0.50 | 0.475010 | Undefined: no alerts | 0.00% | 0.095203 |

RF is the fixed-registry diagnostic winner, with macro F1 about 0.03184 above Dummy. However, it generates **1,890 alerts: 206 true late alerts and 1,684 false alerts**, while missing **1,074 late orders**. Its average precision is only slightly above the positive prevalence. At threshold 0.5, the selected RF emits no positive alerts. The selected point does not support operational acceptance; high majority-class accuracy alone would conceal missed late orders. These results also cannot be compared directly with DataCo scores as a measured improvement: the sources, tasks and populations differ.

The fixed sensitivities and slices were completed without retuning. RF macro F1 is 0.493367 for strict-midnight refitting, 0.509637 for chronology refitting, 0.507824 for unseen-at-window-origin customers, and 0.494792 for the 60-day-maturity slice. Targets and populations differ; do not rank these as interchangeable competitors. Full reference comparisons and metrics remain in the local report.

Primary RF descriptive 95% macro-F1 intervals are [0.498812, 0.516423] for customer clustering and [0.494193, 0.514970] for week clustering, each with 500 valid replicates. The methods separately acknowledge customer and temporal dependence, condition on the fitted/selected model, and do not correct development selection optimism or prove future generalisation.

Root verification confirms all 3,769 baseline files / 1,137,497,438 bytes retain their SHA-256 hashes, all 180 run artifacts are ignored and zero dataset files are tracked. Evidence is `outputs/native-development-20261020/root-verification.json`. The expanded source secret scan passes across 221 files and `git diff --check` passes. No app code or dependency changed, so application build/lint/Firebase/browser checks were not repeated for this experiment.

Independent verification passed the complete development seal, exact 21-fit registry and every fit input's four-feature/training-label boundary. The reviewer reconstructed validation order from the original source and recalculated all four primary models' metrics/confusion matrices from saved probabilities; all agree with the report. The longest fit was 9.129 seconds, within its 600-second ceiling. No confirmation artifact or claim exists. The aggregate review is saved at `outputs/native-development-20261020/independent-review.json`.

## Next core work

1. Preserve the frozen Olist development result. A separately requested confirmation run can test the locked choices once; it must retain the current source/code/selection hashes and remaining cumulative budget. It cannot repair low validation precision by retuning on confirmation.
2. Clear the genuine 10 GiB available-RAM gate before FreshRetailNet preparation/development. Do not lower the gate, silently subsample or close unrelated applications automatically.
3. Prepare the combined parcel review packet, then collect actual human condition/visibility/family decisions before image splits and training.
4. If stronger Olist predictors are later proposed, use a new dated development protocol that verifies their purchase-time availability and fixes an independent evaluation strategy. More rows alone do not establish better precision. Primary IILAS three-class labels remain a separate report requirement.

Additional features, production activation and Git publication remain deferred.
