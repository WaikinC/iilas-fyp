# Selected visible-condition parcel dataset — 21 October 2026

## Current checkpoint: reviewed data admitted; GPU setup in progress — 21 October 2026

The reviewed development manifest now contains **915 views: 753 TRAIN (385 Normal, 368 Damaged) and 162 VALID (107 Normal, 55 Damaged)**. Independent reconstruction verifies its membership and all 4,148 original dispositions. The review overlay excludes new watermark/quality holds and a cross-partition same-source photo dependency; ten candidates were removed with no replacements or label changes. Component IDs remain conservative dependencies, not verified physical parcel identities. All 102 TEST images remain unextracted.

The new CPU training path has not fitted either model. Two no-update feasibility attempts are preserved as failed. A verified projection bug was corrected; the corrected second probe still projected 3,600.68 seconds against the unchanged 3,000-second fit limit. Its state checks passed, and no validation predictions or new accuracy were produced. Current focused fixtures: 28 intake, 20 review-overlay and 27 runner checks passed; these are software checks.

User-authorised GPU setup is now the next step. MSI has an NVIDIA RTX 3050 Laptop GPU with 4 GiB VRAM and driver 610.78. Current native Windows TensorFlow 2.21 is CPU-only; the supported GPU route is WSL2. Official VS Code WSL, Python and Pylance extensions are installed, and the outer Windows/WSL workspace files include both application and report folders. After the user's manual MSI restart, WSL 3.0.3 and Ubuntu 24.04.5 installed successfully. A separate Linux Python 3.12.3 environment has the pinned TensorFlow 2.21/CUDA dependencies, and pip check passes. An actual bounded GPU:0 matrix/convolution check passed in 9.409 seconds with CPU fallback disabled. Enter-IILAS-GPU.sh supplies verified CUDA library paths for the WSL workspace. The portable data adapter and Linux GPU runner are being implemented/reviewed; no new model fit or accuracy result exists yet. The existing Windows Job wrapper and CPU-forcing runner are not a verified GPU training path. See the outer MSI_SETUP_STATUS.md and Setup-IILAS-GPU.ps1 for bootstrap status. No automatic restart is authorised.

Next: finish WSL setup, verify TensorFlow actually sees the GPU, prepare and verify a separately recorded GPU execution profile, then run the fixed MobileNetV2 experiment and EfficientNet comparison. Keep the 80% target prospective; no new result exists yet. Datasets, model files and diagnostic outputs stay ignored. Photo/live model acceptance remains closed; other AI models and additional features remain deferred.

## Implementation checkpoint

Subsequent recovery: actual `intake-02` passed unchanged caps in 19.879 seconds, peak 81,694,720 bytes (77.91 MiB). Independent metadata reconstruction verifies 4,148 source dispositions, 1,070 dependency components and 925 candidate views: TRAIN 760 (389 Normal/371 Damaged, 702 components), VALID 165 (108 Normal/57 Damaged, 161 components). All 102 TEST rows have no extracted path, decoded hash or perceptual hash. These are candidate counts, not admitted training data or independent physical boxes.

The prospectively fixed 24-image sample rendered successfully with no TEST/model access. Parent observations locked before opening publisher labels; independent inspection supports four additional stock-watermark flags (Vecteezy, Shutterstock and Alamy), two illustration exclusions, one ambiguous view and a same-source crushed-box photo pair crossing TRAIN/VALID at different scales/crops. This is a conservative dependency finding, not byte-exact duplication or physical identity proof. The sample is not an accuracy test or full-dataset label/right certification. Preserve publisher labels, all original dispositions and the frozen candidate. A separate reviewed overlay must apply rights/quality holds and the new dependency without replacement views before training admission. The raw source intake below remains valid; the first failed attempt remains preserved.

