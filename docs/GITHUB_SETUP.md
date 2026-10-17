# GitHub source repository — 17 October 2026

The combined final-year project source is published at [WaikinC/iilas-fyp](https://github.com/WaikinC/iilas-fyp) as a private repository. It includes the React application, trusted Firebase backend and rules, Python research workflows, Solidity contracts, scenario scripts and current requirements/roadmap/contracts. Earlier commits were rewritten to remove the live Firebase configuration from every reachable commit. Existing clones should be replaced with a fresh clone; do not merge the old history back.

The repository root is the working application's root, not the separate report/skills archive. See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for the folder map and why dependencies, empty folders, private configuration and generated outputs are absent on GitHub. Development and builds use the standard React `vite.config.ts`; obsolete OpenAI/Cloudflare preview scaffolding is removed.

## Clone and run locally

Use Node.js 22, npm and a supported Java installation for the Firebase emulators. Use the Python environment described in `research/README.md` for research work.

```powershell
git clone https://github.com/WaikinC/iilas-fyp.git
cd iilas-fyp
Copy-Item firebase-config.example.json firebase-config.json
npm ci
npm run security:install-hooks
npm run functions:install
Copy-Item backend/functions/.env.example backend/functions/.env.local
npm run functions:prepare
npm run emulators
```

Copy examples only when the corresponding local file does not already exist. Fill the ignored `firebase-config.json` with this Firebase web app's configuration from the Firebase Console before signing in; a blank example builds but leaves access unconfigured. Existing contributors retain their private configuration. In a second terminal run `npm run dev` and open its printed localhost URL. Localhost uses the Firebase emulators. The configured bootstrap Admin email matches the existing emulator test contract; a production sign-in still requires the genuine Firebase account and verification.

The ignored local `firebase-config.json` identifies the existing FYP Firebase project. Live API key values are excluded from source and history; only a blank example is tracked. Cloning the repository does not grant its Firebase Console access, sign anyone into its data, create approved staff accounts, or deploy the application. Use local emulators for development. Creating another Firebase installation requires its own project/configuration and a reviewed setup; preserve the chosen Admin and existing IDs/balances for this installation.

## Verification

```powershell
npm run build
npm run lint
npm run test:location-stock
npm run test:input-validation
npm run test:procurement-validation
npm run test:stock-client
npm run test:dashboard
npm run test:delivery-signals
npm run test:blockchain
```

With the matching emulators already running, use `node scripts/smoke-firestore.mjs`, `node scripts/qa-review.mjs` and the affected account/shared/procurement/stock/capacity scripts. Do not start overlapping emulator suites on the same ports. The README and dated contracts record previous integration/browser evidence and remaining features. Publishing source is not a new deployment or final research acceptance.

## Work with a partner

Only the owner and explicitly granted collaborators can clone the private repository. The owner must grant a partner's actual GitHub account collaborator access before they can push. Repository access and IILAS application roles are separate; approved staff still use their own Firebase Authentication accounts. No collaborator invitation is sent by this setup.

For feature work create a `codex/` branch, commit the relevant changes and push it for review. Do not force-push shared history or commit ignored runtime files. Existing vendor licences remain; this setup does not assign a new licence to the students' work.

Private `.env` files, credentials, test outputs/screenshots/accounts, emulator exports, installed dependencies, trained models and private research data are excluded. `.env.example` has public example configuration only; CSV templates contain headers only. The scripted local passwords are disposable emulator fixtures, not production accounts. Historical source material and the saved skill archive remain in the separate project-context workspace.

## Original publication checks (superseded for visibility/history)

On 17 October 2026 the existing application build and lint passed (four existing image warnings; the existing bundle-size advisory remains). Tracked/unignored source and the original commit history were checked for recognised credential patterns before publication. Staged paths exclude private environment files, service-account keys, local data, dependencies and generated artefacts. No Firebase production deployment or application/database behaviour change is part of this repository setup.

## Private-source correction — 17 October 2026

The repository is now private. The live Firebase configuration was removed from both original commits, not just deleted at the tip. Local commit and push hooks reject recognised key/token patterns, forced tracking of private configuration and credentials, and leaks remaining in old reachable commits. Enable them in every clone; they do not provide universal secret detection and do not replace Google/Firebase access controls. See [GITHUB_SECURITY_2026-10-17.md](GITHUB_SECURITY_2026-10-17.md) for the review, checks and residual public-exposure limits.
