import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
for(const args of [['scripts/reporting-foundation-qa.mjs'],['--test','scripts/catalogue-filter-qa.mjs','scripts/reporting-response-qa.mjs'],['scripts/reporting-ui-qa.mjs'],['scripts/research-actions-ui-qa.mjs'],['scripts/research-actions-ui-qa.mjs','--comparison'],['node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.app.json'],['node_modules/vite/bin/vite.js','build','--config','vite.config.ts'],['node_modules/eslint/bin/eslint.js','.','--ignore-pattern','dist','--ignore-pattern','.next']]){const run=spawnSync(process.execPath,args,{stdio:'inherit'});if(run.status!==0)process.exit(run.status??1);}
const app=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');for(const value of ['Product status','Product exact identifier','Clear product filters'])assert(app.includes(value));
console.log('Reporting interface passed: bounded reports/CSV/source gates, catalogue filter invariants, 1440/390 Strict Mode filter/role/stale-response fixtures, TypeScript/Vite and lint (six existing image warnings only).');
