import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const steps=[['scripts/prepare-functions.mjs'],['--test','scripts/transport-planning-qa.mjs','scripts/fleet-transport-command-qa.mjs','scripts/completion-contract-qa.mjs','scripts/completion-client-qa.mjs','scripts/completion-operation-qa.mjs','scripts/integrity-workflow-client-qa.mjs','scripts/integrity-workflow-command-qa.mjs'],['scripts/input-validation-qa.mjs'],['scripts/location-stock-qa.mjs']];
for(const args of steps){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
for(const name of ['transportPlanning','completionWorkflow'])assert.equal(await readFile(new URL('../lib/'+name+'.js',import.meta.url),'utf8'),await readFile(new URL('../backend/functions/'+name+'.js',import.meta.url),'utf8'));
console.log('Fleet/transport foundation passed: geometry, atomic lock/race/recovery tests, common/integrity compatibility, shared input/location contracts and source-copy equality.');