The separate [intake](parcel_visible_manifest.py), [training runner](parcel_visible_train.py) and blank [protocol template](protocols/parcel_visible_pilot_v1.json) now exist. Parent verification passes all 51 new artificial fixtures; independent review also passes the 28 intake and 23 runner cases. Shared input/model contract fixtures pass another five checks. These are software checks, not accuracy measurements. The ignored local protocol verifies the two existing official pretrained weight records and four provenance proofs without importing a model.

Actual `intake-01` stopped at the unchanged native preflight: 3,036,299,264 available bytes were below the 3 GiB admission requirement. The wrapper is terminal exit 1; the native receipt has `available_memory`, return code null and no spawned worker. Only its request and failure receipt exist: no new source images were extracted, decoded or admitted. Preserve that attempt. A separately declared `intake-02` may run after measured RAM recovery, under identical source/code/policy/caps; do not resume, overwrite or automatically retry the failed output. The full goal remains active, with no new model result or serving admission.

Next is actual candidate preparation, the fixed prediction-blind 24-image suitability sample, independent membership/disposition review and a separate admitted manifest. Then run the TRAIN-only no-update feasibility probe before either fit. The completed metadata audit below remains valid; image qualification is still pending. Logs, reviews, the sample protocol and local weight-filled protocol stay ignored.

## Decision and scope

