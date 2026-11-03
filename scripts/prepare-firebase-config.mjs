import {copyFile,readFile,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {LOCAL_DEMO_ENVIRONMENT,validateDemoEnvironment} from '../lib/demoEnvironment.js';

const target=new URL('../firebase-config.json',import.meta.url);
try{
  // Exclusive copy preserves an existing contributor's local configuration.
  await copyFile(new URL('../firebase-config.example.json',import.meta.url),target,constants.COPYFILE_EXCL);
  console.log('Created ignored firebase-config.json from the blank example. Configure Firebase locally before signing in.');
}catch(error){if(error.code!=='EEXIST')throw error;}
let config;
try{config=JSON.parse(await readFile(target,'utf8'));}
catch{throw new Error('Cannot read valid JSON from local firebase-config.json. No configuration values were printed.');}
if(!config||typeof config!=='object'||Array.isArray(config))throw new Error('Local Firebase configuration must be a JSON object.');
for(const field of ['apiKey','authDomain','projectId','appId','storageBucket']){
  if(typeof config[field]!=='string')throw new Error(`Local Firebase configuration needs a string ${field}. No configuration values were printed.`);
}
for(const [name,value]of [['demo-environment.json',LOCAL_DEMO_ENVIRONMENT],['demo-allowlist.json',[LOCAL_DEMO_ENVIRONMENT]]]){
 try{await writeFile(new URL('../'+name,import.meta.url),JSON.stringify(value,null,2)+'\n',{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
}
const profile=JSON.parse(await readFile(new URL('../demo-environment.json',import.meta.url),'utf8')),allowlist=JSON.parse(await readFile(new URL('../demo-allowlist.json',import.meta.url),'utf8'));
validateDemoEnvironment(profile,allowlist);
if(config.apiKey&&config.appId&&(config.projectId!==profile.projectId||config.storageBucket!==profile.storageBucket))throw new Error('The ignored Firebase options and explicit environment profile belong to different projects. No values were printed.');
