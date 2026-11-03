import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {database,put,get,fingerprint} from './record-creation-command-harness.mjs';
import {validateRecordCreationInput} from '../lib/recordCreation.js';
const {executeCommand}=await import('../backend/functions/service.mjs');
const {readBusinessCodeBaseline,planBusinessCodeInitialization,applyBusinessCodeInitialization}=await import('../backend/functions/businessCodeInitialization.mjs');
const call=(action,input)=>executeCommand({uid:'admin'},{action,input});
const input=expectedDelivery=>({operationId:randomUUID(),kind:'shipments',data:{recipient:'Fictional date test',phone:'0123456789',address:'Fictional shipment date test address',expectedDelivery,parcelCount:1,items:[{productId:'p',quantity:1}]}});
async function initialize(){put('products/p',{ownerId:'scope',name:'Fictional cartons',sku:'LEGACY-P',barcode:'12345678',category:'QA',location:'A',quantityOnHand:10,reservedQuantity:0,warehouseReservedQuantity:0,reorderLevel:1,status:'Active',archived:false,version:1});const plan=planBusinessCodeInitialization(await readBusinessCodeBaseline(database,'scope'));await database.runTransaction(async tx=>(await applyBusinessCodeInitialization(tx,plan))());}

test('trusted new shipment rejects yesterday without consuming a code or changing data',async t=>{t.mock.method(Date,'now',()=>Date.parse('2026-11-02T16:00:00Z'));await initialize();const before=fingerprint();await assert.rejects(call('createBusinessRecord',input('2026-11-02')),/today or later|before today/i);assert.equal(fingerprint(),before);});

test('trusted new shipments accept Malaysia today and tomorrow',async t=>{t.mock.method(Date,'now',()=>Date.parse('2026-11-02T16:00:00Z'));await initialize();for(const day of['2026-11-03','2026-11-04']){const result=await call('createBusinessRecord',input(day));assert.equal(result.state,'Created');assert.equal(get('shipments/'+result.recordId).expectedDelivery,day);}});

test('Malaysia midnight rejects a stale fresh create but preserves the exact successful replay and resolver',async t=>{let now=Date.parse('2026-11-02T15:59:59.999Z');t.mock.method(Date,'now',()=>now);await initialize();const original=input('2026-11-02'),made=await call('createBusinessRecord',original);now=Date.parse('2026-11-02T16:00:00Z');assert.equal((await call('createBusinessRecord',original)).recordId,made.recordId);assert.equal((await call('resolveBusinessRecordCreation',{creation:original,intent:'Check'})).recordId,made.recordId);const before=fingerprint();await assert.rejects(call('createBusinessRecord',input('2026-11-02')),/today or later|before today/i);assert.equal(fingerprint(),before);});

test('historical request parsing and unresolved cancellation remain time independent',async t=>{t.mock.method(Date,'now',()=>Date.parse('2026-11-02T16:00:00Z'));await initialize();const old=input('2020-01-01');assert.equal(validateRecordCreationInput(old).data.expectedDelivery,'2020-01-01');assert.equal((await call('resolveBusinessRecordCreation',{creation:old,intent:'Check'})).state,'NotFound');assert.equal((await call('resolveBusinessRecordCreation',{creation:old,intent:'Cancel'})).state,'Cancelled');assert.equal((await call('createBusinessRecord',old)).state,'Cancelled');});

test('an existing overdue draft remains editable without changing its old date',async t=>{let now=Date.parse('2026-11-02T15:59:59.999Z');t.mock.method(Date,'now',()=>now);await initialize();const made=await call('createBusinessRecord',input('2026-11-02'));now=Date.parse('2026-11-03T16:00:00Z');const old=get('shipments/'+made.recordId);await call('save',{kind:'shipments',data:{...old,recipient:'Updated fictional recipient'},existing:{id:made.recordId,version:old.version}});assert.equal(get('shipments/'+made.recordId).expectedDelivery,'2026-11-02');assert.equal(get('shipments/'+made.recordId).recipient,'Updated fictional recipient');});
