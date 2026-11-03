import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {products} from './report-statistics-command-harness.mjs';
import {HYBRID_FUNCTION_FILES} from './prepare-hybrid-demo.mjs';
import {createMsiBackend} from '../tools/msi-backend/server.mjs';
const input={preset:'stockCondition',filters:{},interval:'day'},instance='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',projectId='fyp-inventory-and-logistics';
test('staging includes exact shared statistics modules required by its reader',async()=>{
 for(const file of ['reportStatistics.js','reportStatisticsMetrics.js']){assert(HYBRID_FUNCTION_FILES.includes(file),'Missing staged dependency '+file);assert.equal(await readFile(new URL('../lib/'+file,import.meta.url),'utf8'),await readFile(new URL('../backend/functions/'+file,import.meta.url),'utf8'));}
});
test('normal service dispatch and authenticated MSI envelope reach the same statistics handler',async()=>{
 products(21,{status:'Active',reservedQuantity:0,reorderLevel:1});const {executeCommand}=await import('../backend/functions/service.mjs');
 const direct=await executeCommand({uid:'manager'},{action:'queryReportStatistics',input});assert.equal(direct.summary[0].value,21);
 await assert.rejects(executeCommand({uid:'customer'},{action:'queryReportStatistics',input}));await assert.rejects(executeCommand({uid:'manager'},{action:'unknownStatistics',input}));
 const server=createMsiBackend({runtime:{mode:'spark-loopback-test',projectId,backendInstanceId:instance,webOrigins:['http://127.0.0.1:5173']},verifyIdToken:async token=>{assert.equal(token,'fixture-token');return {uid:'manager',sub:'manager',aud:projectId,iss:`https://securetoken.google.com/${projectId}`,exp:Math.floor(Date.now()/1000)+3600};},executeCommand});
 await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/command`,{method:'POST',headers:{authorization:'Bearer fixture-token','content-type':'application/json','x-iilas-protocol':'iilas-msi-api-1.0','x-iilas-backend':instance},body:JSON.stringify({action:'queryReportStatistics',input})});assert.equal(response.status,200);assert.equal((await response.json()).data.summary[0].value,21);assert.equal(response.headers.get('x-iilas-backend'),instance);}finally{await new Promise(r=>{server.closeAllConnections();server.close(r);});}
});
