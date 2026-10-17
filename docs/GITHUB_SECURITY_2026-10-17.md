# Private repository and credential review — 17 October 2026

## Outcome and scope

The user requested private visibility and no exposed credentials in Git, explicitly including the Google/Firebase web API key. GitHub confirmed `WaikinC/iilas-fyp` is private. The live Firebase configuration appeared in both earlier commits. The entire `firebase-config.json` path was purged from reachable history using git-filter-repo 2.47.0, rather than merely deleted in a new commit. Original working configuration is retained in an ignored local file; a blank example is tracked. Application IDs, balances, data ownership, database rules and the hosted release are unchanged.

This is a repository credential review, not a complete application penetration test. The recognised-pattern scan found the Firebase browser key; no additional production private keys, service-account JSON, GitHub tokens or assigned server credentials were identified in the reviewed reachable Git objects. Disposable emulator passwords remain explicitly restricted to their existing test fixtures. Values are omitted from this document and scan diagnostics.

## Findings and controls

| ID | Finding | Action |
|---|---|---|
| GH-01 | Repository initially had public visibility | Changed to private and verified through GitHub |
| GH-02 | Live Firebase web API key in a tracked configuration and its earlier versions | Removed that path from every rewritten reachable commit; retained local ignored configuration; added a blank example |
| GH-03 | Ignore patterns alone did not stop forced adds or leaks in innocuously named source files | Added redacted pattern/path scanning and versioned pre-commit/pre-push hooks; pre-push checks all reachable history |
| GH-04 | Firebase browser configuration remains observable in the running web app | Documented the boundary; actual server tokens/private credentials must never enter browser code |
| GH-05 | Google key API allowlist is broad and HTTP-referrer restrictions are empty | Reviewed metadata using the current Firebase CLI account; no live key restrictions were changed or key deleted by this repository task |

The Google project has one Firebase-created Browser key. Its metadata lists an API allowlist of 27 services, including Identity Toolkit, Token Service, Firestore and Firebase Storage, as well as unused services such as Cloud SQL Admin and Firebase AI/Vertex services. Its browser-referrer restrictions are empty. This verifies that API restrictions exist; it does **not** establish least-privilege restrictions or mean that the key is secret. Review a smaller service allowlist and intended production/development referrers in [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials?project=fyp-inventory-and-logistics) before changing the running site's key settings. Preserve the APIs required for this app's Authentication/Firestore/Storage flows and test sign-in/token refresh/data/evidence access afterwards.

[Firebase's key guidance](https://firebase.google.com/docs/projects/api-keys) explains that Firebase keys identify a project rather than authorise database access, and that only appropriately restricted Firebase-service keys are safe to expose. Non-Firebase/billable-service keys need separate restrictions. This task removes the live value from Git as requested; it does not conceal it in the deployed JavaScript, rotate it, deploy a replacement, or establish App Check enforcement.

## Prevention and local configuration

Copy `firebase-config.example.json` to `firebase-config.json` and configure it locally. Existing files are preserved by `scripts/prepare-firebase-config.mjs`; missing files become blank, not a guessed production configuration. The build/dev lifecycle calls this preparation. A blank configuration builds but leaves sign-in unavailable until the owner configures it.

Run `npm run security:install-hooks` once in each clone. Pre-commit scans staged Git objects, even if the working copy has since been sanitised. Pre-push scans every reachable local Git blob and private path, including secrets deleted only at the tip. Rules cover Google keys, common GitHub/Slack/AWS tokens, private keys, service-account declarations, credential URLs, assigned token/password values and private file paths. Findings contain paths/rule names and redact values. Seven guard integration scenarios cover safe examples, force-added ignored files, renamed files, staged-versus-working contents, sanitised-tip history, trailing-hyphen Google keys and diagnostic redaction. Three configuration checks cover blank-file creation, preserving existing configuration and redacted invalid-JSON failures.

`npm run security:scan` reviews tracked working files; `npm run security:history` reviews reachable Git history. These are known-pattern checks, not a guarantee against arbitrary/encoded/novel secrets. Hooks require installation, can be bypassed, and do not enforce remote branch policy. Do not force-add ignored files or commit credential-bearing files under another name.

## History replacement and residual exposure

The history replacement uses an exact expected remote commit with force-with-lease, so an intervening remote change is not silently overwritten. Existing clones should be replaced with a fresh authorised clone; do not merge the old commits back. Local pre-cleanup recovery material is ignored and must never be uploaded.

Making a repository private and rewriting its current refs cannot erase copies obtained while it was public or guarantee deletion of GitHub's cached/unreachable objects. [GitHub's removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) describes that limitation and the support process for sensitive cached data. If any genuine server credential is later found in a prior copy, revoke/rotate it at its provider as well as removing it from Git. No passwords, service-account credentials or private key values should be added to an issue or support request.

## Verification

Verification includes private-repository metadata, rewritten reachable history, retained local configuration, seven guard and three configuration integration scenarios, staged/history scans, build and lint, and a fresh clone of the updated remote. The final result is recorded after push and clone verification. Historical application/emulator/browser evidence retains its original dates; no database or production deployment is part of this task.
