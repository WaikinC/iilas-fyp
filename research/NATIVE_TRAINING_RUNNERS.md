# FreshRetailNet and Olist research runners

**Execution update, 20 October 2026:** the first Olist development run completed all 21 fits; validation performance and limitations are recorded in [the execution report](NATIVE_DEVELOPMENT_2026-10-20.md). Preserve `datasets/olist-development-20261020` and do not repeat development. Confirmation remains a separate unexecuted phase. FreshRetailNet still fails its 10 GiB available-memory gate. Statements below about work performed during implementation retain that historical scope.

These commands implement the separate [FreshRetailNet](FRESHRETAILNET_TRAINING_PROTOCOL_2026-10-17.md) and [Olist](OLIST_TRAINING_PROTOCOL_2026-10-17.md) experiments. They do not replace the primary three-class IILAS tasks, activate application inference, or change the earlier 34-fit Backorder/DataCo plan. The protocols retain their historical proposal status; implementation does not invent supervisor approval. Full-source training and confirmation scoring were not performed during implementation.

## Entry points and storage

- `freshretailnet_train.py`: `preflight`, `prepare`, `development`, `confirmation`.
- `olist_train.py`: `prepare`, `develop`, `confirm`.
- `runner_runtime.py`: common native Windows supervision and immutable output helpers.

Run from the MSI app checkout after dot-sourcing the outer `Enter-IILAS.ps1`. Use the existing research Python environment and isolated FreshRetailNet PyArrow reader. No dependency upgrade is needed. The runtime deliberately requires Windows monitoring; it does not silently disable guards on another platform.

All outputs must be fresh, Git-ignored directories below `research/datasets/`. Existing destinations, tracked destinations, path traversal and symlink/junction ancestors are refused. Never place outputs in the application inference-model directory. Raw tables, row identities, features, predictions, models and logs remain local. The runners do not upload, commit or push anything. Stored joblib artifacts are operator-controlled local files; do not load someone else's arbitrary serialized model.

Readiness/preparation commands perform no model fitting:

```powershell
. ..\Enter-IILAS.ps1
$runStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
python research/freshretailnet_train.py preflight
python research/freshretailnet_train.py prepare --output "research/datasets/fresh-prepare-$runStamp"
python research/olist_train.py prepare --output "research/datasets/olist-prepare-$runStamp"
```

Do not run the commands as a batch if a readiness check fails. A preparation command verifies source/cohort contracts; it is not a trained-model result. FreshRetailNet preparation also constructs its feature matrix and needs the full resource gate. Olist preparation reconstructs the cohort and aggregate source/split checks without fitting.

## Later execution

After reviewing the applicable protocol and resource readiness, these are the development entry points. They were not executed on real data in this implementation task:

```powershell
python research/freshretailnet_train.py development --scope-reviewed --output "research/datasets/fresh-development-$runStamp"
python research/olist_train.py develop --output "research/datasets/olist-development-$runStamp"
```

FreshRetailNet's `--scope-reviewed` records actual operator acceptance of its retrospective recorded-event interpretation, not supervisor approval. Olist's explicit development invocation must likewise follow review of its completed-order target and as-of assumptions. Preserve the exact command, protocol, code and environment manifests. A failed or interrupted candidate makes the comparison incomplete. Do not silently change limits, drop a candidate, resample data or resume into an existing destination. Any amended execution needs a new recorded decision; do not remove a claim file to retry the same experiment.

Confirmation is a separate deliberate operation after successful, sealed development. It is not automatically started by development:

```powershell
python research/freshretailnet_train.py confirmation --scope-reviewed --development "research/datasets/fresh-development-$runStamp" --output "research/datasets/fresh-confirmation-$runStamp"
python research/olist_train.py confirm --development "research/datasets/olist-development-$runStamp" --output "research/datasets/olist-confirmation-$runStamp"
```

FreshRetailNet refits only the three locked RF/DT/Dummy choices. Olist reloads the unchanged primary and sensitivity models and performs zero confirmation refits. Source/code/runtime/selection/artifact and outer-completion checks run before confirmation. An exclusive claim prevents repeating confirmation against the same development record merely by choosing a new output directory. All confirmation predictions are saved and hashed before performance reporting. Historical source/partition aggregate exposure remains disclosed; neither confirmation is called untouched prospective evidence.

## Leakage and execution boundaries

