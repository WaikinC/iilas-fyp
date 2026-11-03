# Critical-stock development investigation

23 October 2026. Read-only analysis of the original 240 development families and their saved three-fold validation predictions. No estimator was loaded, trained or invoked. No held-out test observations, test dossiers, test predictions or test metrics files were opened. Existing test results remain the separately recorded historical evaluation.

## Main finding

The original synthetic scenarios have an exact development-set association between supply status and label:

| Synthetic teaching label | Development families | Stated supply status | Additional demand exceeds available stock | Supply timely |
| --- | ---: | --- | ---: | ---: |
| Normal | 80 | confirmed in all 80 | 0 | 80 |
| Reorder Risk | 80 | planned in all 80 | 80 | 80 |
| Critical Stock Risk | 80 | disrupted in all 80 | 80 | 0 |

Supply status was **not** one of the six fitted predictors, so this does not establish that the existing model directly leaked that field. It shows why simply adding it to the original cohort would be a poor new experiment: status alone identifies the teaching label in these development cases. Such agreement would not demonstrate actual warehouse-risk accuracy. The generator explicitly constructs these strata; they are a designed teaching distribution, not observed prevalence.

The classifier cannot see the additional firm demand, its deadline, incoming quantity, arrival timing or supply status used by the teacher. Among the 80 Critical development cases, 23 still have available stock above their reorder level. The selected RF called 21 of those 23 Normal and two Critical in out-of-fold predictions. Of the other 57 Critical cases, it called 52 Critical and five Reorder. This supports investigating missing fulfilment context; it does not prove missing context is the only cause or quantify a theoretical ceiling. No exact six-feature vector with conflicting labels was found in this finite development sample.

## Saved validation evidence

The following figures pool the already saved validation predictions across all three folds. Each family has one prediction from a fit that excluded that family. Candidate selection used these folds, so these are descriptive development results, not independent new performance estimates. Pooled macro-F1 also differs from the mean-fold selection statistic; the original selection was not changed.

| Existing candidate | Development accuracy | Critical recall | Critical called Normal /80 |
| --- | ---: | ---: | ---: |
| RF depth6, leaf2 (selected) | 86.67% | 67.50% | 21 |
| RF depth6, leaf5 | 85.42% | 66.25% | 22 |
| RF depth12, leaf2 | 84.58% | 67.50% | 21 |
| RF depth12, leaf5 | 85.83% | 66.25% | 22 |
| DT depth4, leaf2 (selected comparator) | 85.00% | 70.00% | 19 |
| DT depth4, leaf5 | 82.92% | 67.50% | 21 |
| DT depth8, leaf2 | 80.83% | 71.25% | 18 |
| DT depth8, leaf5 | 82.50% | 68.75% | 20 |

For the selected RF, Critical recall differs across folds: 74.07%, 81.48% and 46.15%. All four RF candidates retain similar Critical weaknesses. This small existing grid does not prove every possible setting would fail. It does make a data/feature investigation more justified than assuming a larger forest or deeper trees will solve the problem.

The historical held-out RF result remains **75% accuracy and 45% Critical recall**, with nine Critical cases called Normal among 20. The 86.67% development figure above is not a replacement test score or evidence of improvement. The deployed local experimental artifact remains the same frozen RF; the DT remains a comparison model.

## Report alignment

The saved original Wong Ric Hang portfolio was rehashed: `5a89babe5d204fbf784c1bb10b3c7634d9012d68d9a294b6574f4d04ed281b93`. Chapter3 section3.2.5 allows reliable selected stock indicators, including stock-in/out activity, available/reserved relationships, adjustments and replenishment age. It does not mandate exactly six predictors. The six-field list was the first experiment's declared protocol choice. RF remains the specified main classifier, DT the comparator, and Critical risk refers to likely fulfilment impact.

Commitment and incoming-supply fields are a proposed implementation extension to that stock-condition task, not a claim that the report explicitly lists every such predictor. They must be cutoff-known, factual and separately versioned. Do not invent them for sparse real products or change the three condition definitions merely to obtain higher scores.

## Approaches and subsequent decision

**Recommended: revise the simulated coverage and test factual context inputs.** Retain the six original fields and prospectively compare them with an expanded set such as additional firm quantity, days to its deadline, stated replenishment quantity, days to arrival and confirmation/disruption state. Do not add the teaching label, its explanation or a precomputed risk decision as a feature. Reserved quantities are already deducted from available stock and must not be deducted again.

New scenarios would need to vary those conditions independently where physically coherent. For example, disrupted supply can still accompany Normal stock when available units cover commitments; confirmed supply can still leave Critical risk when it is late or insufficient. Include ordinary threshold-reorder situations without an immediate shortfall. Keep invalid/unknown cases separate, rather than forcing labels. This breaks the original one-status/one-label shortcut.

The design must specify prospective grouping and a fresh evaluation before any generation/fitting. Related counterfactual views of one underlying ledger stay in one family and split. Compare the six-field and expanded RF on the same newly frozen development folds; keep DT as comparator. Include the transparent synthetic teaching policy as an explicit control: matching a deterministic teacher is policy approximation, not independent warehouse accuracy. Preserve the original cohort, artifacts, consumed-test registry and scores. Do not repeatedly regenerate seeds or promote a model based on a consumed test.

**Alternative: retain the six fields and compare settings.** This keeps the current input contract and can test a declared bounded parameter/class-weight change, but leaves the target's commitment/supply information unobserved. It still requires a prospective protocol and genuinely fresh final evaluation. Higher recall may increase false alerts, and improvement is not guaranteed.

The user subsequently selected revised simulation and factual context inputs. The written design is docs/superpowers/specs/2026-10-23-inventory-context-experiment-design.md in the app checkout; its fresh builder check found nothing important left. The user approved that written design on 23 October 2026; the concrete implementation plan now awaits review. This investigation is not itself an approved new training protocol, dataset, run or app change. Keep Native execution as previously selected. Simulation remains authorised; real-inventory qualification, independent intended-use evaluation, camera testing and operational acceptance retain their separate boundaries.

## Verification

Ignored evidence is in `outputs/inventory-improvement-20261023/development-audit-4e98db3e-d4b0-4a75-b21d-ec6a8b822ac8/`; the analysis script is its sibling `development-audit.py`. The script uses only Python standard-library parsing/arithmetic, not the training modules or model libraries.

It verified the frozen main-manifest SHA, development-file hash, 240 unique development family identities, three disjoint validation assignments, exact train/evaluation matrices in all24 original jobs, predictions/probability validity, and saved fold macro-F1/Critical recall. Each accessed development dossier matched its original hash and cutoff-known context; the documented teaching rules reproduced all240 existing development labels. This reproduction checks consistency, not independent label correctness.

All302 accessed input/source files were hash-identical after the analysis. The read ledger rejects held-out observation files, combined annotation/provenance files, evaluation directories and model weights. Main/frozen manifests contain file metadata for excluded artifacts; those artifacts were not read. Data, per-case evidence, outputs and models remain ignored. No Firebase, application-source, runtime-profile, stock-balance, production, Git publication or training action occurred.
