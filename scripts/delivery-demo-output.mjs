import {mkdir,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function createDeliveryDemoOutput(kind,{base='outputs/delivery-ai-20261024',id=randomUUID()}={}){
 if(!/^[a-z][a-z-]{0,40}$/.test(kind)||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))throw Error('Invalid delivery AI evidence identity.');
 const allowed=resolve(root,'outputs/delivery-ai-20261024'),directory=resolve(root,base),path=resolve(directory,kind+'-'+id),rel=relative(root,path);
 if(directory!==allowed||!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Delivery AI evidence must stay in its ignored output directory.');
 execFileSync('git',['check-ignore','-q','--',rel],{cwd:root,stdio:'pipe'});
 let current=root;
 for(const part of rel.split(/[\\/]/)){
  current=join(current,part);
  try{if((await lstat(current)).isSymbolicLink())throw Error('Linked delivery AI output refused.');}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 await mkdir(directory,{recursive:true});await mkdir(path);return path;
}