FreshRetailNet uses exactly 24 declared features: within-series shifted sales/count lags, preceding-window means/fractions, and target weekday. Current/future outcomes cannot enter a target's features. Development selects only from publisher-train dates. Confirmation uses rolling daily origins with fixed fits and thresholds. The inherited publisher normalization and prior-day availability assumptions remain limitations.

Olist uses exactly four purchase-time variables. Its pipeline learns category/scaling parameters from the fit cohort only. Cancelled/missing outcomes are not assigned an on-time label; known-outcome, maturity, chronology and one-order-grain checks follow the protocol. Sensitivities retain the primary selected settings and thresholds. Customer novelty uses all earlier source purchases, including excluded/unused orders. Snapshot event times remain proxies for historical data availability.

Both use the fixed candidate registry, 202 thresholds for non-Dummy selection, class-label-aware probability extraction, deterministic ties, declared metrics and paired cluster diagnostics. No threshold or candidate choice is updated from confirmation. Software tests use synthetic data and are not FYP accuracy evidence. [Scikit-learn's pipeline/leakage guidance](https://scikit-learn.org/1.8/common_pitfalls.html) supports the train-only transformation boundary.

| Guard | FreshRetailNet | Olist |
| --- | --- | --- |
| Fit budget | 7 development + 3 confirmation | 13 primary + 4 exact-label + 4 chronology; zero confirmation fits |
| Initial/before-fit RAM | 10 GiB available initially; available plus resident runner memory at least 10 GiB before fits | At least 3 GiB currently available before each fit |
| Combined resident-memory ceiling | 8 GiB | 2 GiB |
| Total supervised time | 12 hours, including prior development consumption at confirmation | 90 minutes, including prior development consumption at confirmation |
| Per-fit time | Within remaining total budget | 10 minutes |
| Numerical threads / RF jobs | 2 / 2 | 1 / 1 |
| Output/free-disk guards | 4 GiB combined generated output; 10 GiB free disk | Additional implementation safeguards: 2 GiB output per phase; 1 GiB free disk |

A parent supervisor covers preparation, fitting, prediction and reporting; nested supervisors enforce fit limits. Monitoring normally polls every second and rejects intervals above five seconds. These are sampled operational limits, so detection/termination has sampling latency. Workers start suspended, join a private Windows Job, then resume. Job membership keeps orphan descendants included in RSS and termination. A worker verifies membership in its specifically named supervisor Job; direct internal-worker CLI calls are refused. Job cleanup also stops descendants if the supervisor exits. [Microsoft's working-set documentation](https://learn.microsoft.com/en-us/windows/win32/procthread/process-working-set) describes the memory measure used.

Manifests and results use exclusive file creation and hashes. Final parent seals bind completed phase status, elapsed time and artifacts; changing them causes confirmation refusal. Missing monitoring, resource breaches, incomplete fits, invalid probabilities or convergence failures preserve failure evidence and stop the phase. These controls address accidental misuse and integrity checks; they are not an adversarial operating-system sandbox against an administrator changing code or files.

## Verification and remaining work

The final combined research suite ran 122 tests in 43.285 seconds: 121 passed and one Windows symlink-creation test was skipped because the account lacks that privilege. Full synthetic phase tests replace process dispatch with in-process small fits; they test preparation/selection/reporting/confirmation orchestration. Separate native-process tests verify resource enforcement, Job containment and termination, and Olist's small DT worker exercises its actual supervised fit/artifact path. These forms of evidence are complementary; they do not establish sustained full-data fit feasibility. Independent review found and resolved orphan-descendant RSS accounting and unsealed phase-status/budget issues, plus an unsigned native return-type correction.

Known nonfatal warnings remain: the Python executable-location startup warning, TensorFlow's native-Windows GPU notice, and scikit-learn 1.8's deprecation notice for the protocol's explicit LR penalty parameter. Convergence warnings remain fatal for Olist fits. No package upgrade or protocol parameter change was made to hide these notices.

See the latest research README and handover for the final suite and independent-review evidence. Olist's monitored read-only preparation reproduced 32,245 training, 13,445 validation and 12,842 confirmation orders from the pinned source. FreshRetailNet's actual preparation attempt stopped at its 10 GiB available-memory gate; full-source feature construction remains unexecuted by this runner. Existing independent source/count audits remain preserved.

Before full-data execution, recheck memory, review/freeze the experiment, and retain the run's exact manifest. The primary three-class labels and parcel human approvals remain separate open work. Additional application features and production operations remain deferred.
