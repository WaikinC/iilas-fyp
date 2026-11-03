import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {completionUUID,completionExact,completionCanonical,validateCompletionOutcome} from '../lib/completionWorkflow.js';

test('closed plain bounded JSON, UUID and canonical input identity',()=>{
 const id=randomUUID();assert.equal(completionUUID(id),id);
 for(const bad of ['',id.toUpperCase(),123,'00000000-0000-0000-0000-000000000000'])assert.throws(()=>completionUUID(bad));
 assert.deepEqual(completionExact({a:1},['a']),{a:1});
 for(const bad of [null,[],{a:1,b:2},Object.create({a:1}),{a:undefined},{a:NaN},{a:Infinity},{a:()=>0},{a:new Date()},JSON.parse('{"__proto__":1,"a":1}')])assert.throws(()=>completionExact(bad,['a']));
 const cycle={};cycle.a=cycle;assert.throws(()=>completionCanonical(cycle));
 let accessed=false;const getter={get a(){accessed=true;return 1;}};assert.throws(()=>completionCanonical(getter));assert.equal(accessed,false);
 assert.throws(()=>completionCanonical({a:'x'.repeat(32769)}));
 assert.throws(()=>completionCanonical({a:Array(1001).fill(0)}));
 assert.equal(completionCanonical({z:[2,1],a:{b:2,a:1}}),completionCanonical({a:{a:1,b:2},z:[2,1]}));
 assert.notEqual(completionCanonical({a:1}),completionCanonical({a:'1'}));
});
test('only correlated terminal results with a consistent record and version are accepted',()=>{
 const input={operationId:randomUUID()},action='updateFleetResource',result={state:'Completed',operationId:input.operationId,action,recordId:'v1',version:2,replayed:false};
 assert.deepEqual(validateCompletionOutcome(result,{input,action}),result);
 for(const patch of [{state:'Running'},{action:'other'},{operationId:randomUUID()},{recordId:null},{recordId:'../x'},{version:null},{version:0},{version:'2'},{replayed:1},{token:'private'}])assert.throws(()=>validateCompletionOutcome({...result,...patch},{input,action}));
 const cancelled={...result,state:'Cancelled',recordId:null,version:null};assert.deepEqual(validateCompletionOutcome(cancelled,{input,action}),cancelled);
 assert.throws(()=>validateCompletionOutcome({...cancelled,recordId:'v1'},{input,action}));
});
