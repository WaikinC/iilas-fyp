import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {REPORT_RESOURCES} from '../lib/reporting.js';
for(const args of [['scripts/prepare-functions.mjs'],['--test','scripts/reporting-contract-qa.mjs','scripts/reporting-command-qa.mjs','scripts/completion-contract-qa.mjs','scripts/completion-client-qa.mjs','scripts/completion-operation-qa.mjs'],['scripts/location-stock-qa.mjs']]){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
assert.equal(await readFile(new URL('../lib/reporting.js',import.meta.url),'utf8'),await readFile(new URL('../backend/functions/reporting.js',import.meta.url),'utf8'));
const {indexes}=JSON.parse(await readFile(new URL('../firestore.indexes.json',import.meta.url),'utf8'));
for(const [kind,config]of Object.entries(REPORT_RESOURCES))for(const fields of [[config.dateField],...Object.values(config.filters).filter(f=>f.indexed&&typeof f.path==='string').map(f=>[f.path]),...(['shipment','plan'].includes(config.driver)?[['driverUid'],['driverUid',config.dateField]]:[])])assert(indexes.some(i=>i.collectionGroup===kind&&i.queryScope==='COLLECTION'&&JSON.stringify(i.fields)===JSON.stringify(['ownerId',...new Set(fields)].map(fieldPath=>({fieldPath,order:'ASCENDING'})))),'Missing report query index: '+kind+'/'+fields);
console.log('Reporting foundation passed: closed resources/roles, assigned-driver joins, bounded scans/reads, Malaysia dates, deadline/cancellation, safe complete-or-refuse CSV, source-copy equality and supported query indexes.');
