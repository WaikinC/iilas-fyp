import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const steps=[['scripts/prepare-functions.mjs'],['--test','scripts/completion-contract-qa.mjs','scripts/completion-client-qa.mjs','scripts/completion-operation-qa.mjs','scripts/integrity-workflow-contract-qa.mjs','scripts/integrity-workflow-command-qa.mjs'],['scripts/location-stock-qa.mjs'],['node_modules/hardhat/internal/cli/cli.js','test']];
if(process.env.IILAS_COMPLETION_RULES_QA==='required')steps.push(['scripts/completion-rules-qa.mjs','--integrity']);
for(const args of steps){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
for(const name of ['completionWorkflow','integrityWorkflow'])assert.equal(await readFile(new URL('../lib/'+name+'.js',import.meta.url),'utf8'),await readFile(new URL('../backend/functions/'+name+'.js',import.meta.url),'utf8'));
const baseline=JSON.parse(await readFile(new URL('../outputs/fyp-completion-20261025/baseline.json',import.meta.url),'utf8'));
for(const name of ['lib/integrity.js','blockchain/contracts/IntegrityRegistry.sol'])assert.equal(createHash('sha256').update(await readFile(new URL('../'+name,import.meta.url))).digest('hex'),baseline.sources[name]);
console.log('Integrity foundation passed: focused/common contracts, original canonical formats and Solidity tests; source copies and immutable-source hashes agree.');
