import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,link} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {prepareMobileProfile,readMobileProfile} from './prepare-mobile-local.mjs';
const config={projectId:'fyp-inventory-and-logistics',apiKey:'emulator-test-only',appId:'1:1234567890:web:localdemo',storageBucket:'fyp-inventory-and-logistics.firebasestorage.app'};
async function fixture(){const dir=resolve('outputs/android-mobile-20261026/profile-fixture-'+randomUUID());await mkdir(dir,{recursive:true});const baseProfile=dir+'/base.json',webConfig=dir+'/web.json';await writeFile(baseProfile,JSON.stringify({schema:'fyp-completion-local-profile-1.0',projectId:config.projectId}));await writeFile(webConfig,JSON.stringify(config));return {baseProfile,webConfig,output:dir+'/profile-'+randomUUID()};}
test('exclusive ignored mobile sidecar detects changed base and source bytes',async()=>{
 const f=await fixture(),before=await readFile(f.baseProfile),r=await prepareMobileProfile(f);assert.equal(r.schema,'iilas-mobile-local-1.0');assert((await readFile(f.baseProfile)).equals(before));assert.equal((await readMobileProfile(r.profile)).projectId,config.projectId);await assert.rejects(prepareMobileProfile(f));await writeFile(f.baseProfile,Buffer.concat([before,Buffer.from(' ')]));await assert.rejects(readMobileProfile(r.profile));
});
test('wrong project, external endpoint, hardlinks and escaping output refuse safely',async()=>{
 for(const patch of [{projectId:'production-other'},{storageBucket:'other.appspot.com'},{databaseURL:'https://cloud.example.invalid'}]){const f=await fixture();await writeFile(f.webConfig,JSON.stringify({...config,...patch}));await assert.rejects(prepareMobileProfile(f));}
 const f=await fixture();await link(f.webConfig,f.webConfig+'.alias');await assert.rejects(prepareMobileProfile(f));await assert.rejects(prepareMobileProfile({...await fixture(),output:resolve('native-public')}));
});
