import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,mkdirSync,realpathSync,readFileSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const base=realpathSync(tmpdir()),root=mkdtempSync(join(base,'iilas-secret-qa-')),scanner=fileURLToPath(new URL('./check-secrets.mjs',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
const scan=mode=>spawnSync(process.execPath,[scanner,mode],{cwd:root,encoding:'utf8'});
const fakeKey=['AI','za','Z'.repeat(35)].join('');let checks=0;
try{
 git('init','-q');git('config','user.name','IILAS security QA');git('config','user.email','qa@example.test');
 writeFileSync(join(root,'.gitignore'),'firebase-config.json\n');
 writeFileSync(join(root,'firebase-config.example.json'),JSON.stringify({apiKey:'',projectId:'demo-iilas'}));git('add','.gitignore','firebase-config.example.json');
 assert.equal(scan('--staged').status,0);checks++;
 writeFileSync(join(root,'firebase-config.json'),JSON.stringify({apiKey:fakeKey}));git('add','--force','firebase-config.json');
 let result=scan('--staged');assert.equal(result.status,1);assert.match(result.stderr,/private local file|Google API key/);assert.ok(!result.stderr.includes(fakeKey));checks++;
 git('rm','--cached','firebase-config.json');git('commit','-qm','Benign baseline');
 writeFileSync(join(root,'innocent.txt'),fakeKey);git('add','innocent.txt');writeFileSync(join(root,'innocent.txt'),'Sanitised working copy');
 result=scan('--staged');assert.equal(result.status,1);assert.ok(!result.stderr.includes(fakeKey));checks++;
 git('commit','-qm','Synthetic staged leak');git('add','innocent.txt');git('commit','-qm','Sanitised tip');
 assert.equal(scan('--staged').status,0);checks++;
 result=scan('--history');assert.equal(result.status,1);assert.match(result.stderr,/Google API key/);assert.ok(!result.stderr.includes(fakeKey));checks++;
 mkdirSync(join(root,'backend'),{recursive:true});writeFileSync(join(root,'backend','service-account.json'),JSON.stringify({type:'service_account',private_key:'placeholder'}));git('add','backend/service-account.json');assert.equal(scan('--staged').status,1);checks++;
 git('reset','--quiet');writeFileSync(join(root,'trailing-hyphen.txt'),fakeKey.slice(0,-1)+'-');git('add','trailing-hyphen.txt');assert.equal(scan('--staged').status,1);checks++;
 console.log(`Secret guard integration QA passed: ${checks} ignored/forced paths, safe examples, staged-vs-working content, redacted findings and sanitised-tip history scenarios.`);
 const configRoot=join(root,'config-fixture');mkdirSync(join(configRoot,'scripts'),{recursive:true});
 const prepare=join(configRoot,'scripts','prepare-firebase-config.mjs');
 copyFileSync(fileURLToPath(new URL('./prepare-firebase-config.mjs',import.meta.url)),prepare);
 copyFileSync(fileURLToPath(new URL('../firebase-config.example.json',import.meta.url)),join(configRoot,'firebase-config.example.json'));
 const runPrepare=()=>spawnSync(process.execPath,[prepare],{cwd:configRoot,encoding:'utf8'}),configPath=join(configRoot,'firebase-config.json');
 assert.equal(runPrepare().status,0);assert.equal(JSON.parse(readFileSync(configPath,'utf8')).apiKey,'');
 const custom=JSON.stringify({apiKey:'local-placeholder',authDomain:'',projectId:'demo-iilas',appId:'',storageBucket:''});
 writeFileSync(configPath,custom);assert.equal(runPrepare().status,0);assert.equal(readFileSync(configPath,'utf8'),custom);
 writeFileSync(configPath,`{"apiKey":"${fakeKey}" invalid JSON`);result=runPrepare();assert.notEqual(result.status,0);assert.ok(!(result.stdout+result.stderr).includes(fakeKey));
 console.log('Firebase configuration QA passed: blank creation, preservation and redacted invalid-JSON failures.');
}finally{
 const actual=realpathSync(root);assert.ok(actual.startsWith(join(base,'iilas-secret-qa-'))&&actual!==resolve(base));rmSync(actual,{recursive:true,force:true});
}
