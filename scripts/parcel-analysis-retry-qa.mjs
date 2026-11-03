import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createParcelAnalysisRetry} from '../lib/parcelAnalysisRetry.js';

const op='12345678-1234-4123-8123-123456789abc';
const context={scopeId:'scope',actorUid:'actor',evidenceId:'evidence',stage:'Pre-dispatch'};
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
// Complete fixed public shape, hand-written independently of the state helpers.
const result=(state='Running')=>({analysisId:'analysis',ownerId:'scope',actorUid:'actor',operationId:op,shipmentId:'shipment',evidenceId:'evidence',evidenceVersion:2,evidenceSha256:'a'.repeat(64),stage:'Pre-dispatch',shipmentVersion:3,captureSource:'file',capturedAtClient:null,model:null,state,version:state==='Running'?1:2,createdAt:1000,updatedAt:state==='Running'?1000:state==='Expired'?91000:2000,expiresAt:91000,completedAt:state==='Running'?null:state==='Expired'?91000:2000,label:null,probabilities:null,confidence:null,confidenceMeaning:null,serviceRequestId:null,processingTimeMs:null,totalProcessingTimeMs:null,predictionId:null,reasonCode:state==='Unavailable'?'model-unavailable':state==='Expired'?'lease-expired':null,reviewStatus:'NotRequired',reviewNotes:null,reviewedBy:null,reviewedAt:null,humanReviewRequired:false});

test('explicit photo cleanup clears only a matching saved intent on exact true acknowledgement without new inference',async()=>{
  const storage=memory(),calls=[];let client=createParcelAnalysisRetry({storage,context,createOperationId:()=>op,command:async(name,input)=>{calls.push([name,input]);if(name==='cleanupParcelAnalysis')return {released:true};return result();}});
  await client.submit();client=createParcelAnalysisRetry({storage,context,command:async(name,input)=>{calls.push([name,input]);return {released:true};}});
  assert.deepEqual(await client.cleanup(result()),{released:true,recoveryComplete:true});assert.equal(client.pending(),null);assert.deepEqual(calls,[['startParcelAnalysis',{evidenceId:'evidence',operationId:op}],['cleanupParcelAnalysis',{analysisId:'analysis',pendingOperationId:op}]]);
});
test('photo cleanup false/malformed acknowledgement, wrong context and late generation cannot clear recovery identity',async()=>{
  for(const ack of [{released:false},{released:1},{released:true,model:null},null]){
    const storage=memory(),calls=[],client=createParcelAnalysisRetry({storage,context,createOperationId:()=>op,command:async(name,input)=>{calls.push([name,input]);return name==='cleanupParcelAnalysis'?ack:result();}});await client.submit();
    if(ack?.released===false)assert.deepEqual(await client.cleanup(result()),{released:false,recoveryComplete:false});else await assert.rejects(client.cleanup(result()));
    assert.equal(client.pending().operationId,op);const before=calls.length;await assert.rejects(client.cleanup({...result(),ownerId:'other'}));assert.equal(calls.length,before);
  }
  const storage=memory(),gate=deferred(),client=createParcelAnalysisRetry({storage,context,createOperationId:()=>op,command:async name=>name==='cleanupParcelAnalysis'?gate.promise:result()});await client.submit();const work=client.cleanup(result());client.setContext({...context,stage:'Delivery'});client.setContext(context);gate.resolve({released:true});await assert.rejects(work);assert.equal(client.pending().operationId,op);
});
test('late photo server release preserves unrelated successor intent and reports incomplete client recovery',async()=>{
  const storage=memory(),gate=deferred(),client=createParcelAnalysisRetry({storage,context,createOperationId:()=>op,command:async name=>name==='cleanupParcelAnalysis'?gate.promise:result()});await client.submit();const work=client.cleanup(result()),key=[...storage.values.keys()][0],successor={scopeId:'scope',actorUid:'actor',evidenceId:'evidence',operationId:'87654321-4321-4321-8321-cba987654321'};storage.setItem(key,JSON.stringify(successor));gate.resolve({released:true});assert.deepEqual(await work,{released:true,recoveryComplete:false});assert.deepEqual(client.pending(),successor);
});

