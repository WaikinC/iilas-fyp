import {readFile,lstat} from 'node:fs/promises';
import {readFileSync,lstatSync} from 'node:fs';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
export const SPARK_ROOT=fileURLToPath(new URL('../',import.meta.url));
export const sparkHash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=()=>{throw Error('Private Spark inputs are missing, linked, changed or outside their owned area.');};
export function sparkSourcePath(input){if(typeof input!=='string')fail();const path=resolve(SPARK_ROOT,input),rel=relative(SPARK_ROOT,path);if(!rel||rel.startsWith('..')||isAbsolute(rel))fail();return path;}
export async function readSparkPrivate(input,cap=1048576){const path=sparkSourcePath(input),rel=relative(SPARK_ROOT,path);if(!rel.replaceAll('\\','/').startsWith('outputs/'))fail();let p=SPARK_ROOT;for(const part of rel.split(/[\\/]/)){p=join(p,part);const s=await lstat(p);if(s.isSymbolicLink()||s.isFile()&&(s.nlink!==1||s.size>cap))fail();}execFileSync('git',['check-ignore','-q','--',rel],{cwd:SPARK_ROOT,stdio:'pipe'});return readFile(path);}
export function collectSparkSources(){const names=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:SPARK_ROOT,maxBuffer:16777216}).toString().split('\0').filter(name=>name&&!/\.(md|txt|pdf|docx)$/i.test(name));return Object.fromEntries(names.sort().map(name=>{const p=sparkSourcePath(name),s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>67108864)fail();return [name,sparkHash(readFileSync(p))];}));}
export function verifySparkPins(pins){if(!pins||typeof pins!=='object'||Array.isArray(pins)||!Object.keys(pins).length)fail();for(const [name,pin]of Object.entries(pins)){if(!/^[a-f0-9]{64}$/.test(pin))fail();const p=sparkSourcePath(name),s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>67108864||sparkHash(readFileSync(p))!==pin)fail();}return true;}
