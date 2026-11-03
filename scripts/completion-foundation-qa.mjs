import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
for(const args of [ ['scripts/prepare-functions.mjs'],['--test','scripts/completion-contract-qa.mjs','scripts/completion-client-qa.mjs','scripts/completion-operation-qa.mjs','scripts/inventory-demo-reorder-command-qa.mjs']]){
 const run=spawnSync(process.execPath,args,{stdio:'inherit'});if(run.status!==0)process.exit(run.status??1);
}
assert.equal(await readFile(new URL('../lib/completionWorkflow.js',import.meta.url),'utf8'),await readFile(new URL('../backend/functions/completionWorkflow.js',import.meta.url),'utf8'));
if(process.env.IILAS_COMPLETION_RULES_QA==='required'){
 const run=spawnSync(process.execPath,['scripts/completion-rules-qa.mjs'],{stdio:'inherit'});if(run.status!==0)process.exit(run.status??1);
}
console.log('Completion foundation and existing stock operation compatibility passed; generated source agrees.');