test('response loss and reload preserve only identity and replay the exact same operation',async()=>{
  const storage=memory();let calls=[];
  let client=createParcelAnalysisRetry({storage,context,createOperationId:()=>op,command:async(name,input)=>{calls.push({name,input});throw new Error('lost response');}});
  await assert.rejects(client.submit(),/lost response/);
  const persisted=JSON.parse([...storage.values.values()][0]);
  assert.deepEqual(persisted,{scopeId:'scope',actorUid:'actor',evidenceId:'evidence',operationId:op});
  client=createParcelAnalysisRetry({storage,context,createOperationId:()=>{throw new Error('new ID forbidden');},command:async(name,input)=>{calls.push({name,input});return result();}});
  assert.equal((await client.check()).state,'Running');
  assert.deepEqual(calls,[{name:'startParcelAnalysis',input:{evidenceId:'evidence',operationId:op}},{name:'startParcelAnalysis',input:{evidenceId:'evidence',operationId:op}}]);
  assert.equal(client.pending().operationId,op);
});
test('known Running analysis checks resolve without starting another inference',async()=>{
  const storage=memory();const calls=[];
  const client=createParcelAnalysisRetry({storage,context,createOperationId:()=>op,command:async(name,input)=>{calls.push({name,input});return result(name==='resolveParcelAnalysis'?'Expired':'Running');}});
  await client.submit();assert.equal((await client.check()).state,'Expired');
  assert.deepEqual(calls[1],{name:'resolveParcelAnalysis',input:{analysisId:'analysis'}});
  assert.equal(client.pending(),null);
  assert.equal(storage.values.size,0);assert.equal(calls.length,2);
  await assert.rejects(client.check());assert.equal(calls.length,2);
});
test('submit and check are serial even across two controllers for one same-tab identity',async()=>{
  const storage=memory();const waiting=deferred();let count=0;
  const options={storage,context,createOperationId:()=>op,command:()=>{count++;return waiting.promise;}};
  const first=createParcelAnalysisRetry(options),second=createParcelAnalysisRetry(options);
  const pending=first.submit();
  await assert.rejects(first.check(),/running/i);await assert.rejects(second.submit(),/running/i);
  assert.equal(count,1);waiting.resolve(result());await pending;
});
test('context changes reject late responses and retain the old identity for later recovery',async()=>{
  const storage=memory();const waiting=deferred();
  const client=createParcelAnalysisRetry({storage,context,createOperationId:()=>op,command:()=>waiting.promise});
  const pending=client.submit();client.setContext({...context,actorUid:'other'});waiting.resolve(result('Unavailable'));
  await assert.rejects(pending,/context/i);assert.equal(client.pending(),null);assert.equal(storage.values.size,1);
  client.setContext(context);assert.equal(client.pending().operationId,op);
});
test('stage change and context change back still fence a late result',async()=>{
  const storage=memory();const waiting=deferred();const client=createParcelAnalysisRetry({storage,context,createOperationId:()=>op,command:()=>waiting.promise});
  const pending=client.submit();client.setContext({...context,stage:'Delivery'});client.setContext(context);waiting.resolve(result());
  await assert.rejects(pending,/context/i);
});
test('busy saves its public blocker ID only and check never sends a replacement',async()=>{
  const storage=memory();const calls=[];const client=createParcelAnalysisRetry({storage,context,createOperationId:()=>op,command:async(name,input)=>{calls.push({name,input});return name==='startParcelAnalysis'?{state:'Busy',analysisId:'blocker',reasonCode:'evidence-busy'}:{...result('Expired'),analysisId:'blocker',operationId:'87654321-4321-4321-8321-cba987654321',actorUid:'other'};}});
  assert.equal((await client.submit()).state,'Busy');await client.check();assert.equal(calls.length,2);assert.deepEqual(calls[1],{name:'resolveParcelAnalysis',input:{analysisId:'blocker'}});assert.equal(storage.values.size,0);
});
test('corrupt storage or unavailable persistence prevents submission',async()=>{
  const storage=memory();let count=0;const options={storage,context,createOperationId:()=>op,command:async()=>{count++;return result();}};
  let client=createParcelAnalysisRetry(options);storage.setItem([...storage.values.keys()][0]??'unrelated','bad');
  await client.submit();const key=[...storage.values.keys()].find(k=>k!=='unrelated');storage.setItem(key,JSON.stringify({...client.pending(),token:'must never persist'}));
  await assert.rejects(client.submit(),/saved/i);
  client=createParcelAnalysisRetry({...options,storage:{getItem:()=>null,setItem:()=>{throw new Error('disabled');},removeItem:()=>{}}});
  await assert.rejects(client.submit(),/save/i);assert.equal(count,1);
});
test('mismatched response never clears intent and dismissal requires a known terminal',async()=>{
  const storage=memory();const client=createParcelAnalysisRetry({storage,context,createOperationId:()=>op,command:async()=>({...result('Unavailable'),evidenceId:'other'})});
  await assert.rejects(client.submit(),/response/i);assert.equal(client.pending().operationId,op);assert.throws(()=>client.dismissTerminal());
});
test('recovery returns a safe DTO and retains an intent for corrupt terminal results',async()=>{
  const storage=memory();let invalid=false;
  const client=createParcelAnalysisRetry({storage,context,createOperationId:()=>op,command:async()=>invalid?{...result('Unavailable'),label:'Normal'}:{...result(),nonce:'private',storagePath:'private'}});
  const outcome=await client.submit();assert.equal(JSON.stringify(outcome).includes('private'),false);
  invalid=true;await assert.rejects(client.check());assert.equal(client.pending().operationId,op);
});
test('check itself blocks parallel submit and failed checks preserve the operation',async()=>{
  const storage=memory();let waiting=null;const client=createParcelAnalysisRetry({storage,context,createOperationId:()=>op,command:async()=>waiting?waiting.promise:result()});
  await client.submit();waiting=deferred();const checking=client.check();await assert.rejects(client.submit(),/running/i);waiting.reject(new Error('connection lost'));await assert.rejects(checking,/connection lost/);assert.equal(client.pending().operationId,op);
});
test('an unknown DTO evidence stage cannot clear a saved intent',async()=>{
  const client=createParcelAnalysisRetry({storage:memory(),context,createOperationId:()=>op,command:async()=>({...result('Unavailable'),stage:'Legacy'})});
  await assert.rejects(client.submit(),/response/i);assert.equal(client.pending().operationId,op);
});
test('historical Pre-dispatch outcome remains recoverable after current lifecycle changes to Delivery',async()=>{
  const storage=memory();let loseResponse=true;const client=createParcelAnalysisRetry({storage,context,createOperationId:()=>op,command:async()=>{if(loseResponse)throw new Error('lost');return result('Unavailable');}});
  await assert.rejects(client.submit(),/lost/);client.setContext({...context,stage:'Delivery'});loseResponse=false;
  const recovered=await client.check();assert.equal(recovered.stage,'Pre-dispatch');assert.equal(recovered.state,'Unavailable');assert.equal(client.pending(),null);
});
test('Busy reload replays a durable blocked receipt even after its blocker terminalizes',async()=>{
  const storage=memory(),receipts=new Map(),calls=[];let blockerTerminal=false,executions=0,uuidCount=0;
  // This double models the required trusted-server durable Blocked receipt.
  // Without it a reload replay after blocker completion could start new work.
  const command=async(name,input)=>{
    calls.push({name,input});
    if(name==='resolveParcelAnalysis')return {...result('Expired'),analysisId:'blocker',actorUid:'other',operationId:'87654321-4321-4321-8321-cba987654321'};
    const receiptKey=`scope:actor:${input.operationId}`,existing=receipts.get(receiptKey);
    if(existing){assert.equal(existing.evidenceId,input.evidenceId);return {state:'Busy',analysisId:existing.blocker,reasonCode:'evidence-busy',nonce:'must not leak'};}
    if(!blockerTerminal){receipts.set(receiptKey,{evidenceId:input.evidenceId,blocker:'blocker'});return {state:'Busy',analysisId:'blocker',reasonCode:'evidence-busy'};}
    executions++;return result();
  };
  let client=createParcelAnalysisRetry({storage,context,command,createOperationId:()=>{uuidCount++;return op;}});
  await client.submit();blockerTerminal=true;
  client=createParcelAnalysisRetry({storage,context,command,createOperationId:()=>{uuidCount++;throw new Error('replacement forbidden');}});
  const recovered=await client.check();assert.deepEqual(recovered,{state:'Busy',analysisId:'blocker',reasonCode:'evidence-busy'});
  await Promise.resolve();assert.equal(calls.length,2);assert.equal(executions,0);assert.equal(uuidCount,1);assert.equal(client.pending().operationId,op);
  const terminal=await client.check();assert.equal(terminal.state,'Expired');assert.equal(terminal.analysisId,'blocker');assert.equal(client.pending(),null);assert.equal(executions,0);assert.equal(uuidCount,1);
  assert.deepEqual(calls,[{name:'startParcelAnalysis',input:{evidenceId:'evidence',operationId:op}},{name:'startParcelAnalysis',input:{evidenceId:'evidence',operationId:op}},{name:'resolveParcelAnalysis',input:{analysisId:'blocker'}}]);
});
