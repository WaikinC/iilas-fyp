import{fixtureCreationData}from'./record-creation-fixtures.mjs';
import {completionCanonical,completionExact,completionUUID,completionIdentifier} from '../lib/completionWorkflow.js';
import assert from 'node:assert/strict';
import {malaysiaDay} from '../lib/procurementValidation.js';
import {createHash} from 'node:crypto';
import {validateProduct} from '../lib/validation.js';
const fail=()=>{throw Error('Cloud demo fixtures require exact approval, original-state preservation and registered ownership.');};
export const expectCloudPermissionDenied=work=>assert.rejects(work,error=>error.code==='functions/permission-denied');
export function validateCloudScenarioApproval(raw,{runId,preparationSha256,participants}){
 const a=completionExact(raw,['schema','runId','preparationSha256','actors','createAnonymousFixtures','deleteOnlyUnchangedRegisteredFixtures','temporarySecondRoles','restoreSecondRole','billingMustRemainDisabled']);
 completionUUID(runId);if(!/^[a-f0-9]{64}$/.test(preparationSha256))fail();if(Array.isArray(participants))for(const p of participants)completionIdentifier(p.uid);
 if(a.schema!=='iilas-cloud-scenario-approval-1.0'||a.runId!==runId||a.preparationSha256!==preparationSha256||a.createAnonymousFixtures!==true||a.deleteOnlyUnchangedRegisteredFixtures!==true||a.billingMustRemainDisabled!==true||a.restoreSecondRole!=='Manager'||JSON.stringify(a.temporarySecondRoles)!==JSON.stringify(['Driver','Customer'])||!Array.isArray(participants)||participants.length!==2||participants.some(p=>p.emailVerified!==true)||participants[0].uid===participants[1].uid||JSON.stringify(a.actors)!==JSON.stringify(participants.map(p=>p.uid)))fail();return true;
}
export function validateCloudFixtureDelta({before,after,records,intent}){
 if(!before||!after||!records||!intent||typeof intent.scope!=='string'||typeof intent.runTag!=='string'||!intent.runTag||!Array.isArray(intent.recordIds)||!Array.isArray(intent.recordPaths)||!Array.isArray(intent.operationIds)||!Array.isArray(intent.retainedPaths))fail();
 const retained=new Set(intent.retainedPaths);for(const path of retained){const user='users/'+intent.secondUid,prefix='auditLogs/users_'+intent.secondUid+'_';if(!intent.secondUid||path!==user&&!(path.startsWith(prefix)&&/^[1-9][0-9]*$/.test(path.slice(prefix.length))))fail();}
 for(const [path,hash]of Object.entries(before))if(!retained.has(path)&&after[path]!==hash)fail();
 const allowed=new Set(['products','uniqueKeys','procurementKeys','resourceAssignments','stockMovements','suppliers','purchaseOrders','purchaseOrderEvents','purchaseReceipts','expectedReplenishments','shipments','warehouseJobs','warehouseHandovers','transportPlans','vehicles','drivers','deliveries','deliveryEvents','evidence','auditLogs','msiEvidenceIntents','inventoryAIExperiments','inventoryDemoProductAIRequests','inventoryDemoRiskAlerts','inventoryDemoReorderRequirements','inventoryDemoReorderEvents','inventoryDemoReorderRequests','inventoryDemoProcurementLinks','inventoryDemoProcurementRequests','deliveryAIExperiments','deliveryAIRequests','deliveryAbnormalityAssessments','deliveryAssessmentRequests','deliveryReviewRequests','deliveryRiskReviews','completionRequests','integrityRequests','integrityLocks','integrityCheckRequests','integrityChecks','verificationRecords','customerShipmentGrants']);
 const ids=new Set([...intent.recordIds,...intent.operationIds,intent.runTag]),registered=new Set(intent.recordPaths);for(const path of registered){const parts=path.split('/');if(parts.length!==2||!allowed.has(parts[0])||!intent.recordIds.includes(parts[1])||Object.hasOwn(before,path))fail();}
 function references(value,depth=0){if(depth>12)fail();if(typeof value==='string')return ids.has(value)||value.split('/').some(p=>ids.has(p));if(value&&typeof value==='object')return Object.values(value).some(v=>references(v,depth+1));return false;}
 const additions=Object.keys(after).filter(path=>!Object.hasOwn(before,path)&&!retained.has(path));if(additions.length>500)fail();
 for(const path of additions){const row=records[path];if(path.split('/').length!==2||!allowed.has(path.split('/')[0])||!row||row.ownerId!==intent.scope&&row.scope!==intent.scope)fail();}
 const remaining=new Set(additions);while(remaining.size){let advanced=false;for(const path of remaining)if(registered.has(path)||references(records[path])){ids.add(path.split('/')[1]);remaining.delete(path);advanced=true;}if(!advanced)fail();}
 return additions;
}
export function cloudScenarioHashInput(value){return completionCanonical(value);}
export function cloudProductFixture(tag,kind){
 if(!/^CLOUD-[a-f0-9]{8}$/.test(tag)||!['stock','delivery'].includes(kind))fail();const suffix=kind.toUpperCase(),digits=(BigInt('0x'+createHash('sha256').update(tag+'-'+kind).digest('hex').slice(0,16))%1000000000000n).toString().padStart(12,'0');
 return validateProduct({name:'Cloud demo '+kind+' '+tag,sku:tag+'-'+suffix,barcode:'99'+digits,category:'Demo',location:'CLOUD-DEMO',reorderLevel:kind==='stock'?100:1,quantityOnHand:kind==='stock'?0:10,reservedQuantity:0,status:'Active',imageDataUrl:''});
}
function workflowContext(c){if(!c.admin?.uid||!c.manager?.uid||c.admin.uid===c.manager.uid)fail();if(['record','verifyNative','setSecondRole'].some(k=>typeof c[k]!=='function')||!c.ledger||['operation','created','check'].some(k=>typeof c.ledger[k]!=='function'))fail();return c;}
async function createCloudFixtureRecord(client,kind,data,ledger){const outcome=await client.call('createBusinessRecord',{operationId:await ledger.operation(),kind,data});assert.equal(outcome.state,'Created');return{...outcome,id:outcome.recordId};}
export async function runCloudStockWorkflow(context){
 const {admin,manager,record,ledger,verifyNative}=workflowContext(context),tag=ledger.runTag;
 let productId,experimentId,purchaseOrderId;
 await ledger.check('cloud-stock-fresh-product-and-RF14-analysis',async()=>{
  const made=await createCloudFixtureRecord(admin,'products',fixtureCreationData('products',cloudProductFixture(tag,'stock')),ledger);productId=made.id;await ledger.created('products',productId);
  const product=await record('products',productId),request={operationId:await ledger.operation(),productId,productVersion:product.version,dataUse:'demonstration',facts:{movementFrequency:30,adjustmentCount:15,daysSinceReplenishment:30,additionalFirmQuantity:1000,additionalDueDays:0,incomingQuantity:0,incomingEtaDays:null,supplyStatus:'none'}};
  const result=await admin.call('startInventoryDemoProductExperiment',request);assert.equal(result.state,'Predicted');experimentId=result.experimentId;await ledger.created('inventoryAIExperiments',experimentId);assert.equal((await admin.call('resolveInventoryDemoProductExperiment',request)).experimentId,experimentId);
  const row=await record('inventoryAIExperiments',experimentId);assert(['Reorder Risk','Critical Stock Risk'].includes(row.prediction.label));assert.equal(row.independentAccuracyValidated,false);await verifyNative('stock',row);
 });
 await ledger.check('cloud-independent-reorder-and-purchase-review-with-saved-outcome-recovery',async()=>{
  const review={operationId:await ledger.operation(),requirementId:experimentId,expectedVersion:1,decision:'Accept',notes:'Independent review of a fictional cloud demo scenario.'};await expectCloudPermissionDenied(()=>admin.call('reviewInventoryDemoReorder',review));const accepted=await manager.call('reviewInventoryDemoReorder',review);assert.equal((await manager.call('resolveInventoryDemoReorderReview',review)).eventId,accepted.eventId);
  const supplier=await admin.call('entity',{kind:'suppliers',data:{name:'Cloud demo supplier '+tag,contact:tag+'@example.test',status:'Active'}});await ledger.created('suppliers',supplier.id);
  const request={contractVersion:2,operationId:await ledger.operation(),kind:'Create',requirementId:experimentId,expectedRequirementVersion:2,acceptedEventId:accepted.eventId,purchase:{supplierId:supplier.id,expectedDate:malaysiaDay(Date.now()+86400000),items:[{productId,quantity:10,unitCost:1.25}]}};
  const purchase=await admin.call('submitInventoryDemoProcurement',request);purchaseOrderId=purchase.purchaseOrderId;await ledger.created('purchaseOrders',purchaseOrderId);assert.equal(purchase.status,'Submitted');assert.equal((await admin.call('resolveInventoryDemoProcurement',request)).purchaseOrderId,purchaseOrderId);
  const approve={operationId:await ledger.operation(),kind:'Action',purchase:{id:purchaseOrderId,version:1,step:'Approve',notes:'Independent cloud demo order approval.'}};await assert.rejects(()=>admin.call('submitInventoryDemoProcurement',approve),error=>error.code==='functions/failed-precondition');assert.equal((await manager.call('submitInventoryDemoProcurement',approve)).status,'Approved');
 });
 await ledger.check('cloud-issued-order-and-partial-full-receipts-change-only-the-new-demo-product',async()=>{
  async function action(step,extra={}){const row=await record('purchaseOrders',purchaseOrderId);return admin.call('submitInventoryDemoProcurement',{operationId:await ledger.operation(),kind:'Action',purchase:{id:purchaseOrderId,version:row.version,step,notes:'Explicit fictional cloud demo '+step,...extra}});}
  await action('Issue');assert.equal((await record('expectedReplenishments',purchaseOrderId)).outstandingQuantity,10);assert.equal((await record('products',productId)).quantityOnHand,0);
  await action('Receive',{quantities:[4],receiptReference:tag+'-PARTIAL'});assert.equal((await record('expectedReplenishments',purchaseOrderId)).outstandingQuantity,6);assert.equal((await record('products',productId)).quantityOnHand,4);
  await action('Receive',{quantities:[6],receiptReference:tag+'-FULL'});assert.equal((await record('products',productId)).quantityOnHand,10);assert.equal((await record('expectedReplenishments',purchaseOrderId)).outstandingQuantity,0);
 });return {productId,experimentId,purchaseOrderId};
}
export async function runCloudDeliveryWorkflow(context){
 const {admin,manager,record,ledger,verifyNative,setSecondRole}=workflowContext(context),tag=ledger.runTag;
 let shipmentId,experimentId;
 await ledger.check('cloud-new-shipment-warehouse-handover-and-dispatch',async()=>{
  const p=await createCloudFixtureRecord(admin,'products',fixtureCreationData('products',cloudProductFixture(tag,'delivery')),ledger);await ledger.created('products',p.id);
  const tomorrow=malaysiaDay(Date.now()+2*86400000),vehicle=await admin.call('entity',{kind:'vehicles',data:{name:tag,capacity:10,status:'Available',maintenanceDate:tomorrow,fuelLitres:20}}),driver=await admin.call('entity',{kind:'drivers',data:{name:tag,userId:manager.uid,licence:'DEMO-ONLY',status:'Available'}});await ledger.created('vehicles',vehicle.id);await ledger.created('drivers',driver.id);
  const made=await createCloudFixtureRecord(admin,'shipments',fixtureCreationData('shipments',{reference:tag+'-SHIP',recipient:'Fictional demo recipient',phone:'0123456789',address:'Fictional cloud demo destination',handoverReference:'',driver:'',status:'Draft',expectedDelivery:tomorrow,parcelCount:1,packed:false,items:[{productId:p.id,quantity:1}]}),ledger);shipmentId=made.id;await ledger.created('shipments',shipmentId);
  for(const [version,step]of ['Picking','Packed','HandedOver'].entries())await admin.call('warehouse',{shipmentId,version,data:{step,parcelCount:1,notes:'Cloud demonstration '+step}});
  await admin.call('planTransport',{shipmentId,vehicleId:vehicle.id,driverId:driver.id,origin:'Demo warehouse',carrier:'Demo carrier',distanceKm:10,estimatedHours:1,cost:10,plannedDate:malaysiaDay(Date.now())});
  const row=await record('shipments',shipmentId);await admin.call('save',{kind:'shipments',data:{...row,status:'Dispatched'},existing:{id:shipmentId,version:row.version}});assert.equal((await record('products',p.id)).quantityOnHand,9);
 });
 await ledger.check('cloud-assigned-driver-events-RF-and-independent-review',async()=>{
  await setSecondRole('Driver');try{await manager.call('delivery',{shipmentId,version:0,status:'In Transit',notes:'Fictional cloud demo departure'});await manager.call('delivery',{shipmentId,version:1,status:'Attempt Failed',notes:'Fictional cloud demo failed attempt'});}finally{await setSecondRole('Manager');}
  const request={operationId:await ledger.operation(),shipmentId,demoAcknowledged:true},result=await admin.call('startDeliveryDemoExperiment',request);assert.equal(result.state,'Predicted');experimentId=result.experimentId;await ledger.created('deliveryAIExperiments',experimentId);assert.equal((await admin.call('resolveDeliveryDemoExperiment',request)).experimentId,experimentId);
  const row=await record('deliveryAIExperiments',experimentId);assert.equal(row.independentAccuracyValidated,false);await verifyNative('delivery',row);
  const review={operationId:await ledger.operation(),targetKind:'AI',targetId:experimentId,expectedReviewVersion:0,decision:'Acknowledge',notes:'Independent review of fictional cloud delivery risk.'};await expectCloudPermissionDenied(()=>admin.call('reviewDeliveryRisk',review));const accepted=await manager.call('reviewDeliveryRisk',review);assert.equal((await manager.call('resolveDeliveryRiskReview',review)).reviewId,accepted.reviewId);
 });return {shipmentId,experimentId};
}
export async function runCloudProofWorkflow(context){
 const {admin,manager,record,ledger,setSecondRole}=workflowContext(context),shipmentId=context.shipmentId;if(!shipmentId||!admin.transport||!manager.transport)fail();
 const bytes=Buffer.from('%PDF-1.4\nAnonymous IILAS cloud demonstration proof.\n%%EOF\n'),sha=value=>createHash('sha256').update(value).digest('hex'),evidenceId=await ledger.operation();let prepared,generation;
 await ledger.check('cloud-immutable-proof-upload-and-lost-registration-acknowledgement-recovery',async()=>{
  const row=await record('shipments',shipmentId),input={operationId:await ledger.operation(),shipmentId,expectedVersion:row.version,evidenceId,stage:'Delivery',evidenceType:'Proof of Delivery',contentType:'application/pdf',bytes:bytes.length,sha256:sha(bytes),captureSource:'file',capturedAtClient:null};
  prepared=await admin.call('prepareEvidenceUpload',input);assert.deepEqual(await admin.call('prepareEvidenceUpload',input),prepared);
  await expectCloudPermissionDenied(()=>manager.transport.upload('web',prepared.intentId,new Blob([bytes],{type:'application/pdf'})));
  const metadata=await admin.transport.upload('web',prepared.intentId,new Blob([bytes],{type:'application/pdf'})),retry=await admin.transport.upload('web',prepared.intentId,new Blob([bytes],{type:'application/pdf'}));assert.equal(metadata.generation,retry.generation);generation=metadata.generation;
  const registration={id:evidenceId,shipmentId,path:prepared.path,name:ledger.runTag+'-proof.pdf',type:'Proof of Delivery',stage:'Delivery',captureSource:'file',capturedAtClient:null,intentId:prepared.intentId};const result=await admin.call('registerEvidence',registration);await ledger.created('evidence',evidenceId);assert.deepEqual(await admin.call('registerEvidence',registration),result);const data=await record('evidence',evidenceId);assert.equal(data.storageGeneration,metadata.generation);assert.equal(data.sha256,sha(bytes));assert.equal(sha(Buffer.from(await (await admin.transport.download(evidenceId)).arrayBuffer())),sha(bytes));
 });
 await ledger.check('cloud-delivery-completion-and-explicit-Customer-grant-revocation',async()=>{
  await setSecondRole('Driver');try{const row=await record('deliveries',shipmentId);await manager.call('delivery',{shipmentId,version:row.version,status:'In Transit',notes:'Fictional cloud demo retry'});const current=await record('deliveries',shipmentId);await manager.call('delivery',{shipmentId,version:current.version,status:'Delivered',proofId:evidenceId,notes:'Fictional cloud demo delivery with registered PDF proof'});}finally{await setSecondRole('Manager');}
  await setSecondRole('Customer');try{
   await expectCloudPermissionDenied(()=>manager.transport.customerProof(shipmentId));const grant={operationId:await ledger.operation(),customerUid:manager.uid,shipmentId,expectedVersion:0,shareLocation:false,notes:'Anonymous cloud software demo grant'};await admin.call('grantCustomerShipment',grant);assert.equal(sha(Buffer.from(await (await manager.transport.customerProof(shipmentId)).arrayBuffer())),sha(bytes));
   await admin.call('revokeCustomerShipment',{...grant,operationId:await ledger.operation(),expectedVersion:1,shareLocation:false,notes:'Anonymous cloud software demo revocation'});await expectCloudPermissionDenied(()=>manager.transport.customerProof(shipmentId));
  }finally{await setSecondRole('Manager');}
 });
 return {shipmentId,evidenceId,path:prepared.path,generation,bytes:bytes.length,sha256:sha(bytes),manualWalletRequired:true};
}
