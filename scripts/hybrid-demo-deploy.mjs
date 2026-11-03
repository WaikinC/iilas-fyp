import {readFile,lstat,readdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {validateHybridDeploymentManifest,hybridManifestHash,assertHybridAuthorisation} from './hybrid-demo-manifest.mjs';
import {hybridHash} from '../backend/functions/hybridSigning.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),BASE=resolve(ROOT,'outputs/hybrid-demo-20261027');
async function file(path){const p=resolve(ROOT,path),rel=relative(BASE,p);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Use this plan’s ignored deployment packet.');let cursor=BASE;for(const part of rel.split(/[\\/]/)){cursor=join(cursor,part);const s=await lstat(cursor);if(s.isSymbolicLink()||s.isFile()&&s.nlink!==1)throw Error('Linked deployment inputs refused.');}return p;}
export async function verifyHybridStaging(manifestPath){
 const path=await file(manifestPath),manifest=validateHybridDeploymentManifest(JSON.parse(await readFile(path,'utf8'))),root=dirname(path);
 for(const [name,pin]of Object.entries(manifest.sourcePins)){const p=await file(join(root,name));if(hybridHash(await readFile(p))!==pin)throw Error('Deployment sources changed after review.');}
 async function walk(folder){for(const e of await readdir(folder,{withFileTypes:true})){const p=join(folder,e.name);if(e.isSymbolicLink())throw Error('Linked payload refused.');if(p===join(root,'functions/node_modules')&&e.isDirectory())continue;if(e.isDirectory())await walk(p);else if(!Object.hasOwn(manifest.sourcePins,relative(root,p).replaceAll('\\','/')))throw Error('Unreviewed deployment payload refused.');}}
 await walk(join(root,'functions'));await walk(join(root,'public'));return {manifest,root,digest:hybridManifestHash(manifest)};
}
export async function deployHybridDemo({manifestPath,approvalPath,execute=false}){
 const checked=await verifyHybridStaging(manifestPath),project=checked.manifest.environment.projectId;
 if(!execute)return {dryRun:true,projectId:project,manifestSha256:checked.digest,fixtureOnly:checked.manifest.fixtureOnly,willCreateResources:false,requiresSeparateActions:['provision','billing','tunnel','deploy','seed','cloud-tests']};
 if(!approvalPath)throw Error('Explicit reviewed deployment and billing authorisation is required.');const approval=JSON.parse(await readFile(await file(approvalPath),'utf8'));
 assertHybridAuthorisation({manifest:checked.manifest,approvedSha256:approval.manifestSha256,phase:'deploy',actualProject:approval.projectId,authorisedActions:approval.authorisedActions});
 if(approval.newProjectVerified!==true||approval.billingVerified!==true||approval.tunnelHandshakeVerified!==true)throw Error('Verify the separately provisioned project, billing and signed HTTPS handshake before deployment.');
 const cli=join(ROOT,'node_modules/firebase-tools/lib/bin/firebase.js');
 const apps=JSON.parse(execFileSync(process.execPath,[cli,'apps:list','--project',project,'--json','--non-interactive'],{cwd:ROOT,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));if(apps.status!=='success')throw Error('The new project could not be verified.');
 const npm=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');execFileSync(process.execPath,[npm,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:join(checked.root,'functions'),windowsHide:true,stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024});
 await verifyHybridStaging(manifestPath);
 // No shell, default CLI project, predeploy hooks, billing or tunnel side effects.
 execFileSync(process.execPath,[cli,'deploy','--project',project,'--config',join(checked.root,'firebase.json'),'--only','functions,firestore:rules,firestore:indexes,storage,hosting','--non-interactive'],{cwd:ROOT,windowsHide:true,stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024});return {deployed:true,projectId:project,manifestSha256:checked.digest};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const get=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1];};deployHybridDemo({manifestPath:get('--manifest'),approvalPath:get('--approval'),execute:process.argv.includes('--execute')}).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Deployment refused or failed. No credentials were printed; preserve the reviewed packet and inspect its resource state before retrying.');process.exitCode=1;});}
