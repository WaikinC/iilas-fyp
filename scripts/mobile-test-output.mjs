import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export async function mobileEvidenceDirectory(label){
 if(!/^[a-z0-9-]{1,60}$/.test(label))throw Error('Invalid evidence label.');
 const directory=resolve(root,'outputs/android-mobile-20261026',label+'-'+randomUUID());await mkdir(directory,{recursive:true});return directory;
}
export async function writeMobileReceipt(directory,name,value){
 const base=resolve(root,'outputs/android-mobile-20261026'),rel=relative(base,resolve(directory));
 if(!rel||rel.startsWith('..')||isAbsolute(rel)||!/^[a-z0-9-]+\.json$/.test(name))throw Error('Receipt must stay in its own evidence directory.');
 await writeFile(resolve(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
}
export async function mobileFileHash(path){return createHash('sha256').update(await readFile(path)).digest('hex');}