Use [project-33xgh / Damaged Box Detection, version 1](https://universe.roboflow.com/project-33xgh/damaged-box-detection/dataset/1) as the next **local development-pilot source**. The user clarified that the immediate task is ordinary packaging judged Normal versus clearly bent or visibly damaged, from a photo or sampled live-camera frame. Outer-shipping-carton appearance is no longer a hard admission requirement. Retail cartons may qualify if their physical packaging is assessable. Hidden contents, hidden faces, damage cause and 3D reconstruction are outside this binary observation.

This is a concrete selection, ending the general source hunt for this step. It is not a declaration that every downloaded label/image is suitable or that the model reaches 80%. Keep Kaputt and its completed experiments as preserved research references; do not merge its exposed diagnostic into an untouched evaluation set.

| Exact exported class folder | IILAS observation |
| --- | --- |
| `undamagedpackages` | Normal: shown packaging is assessable and has no clear qualifying physical damage |
| `damagedpackages` | Damaged: clear visible bending/crushing, torn or punctured cardboard, broken packaging or a visibly collapsed corner/edge |

Printing, intended openings, tape, normal construction folds or a paper label alone do not establish damage. Ambiguous, occluded or irrelevant views receive a separate quality hold/challenge disposition. Preserve publisher labels and separate any reviewer observation; do not automatically relabel an image or keep only reviewer-agreement cases to improve a score.

Still photographs are suitable training inputs for this frame classifier. The same preprocessing and classifier can evaluate JPEGs sampled from a live camera. This does not train a temporal video model or establish camera latency, frame stability, full-face coverage or real live accuracy; those measurements remain required later.

## What was acquired and verified

The parent used the existing MSI browser session and the publisher's **Download dataset → Folder Structure → Download zip to computer** route. No fork, hosted training, account change, paid credit use, code-snippet/API-key display, new terms acceptance or upload occurred.

The completed ZIP is local in MSI Downloads, **143,168,781 bytes**, SHA-256 `b10758ad148b9ad8fc8aac21365da2a62b532af1b9b8441ec0a45366352f9ffc`. This is an independently computed local identity, not a publisher-supplied checksum. A native supervised metadata audit completed with exit zero in 1.057 seconds at 27.87 MiB peak, under 180 seconds/512 MiB. It hashed the archive, checked its directory paths/bounds and read only two bounded READMEs. It extracted/decoded no ZIP images and performed no training or inference.

| Published ZIP partition | Damaged | Normal | Total |
| --- | ---: | ---: | ---: |
| TRAIN | 2,278 | 1,466 | 3,744 |
| VALID | 149 | 153 | 302 |
| TEST | 51 | 51 | 102 |
| Total | 2,478 | 1,670 | 4,148 |

These are generated image-file counts, not distinct photographs or parcels. The version page documents three outputs per training example and ±15° rotation, with orientation processing and stretching to 640 × 640. The current project overview lists 1,683 images; the browser gallery separately displayed 1,667, while reversing the stated training multiplier gives 1,652 preaugmentation examples for that version. Do not equate these different inventories. The downloaded ZIP/hash is the authoritative version for this pilot.

The actual ZIP has 1,261 distinct filename-family hints, including 63 hints occurring in more than one published split and 78 occurring in both classes. Split-local hint counts are 974 TRAIN, 271 VALID and 91 TEST. These are candidate dependency links, not verified exact duplicates or physical identities. Duplicate-looking names, augmented derivatives and related views require encoded/decoded/similarity and source-series checks before split use. An annotation UI group named `Damaged-Box-Detection` is a classification group, not a parcel ID.

## Preview, rights and exposure

The [uploader overview](https://universe.roboflow.com/project-33xgh/damaged-box-detection), version page and downloaded README.dataset declare **CC BY 4.0**. Preserve the source title, uploader, version, URL, licence and change notices. Independent review of the [official platform terms](https://roboflow.com/terms) found public-content reuse/derivative provisions alongside separate scraping, notice-removal and rehosting restrictions. This acquisition used official ZIP export. It is not a blanket rights warranty for every contributed asset.

Public browser previews showed clear crushes/punctures and ordinary intact packaging. Two TRAIN details were inspected: a punctured box labelled Damaged, and `20.jpg`, whose enlarged visible panels were compatible with Normal. No proven label-error claim follows from these examples. A Normal gallery thumbnail visibly bears a Getty watermark; 242 downloaded filenames have iStock/Getty signals. That is a count of flagged generated files, not unique stock assets or proved infringements. Flag those assets and verified derivatives `rights_uncleared_stock` until an upstream permission/basis is documented; do not remove watermarks. Unflagged filenames are not independent proof of ownership either. The source-level CC licence is an affirmative grant, not automatically invalidated for the whole dataset by these flags.

Record the public preview exposure separately from ZIP decoding. TRAIN image IDs `rScgrstZNtmkSKwTJ4sb` and `6ndLI2LxSbhSIFLMWi7c` were opened, along with gallery thumbnails, the cover and version-page previews. Membership of every version-preview image in a published split was not verified. Therefore the publisher's 102 TEST files cannot yet be certified wholly unexposed or independent. Match/exclude preview-linked families before any fresh-holdout claim; no current model has scored them.

The detailed source inventory, README texts, review notes and metadata receipts are local and ignored under `research/datasets/roboflow-box-intake-20261021` and `outputs/parcel-shipping-sources-20261021`. The ZIP remains outside Git. No dataset, image, model, private configuration or output is to be committed/uploaded.

## Why this source and the next action

It supplies the requested binary class names and visibly relevant simple packaging examples. IoT Project's alternative has undocumented remapping of mixed packaging labels; another 137-image source is a four-class detection dataset requiring an unverified image-label conversion. Kaputt remains useful research evidence but its broad item-defect labels have substantial visible-condition uncertainty. The new conveyor-video lead was inaccessible through public retrieval and uses model-generated labels. The closest corrugated-parcel author repository still lacks a verified dataset licence. None is a reason to keep searching indefinitely instead of preparing this selected pilot.

Next: inspect the selected export's TRAIN/VALID image integrity, rights flags, visible-label quality and derivative dependencies; freeze a clean development manifest without silently trusting the published split or inflating augmented counts. Then run the implemented two-fit profile after the required actual feasibility probe in the [MobileNetV2 pilot plan](../docs/superpowers/plans/2026-10-21-visible-parcel-mobilenet-pilot.md). Unknown physical/session identity limits the scope of performance claims, rather than preventing every exploratory development fit. If usable class support is insufficient after this concrete audit, report that result and the exact missing data instead of replacing cases to obtain a desired score.
