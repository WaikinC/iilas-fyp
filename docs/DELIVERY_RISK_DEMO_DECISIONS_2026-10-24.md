# Delivery demo implementation decisions — completed 25 October 2026

Ruling: keep the existing dirty checkout and scoped neutral snapshots without commits — existing no-publication/workspace preference — rollback relies on the retained snapshots rather than Git commits.

Ruling: perform the single final source review before immutable cutover — avoids repeated metadata binding after fixes — parent must certify remaining runtime/state/docs gates, since source review alone is not acceptance.

Ruling: reuse the existing confirmed native supervisor with fixed inference execution ID inside separate per-phase/per-candidate directories — frozen training-specific supervisor rejects delivery candidate IDs, and its source must stay unchanged — candidate identity remains bound by job/receipt/phase hashes; a mistaken mapping could misattribute a fit. Whole-phase cap1800s, each nested candidate120s.

Final: Ruling: actual cutover/state/live parity and stock/parcel compatibility were outside source review — parent retains Task7/8 runtime acceptance gates — source review cannot substitute for live verification.

Final: Ruling: final guides/traceability/screenshots/privacy gates were outside source review — parent retains Task8 certification — incomplete documentation or disclosure could mislead a demonstrator if missed.

Final: Ruling: independent real-delivery accuracy was outside the approved simulated-policy demonstration — retain explicit synthetic-policy provenance — measured agreement cannot establish genuine delivery forecasting.

Final: Ruling: preserve the pre-existing generic prediction form and legacy inline abnormality implementation — only signpost the new separate demonstration and retain historical compatibility — staff could choose the old unavailable route.

Final: Ruling: unrelated existing dirty changes remain outside this scoped review — preserve the pre-edit checkout — they are not certified by this delivery review.

Final: minor (deferred): none raised.

Task8: Ruling: verify unchanged product/warehouse/transport/dispatch steps through trusted callable commands and original shared regressions, with real browser testing focused on the new analysis/review/recovery UI — reuses existing workflow coverage and avoids duplicating unrelated browser scripts — the complete cross-module UI sequence is not newly replayed end-to-end by this delivery trial.

Task8: Ruling: retain ignored Native snapshots/ledger because the user authorised no commits or publication — preserves recoverability in this dirty checkout — ignored evidence must be copied separately if the workspace is discarded.

Final: minor (deferred): current context hour values display many decimal places; formatting polish is deferred.

Final: minor (deferred): pagination buttons could use more spacing; controls remain labelled and mobile does not overflow.

Task8: Ruling: move only the procurement test fixture's expected date two days ahead — keep the intended completed-order locking test stable across midnight without changing application date validation — this fixture no longer exercises same-day purchasing (separate validators retain date checks). Retain failed attempt01 and rerun only the affected suite plus final baseline verify.

All eight Native task gates are complete. Final receipt: outputs/delivery-ai-20261024/completion.json (ignored). The source reviewer raised no Minor findings; the parent deferred the two formatting/spacing items above. No commit, push, merge or deployment occurred.
