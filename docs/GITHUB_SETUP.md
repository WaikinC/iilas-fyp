# GitHub source repository — 17 October 2026

The combined final-year project source is published at [WaikinC/iilas-fyp](https://github.com/WaikinC/iilas-fyp) as a public repository. It includes the React application, trusted Firebase backend and rules, Python research workflows, Solidity contracts, scenario scripts and current requirements/roadmap/contracts. Existing Git history is retained.

## Clone and run locally

Use Node.js 22, npm and a supported Java installation for the Firebase emulators. Use the Python environment described in `research/README.md` for research work.

```powershell
git clone https://github.com/WaikinC/iilas-fyp.git
cd iilas-fyp
npm ci
npm run functions:install
Copy-Item backend/functions/.env.example backend/functions/.env.local
npm run functions:prepare
npm run emulators
```

Copy the example only when `.env.local` does not already exist. Existing contributors retain their private configuration. In a second terminal run `npm run dev` and open its printed localhost URL. Localhost uses the Firebase emulators. The configured bootstrap Admin email matches the existing emulator test contract; a production sign-in still requires the genuine Firebase account and verification.

Public `firebase-config.json` identifies the existing FYP Firebase project. Cloning the repository does not grant its Firebase Console access, sign anyone into its data, create approved staff accounts, or deploy the application. Use local emulators for development. Creating another Firebase installation requires its own project/configuration and a reviewed setup; preserve the chosen Admin and existing IDs/balances for this installation.

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

Anyone can clone the public repository. The owner must grant a partner's actual GitHub account collaborator access before they can push. Repository access and IILAS application roles are separate; approved staff still use their own Firebase Authentication accounts. No collaborator invitation is sent by this setup.

For feature work create a `codex/` branch, commit the relevant changes and push it for review. Do not force-push shared history or commit ignored runtime files. Existing vendor licences remain; this setup does not assign a new licence to the students' work.

Private `.env` files, credentials, test outputs/screenshots/accounts, emulator exports, installed dependencies, trained models and private research data are excluded. `.env.example` has public example configuration only; CSV templates contain headers only. The scripted local passwords are disposable emulator fixtures, not production accounts. Historical source material and the saved skill archive remain in the separate project-context workspace.

## Publication checks

On 17 October 2026 the existing application build and lint passed (four existing image warnings; the existing bundle-size advisory remains). Tracked/unignored source and the original commit history were checked for recognised credential patterns before publication. Staged paths exclude private environment files, service-account keys, local data, dependencies and generated artefacts. No Firebase production deployment or application/database behaviour change is part of this repository setup.
