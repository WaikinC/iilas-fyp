import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const steps=[['scripts/prepare-functions.mjs'],['--test','scripts/customer-access-command-qa.mjs','scripts/completion-operation-qa.mjs','scripts/completion-contract-qa.mjs','scripts/completion-client-qa.mjs','scripts/fleet-transport-command-qa.mjs','scripts/integrity-workflow-command-qa.mjs']];
if(process.env.IILAS_COMPLETION_RULES_QA==='required')steps.push(['scripts/customer-access-rules-qa.mjs']);
for(const args of steps){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
assert.equal(await readFile(new URL('../lib/accountRoles.js',import.meta.url),'utf8'),await readFile(new URL('../backend/functions/accountRoles.js',import.meta.url),'utf8'));
const root=new URL('../outputs/fyp-completion-20261025/harness-runs/accounts-20261025-core01/',import.meta.url);
for(const suite of ['baseline','preflight','accounts','verify']){
 const result=JSON.parse(await readFile(new URL(suite+'-01/result.json',root),'utf8'));assert.equal(result.passed,true);assert.equal(result.primaryPreflight.registrationWouldBeNoop,true);assert.deepEqual(result.counts,{documents:1665,accounts:116,objects:2});
 if(suite==='accounts'){assert.equal(result.preservation.baselineExact,true);for(const [file,sha]of Object.entries(result.sourceHashes))assert.equal(createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex'),sha);}
}
console.log('Customer access foundation passed: isolated projections/recovery/account compatibility, emulator Firestore/Storage boundaries and unchanged original-account regression receipts (1665 docs/116 accounts/2 objects).');
