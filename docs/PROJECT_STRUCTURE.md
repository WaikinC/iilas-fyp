# IILAS project structure

The executable project is `C:/Users/choon/Documents/FYP/FYP`. Its tracked application files are published at `WaikinC/iilas-fyp`. GitHub starts at the contents of that folder; it does not add another `FYP` wrapper directory.

`C:/Users/choon/Documents/ChatGPT/fyp cwk 2` is a separate documentation archive containing saved reports, source links, skill packages and Markdown snapshots. It is not another application checkout, so its top-level folders differ from the application repository.

## Application folders

```text
iilas-fyp/
├── app/                  Main application screens, dashboard and shared styles
├── src/
│   ├── main.tsx          Browser entry point
│   ├── components/       Shared forms, pagination and dialog behaviour
│   └── features/         Stock, warehouse, purchasing, delivery and staff access
├── components/ui/        Reusable UI components
├── hooks/                Shared React hooks
├── lib/                  Firebase access, validation and business helpers
├── backend/functions/    Trusted Firebase commands and backend dependencies
├── blockchain/           Solidity contracts, deployment and contract tests
├── research/             Python training, inference and evaluation workflows
├── public/               Static browser assets
├── scripts/              Setup, validation, security and scenario checks
├── docs/                 Data contracts, setup and dated verification records
├── vendor/               Retained third-party styles and licence notices
├── .githooks/            Commit and push credential checks
├── index.html            Browser page metadata and application mount
├── vite.config.ts        Active React/Vite build and development configuration
├── firebase.json         Firebase hosting, backend and emulator configuration
├── firestore.rules       Firestore access policy
├── storage.rules         Evidence storage access policy
├── firebase-config.example.json
├── package.json
└── README.md             Application features and user instructions
```

The `app/` and `src/features/` split is the existing application's layout. Screens remain at their original import paths. Removing obsolete hosting files does not relocate operational modules, alter stored IDs or change the warehouse-to-dispatch contract.

## Why local folders are missing on GitHub

Git records files. Empty folders do not appear in a repository. Dependencies, local configuration and generated runtime files are also intentionally excluded:

| Local path | Why it stays local |
|---|---|
| `node_modules/`, `backend/functions/node_modules/` | Installed from the committed dependency locks. |
| `firebase-config.json`, private `.env` files | Live configuration and credentials; use the tracked blank examples. |
| `dist/`, generated backend helper copies | Recreated by build/preparation commands. |
| `outputs/`, `output/`, emulator exports and logs | Local test evidence, recovery files and disposable account data. |
| `.firebase/`, `.sites-runtime/`, `.wrangler/`, `.next/` | Generated CLI state or retained local state from earlier tooling. |
| Research datasets/models and blockchain caches | Private input data or generated research/contract artefacts. |

Use `git ls-files` to see what belongs to the repository. `git status --short` shows pending tracked changes and new unignored files. A fresh authorised clone contains the same committed source paths as the working application's current commit, rather than every generated local folder.

## Hosting cleanup — 17 October 2026

The user requested removal of OpenAI integration. The unused `.openai/hosting.json`, ChatGPT sign-in helper, Sites build plugin, Cloudflare/D1 example data layer, preview scripts and their dedicated dependencies were removed. The former placeholder config contained only null D1/R2 bindings, not an OpenAI API key. The active Vite config now uses the standard `vite.config.ts` filename; the npm scripts and TypeScript config point to it. `install:ci` uses normal npm installation and verifies Vite. Firebase remains the application's authentication, database, backend and hosting platform.

The secret guard now also recognises legacy, project and service-account OpenAI-style keys, with redacted test scenarios. Historical commits are still scanned before a push. Removing unused non-secret scaffolding does not require another history rewrite. Historical documentation retains its original tool provenance; the root README contains application features and user workflows. The previous README is preserved in `IMPLEMENTATION_HISTORY.md`.

## Verification

The working checkout passed build, lint and all ten secret-guard plus three configuration scenarios. Lint retains four existing image warnings; build retains the existing bundle-size advisory. The package lock matches package.json, with 1,475 locked packages after cleanup versus 1,668 before. Eight dedicated direct dependencies were removed. Deleted hosting helpers have no remaining references in tracked application code, and the README/setup/structure links resolve.

A separate clean clone installed 1,347 platform-applicable packages using `npm run install:ci`, with Vite verified by the installer. Installation completed successfully with upstream deprecation notices and a nonfatal Windows optional-package cleanup warning. Its build succeeded using automatically created blank ignored Firebase configuration. Startup served the IILAS page and transformed both React entry modules through `vite.config.ts`. The original working Firebase configuration remains byte-for-byte unchanged. No database changes or production deployment were performed.
