import {mkdir,lstat,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
export async function createFYPCompletionOutput(kind){if(!/^[a-z][a-z-]{1,39}$/.test(kind))throw Error('Invalid local evidence kind.');const root=resolve('outputs/fyp-completion-20261025'),dir=join(root,kind+'-'+randomUUID());execFileSync('git',['check-ignore','-q','--',relative(process.cwd(),dir)],{stdio:'pipe'});if((await lstat(root)).isSymbolicLink())throw Error('Linked output root refused.');await mkdir(dir);return {directory:dir,save:async(name,value)=>{if(!/^[a-z0-9][a-z0-9.-]{0,79}$/.test(name))throw Error('Invalid evidence filename.');const path=join(dir,name),r=relative(dir,path);if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Output escape refused.');await writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}};}
