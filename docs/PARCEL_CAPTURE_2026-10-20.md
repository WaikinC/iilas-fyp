# Parcel evidence capture foundation — 20 October 2026

This implements the acquisition part of the photo/live-camera report scope in the existing Delivery Monitoring evidence uploader. It does not complete FR-7 stage linkage, FR-10 classification or the report's repeated sampled-frame analysis. See [original scope and source locations](PARCEL_CAMERA_SCOPE_2026-10-20.md).

## Staff workflow

An authorised user opens an existing dispatched shipment, selects Parcel Image, then chooses a JPG/PNG/WebP or explicitly starts the camera. Capture creates one JPEG for review. The user can discard it or explicitly upload it through the existing evidence service. No photo or camera frame is uploaded during preview, and no condition prediction is produced. The interface states that AI analysis is unavailable and that a photo only shows visible parcel faces.

Proof of Delivery continues to accept images and PDF. Parcel Image requires an image. Files must be non-empty and at most 10 MiB; images must decode and contain at most 24 million pixels before upload is enabled. Camera capture preserves aspect ratio and caps the long edge at 1,920 pixels without upscaling. These are client resource/quality controls, not a replacement for existing trusted evidence validation.

## Implementation and boundaries

- `EvidenceUpload.tsx` retains the Storage path, actor metadata, explicit `registerEvidence` command and existing evidence display. The composer is keyed by shipment ID and unmounted when access is removed.
- `ParcelCamera.tsx` requests video only, with a preferred rear-facing camera. It handles permission denial, missing/busy devices, camera-ended events, page hiding and late permission grants. Capture, close, shipment change, access loss and unmount release tracks. Closing the preview returns to file selection.
- `parcelCapture.ts` isolates camera ownership, stale-stream invalidation, file checks and capture dimensions. Object URLs are revoked when replaced or on unmount.
- No schema, security-rule, model-service or prediction-status contract changes. The existing upload-then-register partial-failure behaviour remains; orphan-file reconciliation is not introduced here.

Use a supported browser on HTTPS or localhost. Local emulator tests must use literal `http://127.0.0.1:5173` or `http://localhost:5173`. A physical camera was not accessed in automation.

## Verification evidence

`npm.cmd run test:parcel-capture`: five focused tests pass, including late/stale media ownership, file rejection and bounded dimensions.

Playwright/Edge checked the actual component in React StrictMode with synthetic camera frames: capture/review, explicit-upload boundary, denial and missing-camera fallbacks, close, shipment change, access loss, module unmount, simulated device-ended/pagehide events, delayed permission grants, invalid image bytes, rejected parcel PDF, valid file selection and a 390-pixel layout. Fifteen browser checks passed with no page errors. Preview/file selection caused no Storage or command writes. Desktop and mobile screenshots were inspected.

A separate actual-application test signed in with a disposable local-emulator Admin, opened an existing dispatched fixture, captured/reviewed a synthetic frame and explicitly uploaded it. The evidence entry and SHA-256 appeared. External network requests were blocked during this test. Browser scripts, synthetic images, screenshots, result JSON and disposable sign-in data remain ignored under `output/playwright/parcel-capture-20261020/`.

Build passed. Lint passed with five native-image warnings, including the intentional local blob preview. Original smoke, original QA (including warehouse) and shared-system emulator suites passed sequentially. A subsequent shared-suite run exposed an existing dispatch transaction-retry defect; the [minimal correction and deterministic regression](DISPATCH_RETRY_2026-10-20.md) preserve the Prepared-Shipment contract. The initial browser fixture also required correcting a stylesheet import and moving browser/server execution outside the Windows sandbox; final browser checks passed.

An independent review found no actionable defects in the five capture implementation/test files. Synthetic camera results establish software behaviour only, not parcel model accuracy or real-device reliability.

After the retry fix, the original smoke, original QA/warehouse and shared-system suites were rerun sequentially and passed, including concurrent dispatch and the three-product browser-fixture branch. The deterministic retry regression passed all four tests. Expected permission-denial logs came from negative access tests.

## Remaining core work

1. Test camera permission, orientation, capture quality and interruption recovery with a physical MSI/phone camera. File selection remains the fallback.
2. Finish visible human review and physical-family confirmation for public parcel data, especially independent damaged boxes. N04/N06 remain human Normal; the other 22 new TAMPAR conditions remain pending. No approvals or training eligibility are inferred from continuation messages.
3. Resolve exact pretrained-weight evidence, freeze an eligible grouped cohort/protocol, then train and evaluate MobileNetV2 with EfficientNetB0 comparison. Keep PackageDamage's frozen baseline unchanged.
4. Integrate traceable, authorised photo inference with explicit unavailable/uncertain handling, stage/model/time links and human review.
5. Implement bounded repeated sampling, session/frame identity, backpressure, stale-result rejection and measured live-session quality/latency. Manual capture here is only a foundation for that work.

Other AI models and additional features remain deferred. No datasets/models were added to Git, no production changes were made, and no commit, push or deployment was performed.
