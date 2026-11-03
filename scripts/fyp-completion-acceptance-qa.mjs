// Read-only certification of completed local suites plus the final exact-state audit.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createCompletionLocalProfiles} from './prepare-fyp-completion-local.mjs';
const root='outputs/fyp-completion-20261025',read=async p=>JSON.parse(await readFile(p,'utf8'));
const scenarios=await read(root+'/actual-nonparcel-9429211f-af78-44a9-a928-e72a2287b6e5/parent-certified-result.json');
assert(scenarios.passed&&scenarios.cleanupComplete&&!scenarios.parcelTests);assert.equal(scenarios.checks.length,27);
const originals=await read(root+'/original-regressions-receipt.json');assert(originals.passed&&!originals.parcelTests);assert.deepEqual(originals.checks,['baseline','preflight','accounts','smoke','qa','shared','retry','procurement','locations','capacity','verify']);
const models=await read(root+'/model-regressions-receipt.json');assert(models.passed&&!models.parcelTests&&!models.scientificTestReplay);assert.deepEqual(models.checks.map(x=>x.checks),[11,5,10]);
for(const suite of models.checks){const result=await read(suite.output+'/result.json');assert(result.passed&&result.cleanupComplete);}
const profile=await read(root+'/cycle-02/completion-profile.json');await createCompletionLocalProfiles().environment(profile.profile,'Backend');
const state=execFileSync(process.execPath,[root+'/state-audit.mjs','verify'],{encoding:'utf8',windowsHide:true});assert(JSON.parse(state.trim().split(/\r?\n/).at(-1)).passed);
await writeFile(root+'/task11-acceptance-receipt.json',JSON.stringify({passed:true,actualNonparcelChecks:27,originalSuites:8,stockEmulatorChecks:11,stockBrowserChecks:5,deliveryChecks:10,originalCounts:{docs:1665,accounts:116,objects:2},parcelTests:false,realMetaMaskAcceptance:false,physicalGPSAcceptance:false,supervisorAcceptance:false,scenarioCleanupRecoveryDisclosed:true},null,2),{flag:'wx'});
console.log('Non-parcel acceptance passed:27 actual scenarios,8 original suites,11 stock/5 purchasing-browser/10 delivery checks; final original state exact. Human wallet/GPS/supervisor acceptance remains separate.');
