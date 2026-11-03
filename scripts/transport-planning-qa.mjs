import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {planningEstimate,validateFleetUpdate,validateTransportRevision} from '../lib/transportPlanning.js';
import {validateCompletionOutcome} from '../lib/completionWorkflow.js';
test('great-circle estimates have correct units, symmetry, poles, antipodes and zero',()=>{
 const origin={latitude:0,longitude:0},destination={latitude:0,longitude:1},a=planningEstimate({origin,destination,speedKph:60}),b=planningEstimate({origin:destination,destination:origin,speedKph:60});
 assert.equal(a.method,'great-circle-v1');assert(Math.abs(a.distanceKm-111.19508)<.001);assert(Math.abs(a.estimatedHours-a.distanceKm/60)<1e-12);assert.deepEqual(a,b);assert.deepEqual(planningEstimate({origin,destination:origin,speedKph:5}),{method:'great-circle-v1',distanceKm:0,estimatedHours:0});
 const opposite=planningEstimate({origin,destination:{latitude:0,longitude:180},speedKph:120});assert(Math.abs(opposite.distanceKm-20015.11444)<.001);assert(Number.isFinite(planningEstimate({origin:{latitude:90,longitude:180},destination:{latitude:-90,longitude:-180},speedKph:5}).estimatedHours));
});
test('coordinates and planning speed are closed, finite and never coerced',()=>{
 const input={origin:{latitude:3,longitude:101},destination:{latitude:4,longitude:102},speedKph:60};
 for(const value of ['60',null,false,NaN,Infinity,4.9,120.1])assert.throws(()=>planningEstimate({...input,speedKph:value}));
 for(const point of [{latitude:91,longitude:0},{latitude:0,longitude:181},{latitude:'3',longitude:101},{latitude:0,longitude:0,altitude:1}])assert.throws(()=>planningEstimate({...input,origin:point}));
 assert.throws(()=>planningEstimate({...input,traffic:true}));
});
test('strict edits retain existing field limits while rejecting stale/coerced/forged input',()=>{
 const input={operationId:randomUUID(),kind:'vehicles',id:'v1',expectedVersion:1,data:{name:' abc-123 ',capacity:20,status:'Available',maintenanceDate:'2026-10-25',fuelLitres:0}};
 assert.equal(validateFleetUpdate(input).data.name,'ABC-123');for(const patch of [{expectedVersion:'1'},{ownerId:'foreign'},{kind:'suppliers'},{data:{...input.data,capacity:'20'}},{data:{...input.data,maintenanceDate:'2026-02-30'}},{data:{...input.data,status:'Scheduled'}}])assert.throws(()=>validateFleetUpdate({...input,...patch}));
});
test('transport allows explicit initial version zero and rejects ETA clamping or invalid dates',()=>{
 const input={operationId:randomUUID(),shipmentId:'s1',expectedShipmentVersion:2,expectedPlanVersion:0,vehicleId:'v1',driverId:'d1',origin:'Warehouse',carrier:'Internal',plannedDate:'2026-10-25',distanceKm:0,estimatedHours:.1,cost:0,planning:{origin:{latitude:0,longitude:0},destination:{latitude:0,longitude:0},speedKph:60}};
 const result=validateTransportRevision(input);assert.equal(result.distanceKm,0);assert.equal(result.estimatedHours,.1);assert.equal(result.planning.speedKph,60);
 for(const patch of [{estimatedHours:0},{estimatedHours:'1'},{expectedPlanVersion:-1},{plannedDate:'2026-02-30'},{destination:'forged address'},{driverUid:'other'}])assert.throws(()=>validateTransportRevision({...input,...patch}));
});
test('transport result identity and plan version must match the saved revision',()=>{
 const input={operationId:randomUUID(),shipmentId:'s1',expectedPlanVersion:2},action='reviseTransportPlan',result={state:'Completed',operationId:input.operationId,action,recordId:'s1',version:3,replayed:false};assert.deepEqual(validateCompletionOutcome(result,{input,action}),result);
 for(const patch of [{recordId:'other'},{version:2}])assert.throws(()=>validateCompletionOutcome({...result,...patch},{input,action}));
});
