# Offline inventory simulation pilot

Date: 23 October 2026. Scope: the first generator/validator stage of the [report-aligned protocol](INVENTORY_SIMULATION_AND_LABELLING_2026-10-23.md), authorised by the user. Native implementation; no model fitting or application integration.

## What this provides

`inventory_simulation.py` creates 60 fictional independent product-family cases with complete event histories, calculated six-feature observations, cutoff-known planning dossiers, blank review templates and a local HTML review index. It keeps intended sampling regimes in a separate design file, never in the six model inputs or suggested human labels. The page does not save answers. The packet is for pilot review, not training or held-out evaluation.

The validator replays events, checks protected bin/aggregate balances, inclusive 30-day windows, event/receipt/correction lineage, complete simulated coverage, provenance, identities, deterministic generator reproduction, source/report pins and packet checksums. It refuses duplicate ancestry across claimed families, invented unknown-history values, future inputs, modified frozen packets, existing output destinations, unignored/tracked paths and links/junctions.

The source report's SHA-256 is checked against the preserved original. Simulation accounting is compared in tests with `lib/locationStock.js` and `lib/inventoryRisk.js`; real history remains Unverified and no eligibility flags, stock records or Firebase data are changed.

## Commands on MSI

Run from `iilas-fyp`, dot-source the workspace toolchain, and use the selected research interpreter. No Kaggle download, API token, GPU, WSL or dependency installation is needed.

```powershell
. ../Enter-IILAS.ps1
& C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe -m unittest discover -s research -p test_inventory_simulation.py
& C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe research/inventory_simulation.py generate --output research/datasets/inventory-simulation-v1/pilot-01 --seed 42
& C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe research/inventory_simulation.py audit --output research/datasets/inventory-simulation-v1/pilot-01
```

Generation is exclusive: a second invocation with the same destination must refuse. Use `audit` for an existing packet; do not delete or overwrite it. Once pilot-01 is generated, the generation command above is historical reproduction guidance, not a rerun instruction. Tests use disposable software fixtures; their cases are not the review cohort.

The CLI prints only aggregate status and a local path. `PASS` means this original pilot packet passes software/data-structure checks. It does not certify human labels, family independence beyond recorded/generated ancestry, model accuracy or real stock-risk validity. The native training resource limits in the protocol apply to later fitting; this stdlib-only generator builds a capped 60-case packet with at most 100 MiB of output and no ML workers.

## Review without leaking intended labels

1. Open `research/datasets/inventory-simulation-v1/pilot-01/review.html` locally. Select any case to see stock facts, six features, complete history and planning context known at the review cutoff.
2. Read the rubric in the protocol. Judge Normal, Reorder Risk, Critical Stock Risk or Unresolved from evidence, not stock quantity alone. Record likely fulfilment impact for Critical. Do not inspect `sealed-design.json` before review; local files provide procedural blinding, not access control.
3. Copy `reviews-template.csv` to a new path in an ignored local review folder. Fill your pseudonymous reviewer ID, decision, reason, evidence refs, any impact, timezone-bearing review time and a unique revision ID. Keep originals immutable. A second reviewer uses a separate fresh copy without seeing the first reviewer's decisions.
4. Leave observation labels and split assignments blank. The initial packet audit intentionally rejects editing its frozen dossiers, rows, design or template, even if checksums are rewritten. Human review import/adjudication and agreement analysis are subsequent work; they are not implemented or claimed by this generator.

Cases with the same six inputs but different relevant context must not be discarded to inflate scores. Report that limitation and leave unclear cases unresolved. No automatic label is generated from the planned scenario regime or rule threshold.

## Data and Git boundary

Every generated ledger, case, CSV row, design file, review copy and later model/prediction stays beneath ignored `research/datasets/inventory-simulation-v1/`. Do not force-add them. Preserve the separate operational snapshot workflow and existing public benchmarks. Only generator/tests and prose documentation are candidates for a later code-only publication; nothing is committed or pushed by this task.

## Next stage

Review the pilot before changing the generator or creating main data. Review feedback may require a new generator/protocol version and a fresh destination; source-pinned old packets stay preserved. Only then qualify the main cohort, freeze groups/splits and implement the bounded RF/DT runner. Parcel camera, delivery AI and additional features remain deferred.

## Local verification evidence

The original `pilot-01` packet contains 60 families/60 observations, 127 files and 1,666,847 bytes; audit reports zero reviewed labels, no split/model and training eligibility false. The same destination refuses regeneration. Eighteen focused checks pass, including canonical JavaScript accounting comparison and adversarial tests for rehashed false HTML, renamed dossier evidence references and event-ID-renamed copied histories. Independent review identified those three audit/coverage issues; one fix pass and RED-to-GREEN regression evidence are retained. This is not a claim that the reviewer independently approved the final fixes or that humans reviewed the cases.

Headless Edge checks the 60 case links, dossier navigation and 320px layout with no page errors, horizontal overflow, external requests or camera. Build passes; lint has zero errors and six existing image warnings. Original failures, review findings, broader-suite logs, screenshots, data/source/Git checks and final status live in ignored `outputs/inventory-simulation-pilot-20261023/`. Refer to its final report for any broader regression qualification; a focused pass alone is not a claim that every existing research module passes.

The broader isolated research run completed all 48 files with zero failed modules and its existing optional skips. That run exercised the initial 15-check simulator version before the review fixes; the final simulator file was separately rerun with all 18 checks after the fixes and before pilot generation. Other existing research code was unchanged. No consumed scientific test cohort was replayed and no research training experiment was launched; existing unit tests may fit disposable synthetic software fixtures.
