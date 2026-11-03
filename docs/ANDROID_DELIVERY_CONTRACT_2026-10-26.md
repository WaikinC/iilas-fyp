# Android delivery contract — 26 October 2026

This is the approved React/Capacitor Android **Driver** extension for the local FYP demonstration. Existing staff and Customer web interfaces retain their roles. Parcel evaluation remains paused. Physical phone acceptance is pending at the user's request; software tests do not establish actual GPS or native SDK behaviour.

## Authority and data

The native Firebase SDK owns sign-in. A same-UID custom token mirrors that account into the isolated web Auth instance; tokens remain in memory during handoff and never enter command receipts. Current server-derived scope and approved Driver role govern new actions. Approved staff with a changed role can recover exact saved outcomes, without accessing a Driver assignment list. Pending/revoked accounts cannot gain staff access. No client supplies actor, scope, assignment authority, SQL or arbitrary file paths.

Only named native bridge methods expose bounded assignment pages, details, queue summaries and tracking state. A separate mobile entry avoids mounting staff subscriptions. Read-only cached data remains labelled with its last verification time; server authority is checked again on writes and tracking admission/renewal. Offline cached access cannot establish that a role is still approved.

## Durable commands and proof

Each command freezes UUIDv4/action/UTF-8 payloadJson and its SHA-256. Room/SQLite stores immutable bytes, dependencies and original-account partition. Delivery updates retain delivery, shipment and assignment versions; no automatic conflict rebase occurs. A queued status is distinct from confirmed status. Delivered depends on the original proof finalisation. Server business writes and matching receipts commit atomically; same-ID replay recovers one result. An explicit unknown-outcome check can create a cancellation fence. Definitively refused/unsent work may be dismissed after its dependants; uncertain work must be checked first.

The ordinary Android file picker copies an existing PDF/JPEG/PNG/WebP into app-private storage before queueing. An opaque file ID reaches React, never a URI/path. Native upload refuses a different object at the reserved path. Server finalisation checks actual bounded bytes, MIME, hash and generation before registration. The copied file is removed only after matching confirmed registration or explicit safe local discard. Abandoned remote uploads are retained for explicit review; no arbitrary remote-object deletion permission is granted.

## Location lifecycle

Start requires a visible resumed app, location permission, notification permission on applicable Android versions, current online Driver authority and a server lease. A visible foreground service and Stop notification remain available. Target admission interval is20seconds when Android supplies valid fixes. The offline lease is30minutes, renewed online about every5minutes, with a4hour absolute ceiling. Request latency is subtracted from monotonic deadlines. Reboot, expired lease, clock anomaly, permission/provider loss, access failure or storage exhaustion stops capture. No boot receiver or implicit GPS restart exists. Stop/sign-out signals local sensors before queued network work. Fresh Start is deliberate.

Server capture time and receipt time are distinct. Older authorised samples may enter bounded history without replacing a newer manual/native latest point. Assignment/session/version checks and strict sequence/time bounds fence stale data. Customer grants still control access to the limited latest-point projection; no tracking session or actor history is exposed.

## Limits

Pages20; pending business actions200; pending GPS points2000; copied files10, each at most10MiB; logical managed content cap120MiB across accounts, including quarantined work. SQLite/WAL filesystem overhead is additional. No pending data is evicted to free space. Eligible confirmed/discarded history can be pruned after7days, while referenced dependencies, active admission and retained files remain protected. Automatic transient retry is bounded to8attempts with WorkManager connectivity/backoff; conflicts/authority failures require review. Account switches never transfer pending actions or private files.

Local debug only: project fyp-inventory-and-logistics; USB-reversed127.0.0.1 ports5001/8081/9099/9199. The APK contains synthetic emulator identifiers and no transferred private Firebase key, model weights, wallet keys or datasets. Release tasks are refused. Model inference remains on MSI. Debug cleartext/mixed-content permission is restricted by the local network policy; device verification remains pending.

See [local guide](ANDROID_LOCAL_GUIDE_2026-10-26.md) and [acceptance record](ANDROID_ACCEPTANCE_2026-10-26.md).
