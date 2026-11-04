import {mkdir,readFile,readdir,lstat,realpath,open,rename,statfs} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';

export const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
export const hash=value=>createHash('sha256').update(value).digest('hex');
const refused=()=>{throw Error('The saved blockchain journal is changed, incomplete or unavailable.');};
export async function readPrivateJson(path,max=4*1024*1024){
 const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>max||resolve(await realpath(path))!==resolve(path))refused();return JSON.parse(await readFile(path,'utf8'));
}
export async function publishJson(path,value,{exclusive=false}={}){
 const bytes=canonical(value),temporary=path+'.'+randomUUID()+'.tmp';const h=await open(temporary,'wx',0o600);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}
 if(exclusive){try{await lstat(path);refused();}catch(e){if(e.code!=='ENOENT')throw e;}}
 await rename(temporary,path);
}
const pack=value=>({sha256:hash(canonical(value)),value});
async function unpack(path){const p=await readPrivateJson(path);if(!p||p.sha256!==hash(canonical(p.value)))refused();return p.value;}
const reads=new Set(['eth_chainId','net_version','web3_clientVersion','eth_blockNumber','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory','eth_getBalance','eth_getTransactionCount','eth_getCode','eth_getStorageAt','eth_call','eth_estimateGas','eth_getBlockByNumber','eth_getBlockByHash','eth_getTransactionByHash','eth_getTransactionByBlockNumberAndIndex','eth_getTransactionByBlockHashAndIndex','eth_getTransactionReceipt','eth_getBlockTransactionCountByNumber','eth_getBlockTransactionCountByHash','eth_getLogs','eth_syncing','eth_accounts','hardhat_metadata']);
const knownError=code=>{const e=Error('The local transaction was rejected.');e.code=Number.isInteger(code)?code:-32000;return e;};

