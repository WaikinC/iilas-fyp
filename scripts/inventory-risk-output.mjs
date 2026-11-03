import {mkdir,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {randomUUID} from 'node:crypto';
export async function createInventoryRiskOutput(kind){
 if(!/^[a-z][a-z-]{0,40}$/.test(kind))throw Error('Invalid inventory QA kind.');
 const root=resolve('outputs'),out=resolve(root,'inventory-risk-20261022',`${kind}-${randomUUID()}`),rel=relative(root,out);
 if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Output outside ignored area.');
 let current=root;for(const part of ['',...rel.split(/[\\/]/)]){current=part?join(current,part):current;try{if((await lstat(current)).isSymbolicLink())throw Error('Linked QA output refused.');}catch(e){if(e.code!=='ENOENT')throw e;}}
 await mkdir(join(root,'inventory-risk-20261022'),{recursive:true});await mkdir(out);return out;
}
