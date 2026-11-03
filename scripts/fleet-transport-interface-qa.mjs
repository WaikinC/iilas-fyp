import {spawnSync} from 'node:child_process';
const steps=[['scripts/fleet-transport-foundation-qa.mjs'],['scripts/fleet-transport-ui-qa.mjs'],['node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.app.json'],['node_modules/vite/bin/vite.js','build','--config','vite.config.ts'],['node_modules/eslint/bin/eslint.js','.','--ignore-pattern','dist','--ignore-pattern','.next']];
for(const args of steps){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
console.log('Fleet/transport interface passed: foundation contracts, bounded desktop/mobile fixtures, explicit map/manual estimates and no GPS calls; TypeScript/Vite build and lint (existing image warnings only).');