export async function createDurableChain({provider,directory,manifest,clock=Date.now,afterIntent,parseTransaction,highWaterPath=join(dirname(resolve(directory)),'high-water.private.json')}){
 directory=resolve(directory);await mkdir(directory,{recursive:true});const ds=await lstat(directory);if(!ds.isDirectory()||ds.isSymbolicLink()||resolve(await realpath(directory))!==directory)refused();
 const rpc=(method,params=[])=>provider.request({method,params}),genesis=await rpc('eth_getBlockByNumber',['0x0',false]);
 if(manifest.schema!=='iilas-durable-chain-1.0'||manifest.chainId!==31337||canonical(genesis)!==canonical(manifest.genesis)||await rpc('eth_chainId')!=='0x7a69')refused();
 const manifestPath=join(directory,'manifest.json');try{if(canonical(await unpack(manifestPath))!==canonical(manifest))refused();}catch(e){if(e.code!=='ENOENT')throw e;if((await readdir(directory)).some(x=>!x.endsWith('.tmp')))refused();await publishJson(manifestPath,pack(manifest),{exclusive:true});}
 let tail={sequence:0,digest:hash(canonical(manifest)),blockHash:genesis.hash},queue=Promise.resolve(),closed=false,failed=false;
 const transactions=new Map();
 const name=(n,type)=>join(directory,String(n).padStart(8,'0')+'.'+type+'.json');
 const headPath=join(directory,'head.json');let savedHead=null;try{savedHead=await unpack(headPath);}catch(e){if(e.code!=='ENOENT')throw e;}
 let anchor=null;try{anchor=await unpack(highWaterPath);}catch(e){if(e.code!=='ENOENT')throw e;}
 const files=await readdir(directory);for(const file of files)if(!/^(manifest|head)\.json$/.test(file)&&!/^\d{8}\.(intent|result)\.json$/.test(file)&&!/^.+\.[a-f0-9-]{36}\.tmp$/.test(file))refused();
 const intents=files.filter(x=>/^\d{8}\.intent\.json$/.test(x)).sort();if(intents.length>10000||savedHead&&(!Number.isSafeInteger(savedHead.sequence)||savedHead.sequence<1||savedHead.sequence>intents.length))refused();
 const manifestSha256=hash(canonical(manifest));
 if(!anchor){if(savedHead||intents.length)refused();anchor={...tail,manifestSha256};await publishJson(highWaterPath,pack(anchor),{exclusive:true});}
 if(anchor.manifestSha256!==manifestSha256||!Number.isSafeInteger(anchor.sequence)||anchor.sequence<0||anchor.sequence>intents.length||anchor.sequence>0&&(!savedHead||savedHead.sequence<anchor.sequence))refused();

 async function execute(intent){
  const before=await rpc('eth_getBlockByNumber',['latest',false]);if(before.hash!==intent.parentHash)refused();
  await rpc('evm_setNextBlockTimestamp',[intent.timestamp]);await rpc('hardhat_setPrevRandao',[intent.prevRandao]);
  let returned=null,errorCode=null;
  try{returned=await rpc('eth_sendRawTransaction',[intent.raw]);}catch(e){errorCode=Number.isInteger(e.code)?e.code:-32000;}
  const block=await rpc('eth_getBlockByNumber',['latest',false]),receipt=await rpc('eth_getTransactionReceipt',[intent.transactionHash]);
  if(returned&&returned!==intent.transactionHash||receipt&&receipt.transactionHash!==intent.transactionHash)refused();
  if(receipt){if(block.hash!==receipt.blockHash||block.transactions.length!==1||block.transactions[0]!==intent.transactionHash||BigInt(block.number)!==BigInt(before.number)+1n)refused();}
  else if(block.hash!==before.hash||returned)refused(); // Never acknowledge a pending or unexplained mutation.
  return {sequence:intent.sequence,intentSha256:hash(canonical(intent)),transactionHash:intent.transactionHash,errorCode,block:{hash:block.hash,number:block.number,sha256:hash(canonical(block))},receipt:receipt?{sha256:hash(canonical(receipt)),status:receipt.status,transactionHash:receipt.transactionHash}:null};
 }
 async function checkpoint(intent,result,{persist=true}={}){
  const next={sequence:intent.sequence,digest:hash(canonical(result)),blockHash:result.block.hash};if(persist){await publishJson(headPath,pack(next));await publishJson(highWaterPath,pack({...next,manifestSha256}));}tail=next;transactions.set(intent.transactionHash,{raw:intent.raw,result});
 }
 async function rejected(intent,result){const folder=join(dirname(directory),'rejected');await mkdir(folder,{recursive:true});const target=join(folder,randomUUID());await publishJson(target+'.result.json',pack(result),{exclusive:true});await rename(name(intent.sequence,'intent'),target+'.intent.json');}
 for(let i=0;i<intents.length;i++){
  if(intents[i]!==String(i+1).padStart(8,'0')+'.intent.json')refused();const intent=await unpack(name(i+1,'intent'));
  validateIntent(intent,tail);
  let stored;try{stored=await unpack(name(i+1,'result'));}catch(e){if(e.code!=='ENOENT'||i<intents.length-1||savedHead?.sequence>=i+1)throw e;}
  const result=await execute(intent);if(stored&&canonical(stored)!==canonical(result))refused();
  if(!result.receipt){if(stored||i<intents.length-1||savedHead?.sequence>=i+1||anchor.sequence>=i+1)refused();await rejected(intent,result);break;}
  if(!stored)await publishJson(name(i+1,'result'),pack(result),{exclusive:true});
  if(savedHead?.sequence===i+1&&(savedHead.digest!==hash(canonical(result))||savedHead.blockHash!==result.block.hash))refused();
  if(anchor.sequence===i+1&&(anchor.digest!==hash(canonical(result))||anchor.blockHash!==result.block.hash))refused();
  await checkpoint(intent,result,{persist:false});
 }
 if(savedHead&&(savedHead.sequence>tail.sequence||!Number.isSafeInteger(savedHead.sequence)||savedHead.sequence<1))refused();
 if(files.some(x=>/^\d{8}\.result\.json$/.test(x)&&Number(x.slice(0,8))>tail.sequence))refused();
 if(tail.sequence){await publishJson(headPath,pack(tail));await publishJson(highWaterPath,pack({...tail,manifestSha256}));}
 function validateIntent(intent,previous){
  if(intent.schema!=='iilas-chain-intent-1.0'||intent.sequence!==previous.sequence+1||intent.previousDigest!==previous.digest||intent.parentHash!==previous.blockHash||typeof intent.raw!=='string'||!/^0x(?:[a-fA-F0-9]{2}){1,131072}$/.test(intent.raw)||!/^0x[a-f0-9]{64}$/.test(intent.transactionHash)||!/^0x[a-f0-9]{64}$/.test(intent.prevRandao)||!Number.isSafeInteger(intent.timestamp)||intent.timestamp<0)refused();
 }
 function serial(work){const next=queue.then(work);queue=next.catch(()=>{});return next;}
 async function request({method,params=[]}){return serial(async()=>{
  if(closed||failed)refused();if(!Array.isArray(params)||canonical(params).length>512*1024)throw knownError(-32602);
  if(reads.has(method))return rpc(method,params);
  if(method!=='eth_sendRawTransaction')throw knownError(-32601);
  if(params.length!==1||typeof params[0]!=='string'||!/^0x(?:[a-fA-F0-9]{2}){1,131072}$/.test(params[0]))throw knownError(-32602);
  const raw=params[0].toLowerCase();
  // keccak/signature parsing comes from the same pinned Ethereum implementation as Hardhat.
  let tx;try{const parser=parseTransaction??(value=>import('ethers').then(({Transaction})=>Transaction.from(value)));tx=await parser(raw);if(!tx.isSigned()||tx.chainId!==31337n||!tx.from||![0,1,2].includes(tx.type))throw Error();}catch{throw knownError(-32602);}
  const duplicate=transactions.get(tx.hash);if(duplicate){if(duplicate.raw!==raw)refused();if(duplicate.result.errorCode!==null)throw knownError(duplicate.result.errorCode);return tx.hash;}
  const free=await statfs(directory);if(Number(free.bavail)*Number(free.bsize)<1024**3||tail.sequence>=10000)throw knownError(-32000);
  const block=await rpc('eth_getBlockByNumber',['latest',false]);if(block.hash!==tail.blockHash)refused();
  const timestamp=Math.max(Math.floor(clock()/1000),Number(BigInt(block.timestamp))+1),prevRandao='0x'+hash(block.hash+':'+timestamp);
  const intent={schema:'iilas-chain-intent-1.0',sequence:tail.sequence+1,previousDigest:tail.digest,parentHash:block.hash,raw,transactionHash:tx.hash,timestamp,prevRandao};validateIntent(intent,tail);
  let result;
  try{
   await publishJson(name(intent.sequence,'intent'),pack(intent),{exclusive:true});await afterIntent?.(intent);
   result=await execute(intent);if(!result.receipt)await rejected(intent,result);else{await publishJson(name(intent.sequence,'result'),pack(result),{exclusive:true});await checkpoint(intent,result);}
  }catch(e){failed=true;throw e;}
  if(result.errorCode!==null)throw knownError(result.errorCode);return tx.hash;
 });}
 return {request,verify:()=>serial(async()=>{if(failed)refused();const block=await rpc('eth_getBlockByNumber',['latest',false]);if(block.hash!==tail.blockHash)refused();return {transactions:transactions.size,head:structuredClone(tail),genesisHash:genesis.hash};}),close:async()=>{await queue;closed=true;}};
}
