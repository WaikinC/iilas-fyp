import assert from 'node:assert/strict';
import {test} from 'node:test';
import {canonicalRecord} from '../lib/integrity.js';
const policy = await import('../lib/parcelEvidence.js').catch(e => { if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e; });
const now=Date.parse('2026-10-20T10:00:00.000Z');
test('stage permission follows current status, role and assigned driver',()=>{
  assert.equal(typeof policy.canUploadEvidence,'function');
  for(const role of ['Admin','Manager','Warehouse','Logistics','Driver','Inventory','Viewer']){
    for(const stage of ['Pre-dispatch','Delivery']){
      for(const shipmentStatus of ['Draft','Prepared','Dispatched']){
        const expected=stage==='Pre-dispatch'
          ? shipmentStatus==='Prepared'&&['Admin','Manager','Warehouse','Logistics'].includes(role)
          : shipmentStatus==='Dispatched'&&['Admin','Manager','Logistics','Driver'].includes(role);
        assert.equal(policy.canUploadEvidence({role,stage,shipmentStatus,actorUid:'actor',assignedDriverUid:'actor'}),expected,`${role}/${stage}/${shipmentStatus}`);
      }
    }
  }
  assert.equal(policy.canUploadEvidence({role:'Driver',stage:'Delivery',shipmentStatus:'Dispatched',actorUid:'actor',assignedDriverUid:'other'}),false);
  assert.equal(policy.canUploadEvidence({role:'Driver',stage:'Delivery',shipmentStatus:'Dispatched'}),false);
});
test('stage types and client capture declarations are validated without inventing file time',()=>{
  assert.equal(typeof policy.validateEvidenceCapture,'function');
  assert.deepEqual(policy.evidenceTypesForStage('Pre-dispatch'),['Parcel Image']);
  assert.deepEqual(policy.evidenceTypesForStage('Delivery'),['Parcel Image','Proof of Delivery']);
  const base={stage:'Pre-dispatch',type:'Parcel Image',captureSource:'file'};
  assert.deepEqual(policy.validateEvidenceCapture(base,now),{...base,capturedAtClient:null});
  for(const change of [{stage:'Legacy'},{type:'Proof of Delivery'},{captureSource:'unknown'},{capturedAtClient:'2020-01-01T00:00:00.000Z'}])
    assert.throws(()=>policy.validateEvidenceCapture({...base,...change},now));
  const camera={...base,captureSource:'camera',capturedAtClient:'2026-10-20T10:05:00.000Z'};
  assert.deepEqual(policy.validateEvidenceCapture(camera,now),camera);
  for(const capturedAtClient of [null,'2026-10-20','bad','2026-02-30T10:00:00.000Z','2026-10-20T10:05:00.001Z'])
    assert.throws(()=>policy.validateEvidenceCapture({...camera,capturedAtClient},now));
  assert.equal(policy.validateEvidenceCapture({...camera,capturedAtClient:'2000-01-01T00:00:00.000Z'},now).capturedAtClient,'2000-01-01T00:00:00.000Z');
});
test('legacy delivery canonical bytes stay frozen while v2 binds all acquisition fields',()=>{
  const legacy={ownerId:'scope',id:'photo',shipmentId:'shipment',type:'Parcel Image',sha256:'abc',bytes:12,contentType:'image/png',actor:'actor',createdAt:{seconds:123}};
  assert.equal(canonicalRecord('delivery',legacy),'["IILAS-DELIVERY-v1","scope","photo","shipment","Parcel Image","abc",12,"image/png","actor",123000]');
  const modern={...legacy,integrityVersion:2,stage:'Pre-dispatch',captureSource:'camera',capturedAtClient:'2026-10-20T10:00:00.000Z',shipmentVersionAtRegistration:3};
  assert.equal(JSON.parse(canonicalRecord('delivery',modern))[0],'IILAS-DELIVERY-v2');
  for(const change of [{stage:'Delivery'},{captureSource:'file'},{capturedAtClient:null},{shipmentVersionAtRegistration:4}])
    assert.notEqual(canonicalRecord('delivery',modern),canonicalRecord('delivery',{...modern,...change}));
});
