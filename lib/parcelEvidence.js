// Shared acquisition policy. Approval and fixed system scope are enforced by
// the caller; client capture declarations never establish authorization.
export function evidenceTypesForStage(stage) {
  if(stage==='Pre-dispatch')return ['Parcel Image'];
  if(stage==='Delivery')return ['Parcel Image','Proof of Delivery'];
  return [];
}

export function canUploadEvidence({role,shipmentStatus,stage,actorUid,assignedDriverUid}) {
  if(stage==='Pre-dispatch')return shipmentStatus==='Prepared'&&['Admin','Manager','Warehouse','Logistics'].includes(role);
  if(stage!=='Delivery'||shipmentStatus!=='Dispatched')return false;
  return ['Admin','Manager','Logistics'].includes(role)
    || role==='Driver'&&typeof actorUid==='string'&&actorUid.length>0&&actorUid===assignedDriverUid;
}

export function validateEvidenceCapture({stage,type,captureSource,capturedAtClient},nowMs=Date.now()) {
  const fail=message=>{const error=new Error(message);error.code='failed-precondition';throw error;};
  if(!evidenceTypesForStage(stage).includes(type))fail('Choose a valid evidence type for this stage.');
  if(!['file','camera'].includes(captureSource))fail('Choose a valid capture source.');
  if(captureSource==='file'){
    if(capturedAtClient!==undefined&&capturedAtClient!==null)fail('File selection cannot declare a capture time.');
    return {stage,type,captureSource,capturedAtClient:null};
  }
  if(typeof capturedAtClient!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(capturedAtClient))fail('Choose a valid client capture time.');
  const captured=Date.parse(capturedAtClient);
  if(!Number.isFinite(captured)||new Date(captured).toISOString()!==capturedAtClient||captured>nowMs+5*60*1000)fail('Client capture time is invalid or more than five minutes ahead.');
  return {stage,type,captureSource,capturedAtClient};
}
