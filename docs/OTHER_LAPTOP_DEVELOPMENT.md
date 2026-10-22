# Develop IILAS on another laptop

The private `WaikinC/iilas-fyp` repository contains the application, shared contracts, research source and software checks. The separate report archive, private configuration, emulator records, parcel images and trained weights stay on MSI. A clone is sufficient for application development; it does not reproduce MSI's local model or data.

The 22 October source checkpoint excludes the new, unfinished local experimental camera integration. The application build passes, and lint reports six warnings with no errors. A broader isolated research run encountered native-worker failures in `test_parcel_runtime.py` (two failures and three errors observed); their cause is unresolved. This development checkpoint does not certify the complete research suite or parcel-camera readiness. Historical verification records retain their original scope and dates.

Use your normal GitHub account authentication. Do not paste access tokens into commands or commit configuration from MSI.

## Get the source

For a new checkout:

```powershell
git clone https://github.com/WaikinC/iilas-fyp.git
cd iilas-fyp
```

For an existing checkout, run `git status` first. Commit or safely preserve your own changes before pulling; do not use `reset --hard` to update a laptop with unfinished work. Use `git pull --ff-only` on the published branch. Create a separate branch for the other feature, such as `git switch -c feature/your-feature`.

## Prepare Windows development

Install Node 22.13 or newer within major 22 and JDK 21. From the application checkout:

```powershell
npm.cmd run install:ci
npm.cmd run functions:install
npm.cmd run security:install-hooks
npm.cmd run config:prepare
```

Obtain the local Firebase browser configuration privately and fill the ignored `firebase-config.json`. The blank tracked example intentionally contains no live API key. Keep any backend tokens in ignored local configuration too; never copy secrets into source, chat or a Git remote URL.

Start one emulator set in one terminal, then the app in another:

```powershell
npm.cmd run emulators
```

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173`. Each laptop has its own loopback emulators and local records. This command does not import MSI's existing stock, accounts or shipment data. Do not point development at production to obtain those records. Read `AGENTS.md` and the current account/handover contracts before changing workflows.

## Work across both computers

Commit and push your feature branch on the laptop where you make a change, then fetch it on the other computer. Avoid editing the same branch simultaneously on both computers. Review and merge changes through the normal Git workflow; do not copy an old `.git` directory or rewrite published history.

MSI can retain the parcel model and run its local tests while another laptop develops inventory, reports or other application areas. The parcel evaluation service binds to MSI loopback and is not remotely accessible through an ordinary clone. The other laptop does not need TensorFlow, CUDA, WSL, model weights or parcel datasets for frontend/backend source development. Research inference requires a separately prepared local environment and approved local model configuration; missing configuration deliberately leaves parcel analysis unavailable.

Before publishing a change, run the appropriate checks, including `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd run security:scan` and `npm.cmd run security:history`. When emulators already run, use direct scenario scripts rather than wrappers that launch another emulator set. Never deploy or change production as part of this local development setup.
