# Kaputt crop-only development intake plan

Goal: verify the completed official archive and acquire a bounded, reproducible development cohort with more damaged cardboard examples. This is the next data prerequisite for the full photo/live parcel AI goal. Other AI models remain deferred.

Spec: research/KAPUTT_EXPANSION_ACCESS_2026-10-20.md and the ignored metadata-only cohort-proposal.md / intake-review.md under outputs/kaputt-expansion-20261020. Use subagent-driven development with exclusive new intake source/test files and independent read-only reviews. Existing authorisation covers this research intake; no further download, publication, production change or model activation. Preserve all sealed pilot sources and outputs.

## Task 1: verify acquisition and metadata cohort

- [x] Check final archive length 31,564,000,506 bytes and full SHA-256 de3fe46bac181ec1a369bd957e56d8c6f595669fc3f5c8df42ca12434995ccc1. Keep one original in MSI Downloads.
- [x] Read original licence and exact metadata without held-out image pixels. Independent agent proposes deterministic 600 source-item groups, 1,014 cardboard crops (574 Normal/440 Damaged), excluding all 100 earlier sample item IDs.
- [x] Parent independently reconstructs membership, labels, all eligible group captures, dependency reservations and proposed partition digests. Freeze intake selection before opening new images. Record publisher item identity limitations and research-only use.

## Task 2: bounded stream intake

Files: new research/kaputt_crop_intake.py and research/test_kaputt_crop_intake.py. Never edit bound pilot modules. Interface: extract_selected(archive,destination,selected_paths,expected_sha256,expected_bytes,limits=None) returns a completed receipt only after full verification.

- [x] Observe failing safety/selection tests, implement strict stream parser, then verify green. Validate header checksum, exact Windows-safe crop paths, file/directory type, duplicates, resource bounds, exclusive destination and SHA/length. Reject unsupported extended headers before payload allocation. Check gzip CRC and tar ending. Decode only selected JPEG files, one at a time, using existing OpenCV.
- [x] Production bounds: 150,000 entries, 16 MiB/member, 64 GiB actual expanded stream, 2,000 selected crops, 1 GiB extracted output, 512 MiB process RSS, 20 GiB disk reserve, 1 GiB available-RAM floor, one CPU thread, 1,800 seconds. No cap increases after failure without a recorded reason/review.
- [x] First header is data/test/query-data/crop (directory). Initial 867-path intake failed the existing 64px quality rule; reviewed whole-group withdrawal of the two affected items creates 865 paths for fresh intake02. No replacements, reranking or surviving-partition changes. Leave 147 internal test candidates and all official validation/test images unextracted and undecoded. Skipping compressed contents mechanically is not image inspection.
- [x] Keep incomplete attempts local and explicitly not admitted; never overwrite or silently resume them. A failed archive or selection produces no completed receipt. Failed intake01 preserved; intake02 verified independently.

## Task 3: integration evidence and next experiment

- [x] Verify extracted hashes/decodes, exact allowlist, label/group counts, no held-out paths, and archive header counts against metadata; independent reviewer checks tool and receipt.
- [x] Check ignored status, secret scan and sealed pilot hashes. Update roadmap/handover with actual results and remaining model/application/live gaps.
- [ ] Prepare a separate crop-only experiment schema/protocol later. Existing schema v2 requires full originals and must not be misrepresented; no training or old-pilot retuning in this intake increment.

Intake result: verified865 crops/508 development groups (493Normal/372Damaged),104.568 seconds/144,384,000-byte supervisor peak. All100,267 archive paths match metadata. Twelve crafted tests pass; zero exact cross-item or old-sample duplicates. Remaining pre-fit gate:188 coarse similarity pairs(56crosspartition) and20oldsample candidates need conservative dependency review. No training admitted; full goal remains active. Secret checks pass186tracked/294nonignored/246history; six sealed source modules plus manifest/protocol unchanged.

Review focus: false completion on partial gzip; long/special tar headers; path/case aliases; including non-cardboard siblings or prior sample IDs; decoding internal/official holdouts; cohort changes after inspecting outcomes; claiming source IDs prove physical-parcel identity.
