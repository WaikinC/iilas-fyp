# Local parcel photo and camera test

Readiness: **local software integration verified on MSI, 22 October 2026**. A real registered validation photo passed through the browser, Firebase Functions and the frozen MobileNetV2, saved/rendered Normal and retained its experimental marker after review/reload. The first measured click-to-result time was 12.927 seconds (model processing 368.4 ms; service total 11.694 seconds). This single exposed validation photo is a functional check, not a new accuracy estimate. Physical-camera testing is deferred at the user's request.

The sampled-live backend path also passed one real frozen-model request using that saved public image as an explicitly simulated frame. Session start/reservation, inference, retained-byte integrity, replay, explicit stop and historical resolution passed through real Firebase callables. The observed inference callable took11.742seconds (service10.980seconds; model346.6ms). No physical camera, camera freshness or independent accuracy was tested. The temporary staff/shipment/frame/object were removed and the dedicated handoff shipment remains unchanged.

The local app is `http://127.0.0.1:5173`. Sign in normally with an existing local emulator account and select **LOCAL-PARCEL-CAMERA-539139D3** under Warehouse Operations → **Prepared shipment for evidence**. This is one explicitly synthetic local test shipment with no products, stock reservations or warehouse handover. No account or password was created or reset for the handoff. Existing inventory and balances are unchanged. Do not dispatch this test shipment.

Use the MSI browser at `http://127.0.0.1:5173`. Keep the test in the local Firebase emulators. Use the dedicated disposable Prepared test shipment supplied at handoff, rather than changing an existing shipment or inventory balance. The trained model and all test images stay local and out of GitHub.

## Photo

1. Open **Warehouse Operations**, then select the dedicated test shipment under **Prepared shipment for evidence**.
2. Select a clear parcel image, inspect its preview, and choose **Upload evidence**. Uploading alone does not run AI.
3. Select **Request analysis** beside the registered parcel photo. Wait for its saved result; use **Check outcome** if a connection is interrupted instead of submitting replacement work repeatedly.
4. Check the Normal/Damaged label, image identity, model provenance and processing time. The result must remain marked **Local experimental observation · No operational acceptance**.
5. An authorised reviewer can record whether the observation matches the visible packaging. Accepting an observation does not approve the model, change stock, dispatch a shipment or create an operational damage alert.

## Camera

The user must deliberately open the camera and start analysis. No background camera or unattended device test is authorised.

1. Keep one cardboard parcel clearly visible, well lit and large enough in the frame. Avoid showing unrelated parcels or obscuring the damaged area with your hand.
2. Select **Open live camera**, allow the browser permission, and inspect the preview before selecting **Start live analysis**.
3. Hold the box steady. The app samples individual frames, with one request in flight and at least five seconds between attempts. It does not analyse every video frame.
4. Rotate the box slowly to show another face if useful. Each result describes its recorded visible view; the app does not reconstruct a 3D box or combine all faces into a proven whole-parcel decision.
5. A Current result must satisfy the existing freshness rule. Historical means the recorded frame is older or the session has stopped; it must not be presented as the current scene. Initial model startup can take longer than later frames.
6. Select Stop when finished. The existing session limits remain120seconds and12attempts. Review retained frames individually; do not start a replacement session automatically after an interruption.

## What to record

For an initial functional check, use an intact empty box and, if available, an already visibly damaged empty box. Do not damage a parcel just to create a test. Before looking at the prediction, note the visible condition as Normal, Damaged or Uncertain, and give each physical box one anonymous box ID. Keep different views of that box together.

Record the saved image/frame ID, box ID/view, expected visible condition, predicted label, whether the damage was actually visible, timing/freshness and review notes. A small pilot checks operation and reveals failure cases; it does not establish final accuracy. Repeated frames of the same box are not independent parcels, and this collection is not automatically training or accepted evaluation data.

## Limits

- This is a binary visible-packaging classifier, not a reliable parcel-presence detector. A background-only or irrelevant image can still receive a confident label.
- It cannot establish internal contents, damage on hidden faces, tampering, structural strength or damage outside the frame. It does not locate a damaged region with a bounding box.
- Scores are uncalibrated. The source benchmark is not a promise of the same accuracy on the MSI camera, another camera, different packaging or different lighting.
- Human review concerns that image only. Experimental observations remain excluded from operational alerts and verification candidates after review and reload.
- An interrupted request may need the existing recovery controls. Cleanup may close only the original eligible claim; it must never start a new capture or inference automatically.

The current implementation and authority contract is [PARCEL_LOCAL_EVALUATION_2026-10-22.md](PARCEL_LOCAL_EVALUATION_2026-10-22.md). Other AI models and additional features remain deferred.
