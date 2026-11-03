// Verification artifacts only. Never selects product identity or model authority.
import {mkdir,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';

export async function createParcelEvaluationOutput(kind){
  if(!/^[a-z][a-z-]{0,40}$/.test(kind))throw new Error('Invalid QA output kind.');
  const root=resolve('outputs'),output=resolve(process.env.IILAS_QA_OUTPUT_DIR||join(root,'parcel-local-eval-20261022',`${kind}-${Date.now()}-${randomUUID()}`)),rel=relative(root,output);
  if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('QA outputs must stay beneath ignored outputs.');
  let current=root;
  for(const part of ['',...rel.split(/[\\/]/)]){current=part?join(current,part):current;try{if((await lstat(current)).isSymbolicLink())throw new Error('Linked QA output paths are not allowed.');}catch(error){if(error.code!=='ENOENT')throw error;}}
  await mkdir(dirname(output),{recursive:true});
  // Deliberately exclusive: an override naming an existing directory fails.
  await mkdir(output);
  console.log(`QA output: ${output}`);
  return output;
}
