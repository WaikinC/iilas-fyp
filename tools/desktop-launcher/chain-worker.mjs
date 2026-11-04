import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createDurableChain,hash,readPrivateJson,canonical} from './durable-chain.mjs';
import {acquireOwnedLock,observeProcess} from './restart-state.mjs';
import loadProvider from './hardhat-provider.mjs';
const option=(name,fallback)=>{const index=process.argv.indexOf(name);return index<0?fallback:process.argv[index+1];};
let owned,engine,server,phase='options';
async function main(){
 const app=resolve(option('--app','')),directory=resolve(option('--state','')),port=Number(option('--port','8545'));
 if(!app||!directory||!Number.isInteger(port)||port<1024||port>65535)throw Error('Options');
 phase='configuration';const config=await readPrivateJson(join(directory,'runtime.private.json')),manifest=config.manifest;
 phase='runtime pins';
 for(const [path,digest]of Object.entries(config.runtimePins))if(hash(await readFile(path))!==digest)throw Error('Pinned runtime changed');
 phase='worker ownership';owned=await acquireOwnedLock({path:join(directory,'worker.lock'),archiveDirectory:join(directory,'retired-locks'),role:'durable-chain'});
 phase='Hardhat configuration';const {provider,ethers}=await loadProvider({app,manifest});phase='journal replay';engine=await createDurableChain({provider,directory:join(directory,'journal'),manifest,parseTransaction:raw=>ethers.Transaction.from(raw)});
 const rpc=(method,params=[])=>engine.request({method,params});
 phase='registry continuity';const receipt=await rpc('eth_getTransactionReceipt',[config.chain.deploymentTransactionHash]);const code=await rpc('eth_getCode',[config.chain.address,'latest']);
 const genesis=await rpc('eth_getBlockByNumber',['0x0',false]),deployment=await rpc('eth_getBlockByNumber',[receipt?.blockNumber??'0x0',false]);
 if(!receipt||receipt.status!=='0x1'||receipt.contractAddress?.toLowerCase()!==config.chain.address.toLowerCase()||genesis.hash!==config.chainIdentity.genesisBlockHash||deployment.hash!==config.chainIdentity.deploymentBlockHash||hash(Buffer.from(code.slice(2),'hex'))!==config.chain.runtimeCodeSha256)throw Error('Saved history differs');
 async function health(){return {protocol:'iilas-durable-chain-1.0',ready:true,stateId:config.stateId,manifestSha256:hash(canonical(manifest)),process:observeProcess(process.pid),...(await engine.verify()),instanceId:(await rpc('hardhat_metadata')).instanceId,deploymentBlockHash:deployment.hash,deploymentTransactionHash:receipt.transactionHash};}
 const failure=(id,code=-32600)=>({jsonrpc:'2.0',id:id??null,error:{code,message:'The local demonstration request was refused.'}});
 async function handle(item){if(!item||item.jsonrpc!=='2.0'||!['string','number'].includes(typeof item.id)||typeof item.method!=='string')return failure(item?.id);try{return {jsonrpc:'2.0',id:item.id,result:await engine.request({method:item.method,params:item.params??[]})};}catch(e){return failure(item.id,Number.isInteger(e.code)?e.code:-32000);}}
 server=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','POST,GET,OPTIONS');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  try{
   if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
   if(req.method==='GET'&&req.url==='/health'){res.end(JSON.stringify(await health()));return;}
   if(req.method!=='POST'||req.url!=='/'){res.writeHead(404).end('{}');return;}
   const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>512*1024){res.writeHead(413).end('{}');return;}chunks.push(chunk);}
   const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(Array.isArray(body)){if(!body.length||body.length>20){res.end(JSON.stringify(failure(null)));return;}const replies=[];for(const item of body)replies.push(await handle(item));res.end(JSON.stringify(replies));}else res.end(JSON.stringify(await handle(body)));
  }catch{if(!res.headersSent)res.writeHead(503);res.end(JSON.stringify(failure(null,-32000)));}
 });
 phase='loopback listener';server.requestTimeout=15000;server.headersTimeout=10000;await new Promise((yes,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',yes);});console.log('Durable local blockchain ready; saved history verified.');
}
async function stop(){if(server)await new Promise(done=>server.close(done));await engine?.close();await owned?.release();process.exit(0);}
process.once('SIGINT',()=>stop().catch(()=>process.exit(1)));process.once('SIGTERM',()=>stop().catch(()=>process.exit(1)));
main().catch(async()=>{console.error('Durable blockchain startup refused at '+phase+'; private data remains preserved.');try{await owned?.release();}catch{}process.exit(1);});
