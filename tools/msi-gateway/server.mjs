import {createServer} from 'node:http';
import {HYBRID_LIMITS as L} from '../../lib/hybridGateway.js';
import {hybridHash} from './authentication.mjs';
export function createGatewayServer({authenticate,handlers}){
 if(!authenticate||!handlers)throw Error('An authenticated fixed MSI handler map is required.');
 const active=new Set();
 const server=createServer(async(req,res)=>{
  const send=(status,value)=>{if(res.writableEnded||res.destroyed)return;const body=JSON.stringify(value);res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(body);};
  if(req.url!=='/v1/operation'){req.resume();return send(404,{error:'Unavailable'});}
  if(req.method!=='POST'){req.resume();return send(405,{error:'Unavailable'});}
  if(req.headers['content-type']!=='application/json'){req.resume();return send(415,{error:'Unavailable'});}
  const length=req.headers['content-length'];if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>L.bodyBytes)){req.resume();return send(413,{error:'Unavailable'});}
  let admitted;
  try{let size=0;const chunks=[];for await(const part of req){size+=part.length;if(size>L.bodyBytes){send(413,{error:'Unavailable'});return;}chunks.push(part);}admitted=authenticate.admit(JSON.parse(Buffer.concat(chunks).toString('utf8')),req.headers['x-iilas-signature']);}
  catch{return send(401,{error:'Unavailable'});}
  const q=admitted.envelope;
  const reply=(status,result)=>{const resultJson=JSON.stringify(result);return {protocol:q.protocol,projectId:q.projectId,requestId:q.requestId,operation:q.operation,bindingSha256:q.bindingSha256,payloadSha256:q.payloadSha256,status,resultJson,resultSha256:hybridHash(resultJson)};};
  if(admitted.reply)return send(200,authenticate.signReply(admitted.reply));
  if(admitted.pending)return send(200,authenticate.signReply(reply('busy',{})));
  const model=q.operation.endsWith('.predict')?q.operation:null,handler=Object.hasOwn(handlers,q.operation)?handlers[q.operation]:null;
  let result;
  if(model&&active.has(model))result=reply('busy',{});
  else if(!handler)result=reply('unavailable',{});
  else{
   if(model)active.add(model);const controller=new AbortController();let timer;
   try{
    const timeout=Math.max(1,Math.min(q.operation.startsWith('chain.')?15000:25000,q.operationExpiresAtMs-Date.now()));
    const value=await Promise.race([Promise.resolve().then(()=>handler(JSON.parse(q.payloadJson),{envelope:q,signal:controller.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Deadline'));},timeout);})]);
    result=reply('ok',value);if(Buffer.byteLength(JSON.stringify(result))>L.responseBytes)throw Error('Response cap');
   }catch{result=reply('unavailable',{});}finally{clearTimeout(timer);if(model)active.delete(model);}
  }
  try{authenticate.complete(admitted.identity,result);send(200,authenticate.signReply(result));}catch{send(503,{error:'Unavailable'});}
 });
 server.requestTimeout=30000;server.headersTimeout=10000;server.keepAliveTimeout=1000;server.maxConnections=L.connections;
 return server;
}
