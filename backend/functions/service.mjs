import {getDeliveryDemoContext,startDeliveryDemoExperiment,resolveDeliveryDemoExperiment,captureDeliveryAbnormality,resolveDeliveryAbnormality,reviewDeliveryRisk,resolveDeliveryRiskReview} from './deliveryDemoAI.mjs';
import {createMobileCommands} from './mobileDelivery.mjs';
import {prepareDeliveryTransition} from './deliveryWorkflow.mjs';
import {authorizeEvidence,prepareEvidenceRegistration} from './evidenceRegistration.mjs';
import {createIntegrityCommands} from './integrityWorkflow.mjs';
import {createFleetTransportCommands} from './fleetTransport.mjs';
import {fleetComplianceDates,fleetScheduleDay,requireFleetEligibility} from './transportPlanning.js';
import {createCustomerCommands} from './customerAccess.mjs';
import {createCustomerOrderCommands,prepareCustomerOrderShipmentDeletion} from './customerOrders.mjs';
import {createCustomerProofIntegrity} from './customerProofIntegrity.mjs';
import {createReportingCommands} from './reporting.mjs';
import {createRecordCreationCommands} from './recordCreation.mjs';
import {preparePurchaseTransition,writePurchaseTransition} from './purchaseOrderWorkflow.mjs';
import {createInventoryDemoProcurementCommands} from './inventoryDemoProcurement.mjs';
import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {evidenceFile} from './evidenceProvider.mjs';
import {prepareMsiWebEvidence,reconcileMsiWebEvidence,registerMsiWebEvidence} from './msiEvidenceUploads.mjs';
import {createHash, randomUUID} from 'node:crypto';
import {locationBalances,applyLocationMovement,allocateLocations,correctionMovement} from './locationStock.js';
import {canonicalRecord} from './integrity.js';
import {validateEvidenceCapture} from './parcelEvidence.js';
import {validateProduct, validateShipment, validateNewShipmentDate, validateStockMovement, validateStockRequest, validateWarehouseStep} from './validation.js';
import {validateSupplier,validatePurchaseCommand,inputText,inputNumber,supplierIdentity,onlyFields} from './procurementValidation.js';
import {startParcelAnalysis,resolveParcelAnalysis,cleanupParcelAnalysis,reviewParcelAnalysis,reviewLinkedParcelPrediction} from './parcelAnalysis.mjs';
import {startParcelLiveSession,reserveParcelLiveFrame,analyseParcelLiveFrame,resolveParcelLiveSession,resolveParcelLiveFrame,stopParcelLiveSession,cleanupParcelLiveSession,reviewParcelLiveFrame} from './parcelLive.mjs';
import {runParcelLiveOperation,guardParcelLiveTransaction} from './parcelLiveDeadline.mjs';
import {getInventoryAssessment,captureInventorySnapshot,resolveInventorySnapshot,reviewInventorySnapshot,resolveInventoryReview} from './inventoryRisk.mjs';
import {recoverInventoryExperiment as startInventoryExperiment,resolveInventoryExperiment,getInventoryAIReadiness} from './inventoryAI.mjs';
import {startInventoryContextExperiment,resolveInventoryContextExperiment} from './inventoryContextAI.mjs';
import {getInventoryDemoProductContext,startInventoryDemoProductExperiment,resolveInventoryDemoProductExperiment} from './inventoryDemoProductAI.mjs';
import {getInventoryDemoReorderAvailability,reviewInventoryDemoReorder,resolveInventoryDemoReorderReview} from './inventoryDemoReorder.mjs';

import {registerAccount,updateAccount,approvedScope,approvedTransaction} from './access.mjs';
import {prepareStockReference,saveStockReference} from './stockReference.mjs';
const permissions = {
  products:['Admin','Manager','Inventory'], stock:['Admin','Manager','Inventory','Warehouse'],
  warehouse:['Admin','Manager','Warehouse'], shipments:['Admin','Manager','Logistics'],
  procurement:['Admin','Manager','Inventory'], approve:['Admin','Manager'], fleet:['Admin','Manager','Logistics'],
  delivery:['Admin','Manager','Logistics','Driver'], evidence:['Admin','Manager','Warehouse','Logistics','Driver'], admin:['Admin'], reports:['Admin','Manager'],
};
const fail=(message,code='failed-precondition')=>{ const error=new Error(message); error.code=code; throw error; };
const text=(value,label,max=120,min=1)=>inputText(value,label,max,min,true);
const id=(value)=>{const s=text(value,'Record ID',128);if(!/^[a-zA-Z0-9_-]+$/.test(s))fail('Invalid record ID.');return s;};
const number=(value,label,min=0,max=1000000,integer=false)=>inputNumber(value,label,min,max,integer);
const day=value=>{const s=text(value,'Date',10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)fail('Choose a valid date.');return s;};
const hash=value=>createHash('sha256').update(value).digest('hex');
const now=()=>FieldValue.serverTimestamp();
const scoped=(snapshot,scope)=>{if(!snapshot.exists||snapshot.data().ownerId!==scope)fail('Record not found in the shared system.','not-found');return snapshot.data();};
const expect=(record,version)=>{if(record.version!==version)fail('This record changed. Refresh and try again.');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const database=()=>getFirestore();
const ref=(kind,key)=>database().collection(kind).doc(id(key));
const audit=(tx,scope,actor,kind,key,action,version,label)=>{
  const eventId=`${kind}_${key}_${version}`;
  tx.set(ref('auditLogs',eventId),{ownerId:scope,actor,kind,recordId:key,action,version,label:String(label).slice(0,240),at:now()});
  return eventId;
};
async function run(auth,scope,permission,work){
  scope=id(scope);
  return approvedTransaction(auth,permissions[permission]||[],async(tx,config,member)=>{
    if(scope!==config.dataScopeId)fail('The system data source cannot be changed by a client.','permission-denied');
    return work(tx,scope,auth.uid,member);
  });
}

function stockWrite(tx,scope,actor,productId,product,input,warehouseOperation=false){
  const movement=validateStockMovement({...input,productId});
  if(product.archived||product.status!=='Active')fail('Choose an active product.');
  const changed=applyLocationMovement(product,movement,{warehouse:warehouseOperation,allocations:input.allocations,consumeReserved:input.consumeReserved===true});
  const movementId=randomUUID(),version=product.version+1;
  tx.update(ref('products',productId),{quantityOnHand:changed.quantityOnHand,reservedQuantity:changed.reservedQuantity,warehouseReservedQuantity:changed.warehouseReservedQuantity,location:changed.location,locationBalances:changed.locationBalances,version,updatedAt:now(),updatedBy:actor,lastStockMovementId:movementId,lastEventId:`products_${productId}_${version}`});
  tx.set(ref('stockMovements',movementId),{ownerId:scope,actor,productId,productName:product.name,sku:product.sku,type:input.correctionOf?'Correction':movement.type,reversesType:input.correctionOf?movement.type:null,quantity:movement.quantity,quantityChange:changed.quantityChange,reservedChange:changed.reservedChange,quantityBefore:product.quantityOnHand,quantityAfter:changed.quantityOnHand,reservedBefore:product.reservedQuantity||0,reservedAfter:changed.reservedQuantity,locationFrom:changed.locationFrom,locationTo:changed.locationTo,allocations:changed.allocations,locationChanges:changed.locationChanges,reference:movement.reference,reason:movement.reason,createdAt:now(),productVersion:version,origin:input.correctionOf?'Correction':input.purchaseOrderId?'Procurement':warehouseOperation?'Warehouse':'Manual',integrityVersion:2,...(input.shipmentId?{shipmentId:input.shipmentId}:{}),...(input.purchaseOrderId?{purchaseOrderId:input.purchaseOrderId,purchaseReceiptId:input.purchaseReceiptId}:{}),...(input.correctionOf?{correctionOf:input.correctionOf,approvalId:input.approvalId}:{})});
  audit(tx,scope,actor,'products',productId,input.correctionOf?'Correction':movement.type,version,`${input.correctionOf?'Correction':movement.type}: ${movement.quantity} × ${product.name}`);
  return movementId;
}
const {getInventoryDemoProcurementAvailability,submitInventoryDemoProcurement,resolveInventoryDemoProcurement}=createInventoryDemoProcurementCommands({stockWrite});
async function stockRequest(auth,scope,input,resolve=false){
  let data;
  try { data=validateStockRequest(input); }
  catch(error){error.stockRequestNotApplied=true;throw error;}
  return run(auth,scope,'stock',async(tx,s,actor,member)=>{
    // Receipt, balance, movement and audit commit together. Recheck the caller's
    // current approval/role on every replay; receipts are private to the server.
    try {
      const receiptRef=ref('stockRequests',hash(JSON.stringify([s,actor,data.operationId])));
      const commandHash=hash(JSON.stringify(data)),receipt=await tx.get(receiptRef);
      if(receipt.exists){
        const saved=receipt.data();
        if(saved.ownerId!==s||saved.actor!==actor||saved.commandHash!==commandHash)fail('This operation ID belongs to a different stock movement.');
        return {...saved.result,replayed:true};
      }
      let result;
      if(resolve){
        // A tombstone serialises with any in-flight submit. A late retry cannot
        // apply an operation that was confirmed as unapplied by this transaction.
        result={notApplied:true};
      }else{
        const product=scoped(await tx.get(ref('products',data.productId)),s);
        if(data.type==='Correction'){
          const original=scoped(await tx.get(ref('stockMovements',data.correctionOf)),s),linkRef=ref('stockCorrectionLinks',data.correctionOf),claim=await tx.get(linkRef);
          if(original.productId!==data.productId)fail('Original movement belongs to another product.');
          if(claim.exists&&claim.data().status!=='Rejected')fail('This movement already has a pending or approved correction.');
          const movement=correctionMovement(original,data.reason,data.reference);
          if(product.archived||product.status!=='Active')fail('Choose an active product.');
          applyLocationMovement(product,movement);
          const reference=await prepareStockReference(tx,database(),{...data,scope:s});
          const key=randomUUID();
          tx.set(ref('approvals',key),{ownerId:s,kind:'Correction',productId:data.productId,correctionOf:data.correctionOf,input:movement,originalType:original.type,status:'Pending',requestedBy:actor,createdAt:now(),version:1});
          tx.set(linkRef,{ownerId:s,originalMovementId:data.correctionOf,productId:data.productId,approvalId:key,status:'Pending',requestedBy:actor,createdAt:now()});
          saveStockReference(tx,reference,s,actor,'Pending',key);
          audit(tx,s,actor,'approvals',key,'Request',1,`Correction of ${data.correctionOf}: ${product.name}`);
          result={id:key,pendingApproval:true};
        }else if(data.type==='Adjustment'&&!['Admin','Manager'].includes(member.role)){
          if(product.archived||product.status!=='Active')fail('Choose an active product.');
          const key=randomUUID(),movement={...validateStockMovement(data),locationFrom:data.locationFrom||product.location};
          applyLocationMovement(product,movement);
          const reference=await prepareStockReference(tx,database(),{...data,scope:s});
          tx.set(ref('approvals',key),{ownerId:s,kind:'Adjustment',productId:data.productId,input:movement,status:'Pending',requestedBy:actor,createdAt:now(),version:1});
          saveStockReference(tx,reference,s,actor,'Pending',key);
          audit(tx,s,actor,'approvals',key,'Request',1,`Adjustment: ${product.name}`);
          result={id:key,pendingApproval:true};
        }else{
          const reference=await prepareStockReference(tx,database(),{...data,scope:s});
          const movementId=stockWrite(tx,s,actor,data.productId,product,data);
          saveStockReference(tx,reference,s,actor,'Committed',movementId);
          result={id:movementId};
        }
      }
      tx.create(receiptRef,{ownerId:s,actor,operationId:data.operationId,commandHash,state:resolve?'Cancelled':'Completed',result,createdAt:now()});
      return result;
    }catch(error){
      // Only errors before the transaction commits are definitive. Transport or
      // commit errors outside this callback must retain the browser retry intent.
      error.stockRequestNotApplied=true;throw error;
    }
  });
}
const stock=(auth,scope,input)=>stockRequest(auth,scope,input);
const resolveStock=(auth,scope,input)=>stockRequest(auth,scope,input,true);
async function approval(auth,scope,input){
  return run(auth,scope,'approve',async(tx,s,actor)=>{
    const key=id(input.id),request=scoped(await tx.get(ref('approvals',key)),s);
    expect(request,input.version);if(request.status!=='Pending')fail('This request was already reviewed.');
    const product=scoped(await tx.get(ref('products',request.productId)),s);
    if(!['Approve','Reject'].includes(input.decision))fail('Choose a review decision.');
    if(actor===request.requestedBy)fail('Another manager must review your own request.');
    let original,link;
    if(request.kind==='Correction'){
      original=scoped(await tx.get(ref('stockMovements',request.correctionOf)),s);
      link=scoped(await tx.get(ref('stockCorrectionLinks',request.correctionOf)),s);
      if(link.approvalId!==key||link.status!=='Pending')fail('Correction was already reviewed or superseded.');
      if(original.productId!==request.productId)fail('Correction product does not match the original movement.');
    }
    const reference=await prepareStockReference(tx,database(),{scope:s,productId:request.productId,type:request.kind,
      reference:request.input?.reference,approvalId:key,reject:input.decision==='Reject'});
    let movementId=null;
    if(input.decision==='Approve'){
      movementId=stockWrite(tx,s,actor,request.productId,product,request.kind==='Correction'?{...correctionMovement(original,request.input.reason,request.input.reference),correctionOf:request.correctionOf,approvalId:key}:request.input);
      saveStockReference(tx,reference,s,actor,'Committed',movementId);
    }else if(reference)tx.delete(reference);
    if(link)tx.update(ref('stockCorrectionLinks',request.correctionOf),{status:input.decision==='Approve'?'Approved':'Rejected',reviewedBy:actor,reviewedAt:now(),movementId});
    tx.update(ref('approvals',key),{status:input.decision==='Approve'?'Approved':'Rejected',movementId,reviewedBy:actor,reviewedAt:now(),notes:text(input.notes,'Review notes',240,3),version:request.version+1});
    audit(tx,s,actor,'approvals',key,input.decision,request.version+1,request.kind);
    return {id:key};
  });
}
async function prepareRecordSave(tx,{scope:s,actor,kind,recordId:key,data:sourceData,existing}){
  if(!['products','shipments'].includes(kind))fail('Invalid record kind.');
  const input={data:sourceData,existing};
    // Each retry needs fresh data because shipment items are enriched below.
    const recordRef=ref(kind,key),snap=await tx.get(recordRef),old=snap.exists?scoped(snap,s):null;
    if(input.existing){if(!old)fail('Record not found.');expect(old,input.existing.version);const field=kind==='products'?'sku':'reference';if(input.data[field]!==old[field])fail('The stored business code is locked and cannot change.');}else if(old)fail('The generated record identity already exists.');
    const data=kind==='products'?validateProduct(input.data):validateShipment(input.data,100);
    if(kind==='shipments'&&!old)validateNewShipmentDate(data.expectedDelivery);
    if(old)data[kind==='products'?'sku':'reference']=old[kind==='products'?'sku':'reference'];
    const newKeys=kind==='products'?[`${s}_sku_${data.sku.trim().toUpperCase()}`,`${s}_barcode_${data.barcode}`]:[`${s}_shipment_${data.reference.trim().toUpperCase()}`];
    const keySnaps=await Promise.all(newKeys.map(k=>tx.get(ref('uniqueKeys',k))));
    if(keySnaps.some(v=>v.exists&&v.data().recordId!==key))fail('That SKU, barcode, or shipment reference is already registered.');
    let products=[];
    let warehouse;
    if(kind==='products'){
      const barcodeMatches=await tx.get(database().collection('products').where('ownerId','==',s).where('barcode','==',data.barcode).limit(2));
      if(barcodeMatches.docs.some(d=>d.id!==key))fail('That barcode is already registered.');
      if(old?.archived)fail('Archived products cannot be edited.');
      if(old&&(data.quantityOnHand!==old.quantityOnHand||data.reservedQuantity!==(old.reservedQuantity||0)||data.location!==old.location))fail('Use Stock Management to change balances and locations.');
      if(old?.warehouseReservedQuantity>0&&data.status!=='Active')fail('Complete or cancel warehouse allocations before deactivating the product.');
      if(!old&&data.reservedQuantity!==0)fail('New products start without reserved stock.');
    }else{
      warehouse=await tx.get(ref('warehouseHandovers',key));
      if(!old&&data.status!=='Draft')fail('Create a Draft shipment first.');
      if(old?.status==='Dispatched')fail('Dispatched shipments are locked.');
      if(old?.status==='Draft'&&warehouse.exists&&warehouse.data().status!=='Cancelled')fail('Warehouse work has started. Complete or cancel it.');
      if((!old||old.status==='Draft')&&data.status!=='Draft')fail('Complete Warehouse Operations before dispatch.');
      if(old?.status==='Prepared'){
        if(!['Prepared','Dispatched'].includes(data.status)||data.reference!==old.reference||data.parcelCount!==old.parcelCount||!same(data.items,old.items.map(({productId,quantity})=>({productId,quantity}))))fail('Prepared items and packing details are locked.');
        data.packed=old.packed;data.handoverReference=old.handoverReference;
      }else{data.packed=false;data.handoverReference='';}
      products=await Promise.all(data.items.map(item=>tx.get(ref('products',item.productId))));
      const scheduled=await tx.get(ref('transportPlans',key));
      if(scheduled.data()?.status==='Scheduled'&&(data.address!==old?.address||data.expectedDelivery!==old?.expectedDelivery))fail('Cancel the schedule before changing its destination or delivery date.');
      data.driver=old?.driver||'';
      if(data.status==='Dispatched'){
        const plan=scoped(await tx.get(ref('transportPlans',key)),s);
        const vehicle=scoped(await tx.get(ref('vehicles',plan.vehicleId)),s),driver=scoped(await tx.get(ref('drivers',plan.driverId)),s);
        const member=await tx.get(ref('users',plan.driverUid));
        if(plan.status!=='Scheduled'||vehicle.status!=='Available'||vehicle.capacity<data.parcelCount||driver.status!=='Available'||!member.data()?.active||!['Driver','Logistics','Manager','Admin'].includes(member.data().role))fail('Schedule an available vehicle and active driver before dispatch.');
        requireFleetEligibility(vehicle,driver,fleetScheduleDay());
        data.driver=plan.driverName;
      }
      data.items=data.items.map((item,index)=>{
        const product=scoped(products[index],s);
        if(product.status!=='Active'||product.archived)fail('Shipment products must be active.');
        const allocated=warehouse?.data()?.reservationsHeld?item.quantity:0;
        if(data.status==='Dispatched'&&(product.quantityOnHand-(product.reservedQuantity||0)+allocated<item.quantity||(allocated&&(product.warehouseReservedQuantity||0)<allocated)))fail(`Not enough allocated stock for ${product.name}.`);
        return {...item,name:old?.status==='Prepared'?old.items[index].name:product.name,sku:old?.status==='Prepared'?old.items[index].sku:product.sku};
      });
    }
    const version=(old?.version||0)+1;

    return{apply(){
    if(old){const oldKeys=kind==='products'?[`${s}_sku_${old.sku.trim().toUpperCase()}`,`${s}_barcode_${old.barcode}`]:[`${s}_shipment_${old.reference.trim().toUpperCase()}`];for(const k of oldKeys.filter(k=>!newKeys.includes(k)))tx.delete(ref('uniqueKeys',k));}
    newKeys.forEach((k,index)=>{if(!keySnaps[index].exists)tx.set(ref('uniqueKeys',k),{ownerId:s,kind,recordId:key});});
    const eventId=audit(tx,s,actor,kind,key,old?'Update':'Create',version,data.name||data.reference);
    tx.set(recordRef,{...data,ownerId:s,version,updatedBy:actor,updatedAt:now(),createdAt:old?.createdAt||now(),lastEventId:eventId,...(kind==='products'?{archived:false,locationBalances:old?locationBalances(old):[{location:data.location,quantity:data.quantityOnHand,reserved:0,warehouse:0}],warehouseReservedQuantity:old?.warehouseReservedQuantity||0,lastStockMovementId:old?.lastStockMovementId||null,lastShipmentId:old?.lastShipmentId||null}:{dispatchedAt:data.status==='Dispatched'?now():null,...(old?.handoverId?{handoverId:old.handoverId}:{}),...(old?.driverUid?{driverUid:old.driverUid}:{}),...(old?.customerOrderId?{customerOrderId:old.customerOrderId}:{})})});
    const dispatchMovements=[];
    if(kind==='shipments'&&data.status==='Dispatched')data.items.forEach((item,index)=>{
      const p=products[index].data();
      const held=warehouse?.data()?.reservationsHeld===true;
      const allocation=held?(warehouse.data().items.find(i=>i.productId===item.productId)?.allocations||[{location:p.location,quantity:item.quantity}]):allocateLocations(p,item.quantity);
      dispatchMovements.push(stockWrite(tx,s,actor,item.productId,p,{type:'Issue',quantity:item.quantity,reference:data.reference,reason:'Dispatch of prepared shipment',shipmentId:key,allocations:allocation,consumeReserved:held},true));
      tx.update(products[index].ref,{lastShipmentId:key});
    });
    if(dispatchMovements.length&&warehouse?.exists){const job=warehouse.data();tx.update(warehouse.ref,{reservationsHeld:false,dispatchConsumedAt:now(),dispatchMovementIds:dispatchMovements,version:job.version+1,lastEventId:audit(tx,s,actor,'warehouseHandovers',key,'Dispatch',job.version+1,data.reference)});}
    return {id:key};

    }};
}
async function save(auth,scope,input){
  if(!input.existing?.id)fail('Business codes are assigned automatically. Refresh and use the new creation form.');
  const kind=input.kind,key=id(input.existing.id);if(!['products','shipments'].includes(kind))fail('Invalid record kind.');
  return run(auth,scope,kind,async(tx,s,actor)=>{const prepared=await prepareRecordSave(tx,{scope:s,actor,kind,recordId:key,data:input.data,existing:input.existing});return prepared.apply();});
}
async function preparePurchaseCreate(tx,{scope,actor,member,recordId,data,allocation}){
  const snap=await tx.get(ref('purchaseOrders',recordId));if(snap.exists)fail('The generated purchase identity already exists.');
  const command=validatePurchaseCommand({...data,reference:allocation.code});
  const prepared=await preparePurchaseTransition(tx,{scope,actor,member,command,orderId:recordId,old:null,codeAllocation:allocation});
  return{apply:()=>writePurchaseTransition(tx,prepared,{stockWrite})};
}
async function remove(auth,scope,input){
  const kind=input.kind;if(!['products','shipments'].includes(kind))fail('Invalid record kind.');
  return run(auth,scope,kind,async(tx,s,actor)=>{
    const key=id(input.existing.id),snapshot=await tx.get(ref(kind,key)),old=scoped(snapshot,s);expect(old,input.existing.version);
    if(kind==='shipments'){
      const warehouse=await tx.get(ref('warehouseHandovers',key));
      const plan=await tx.get(ref('transportPlans',key));
      if(plan.exists&&plan.data().status==='Scheduled')fail('Cancel the transport plan before deleting the shipment.');
      if(old.status!=='Draft'||warehouse.exists&&warehouse.data().status!=='Cancelled')fail('Only Draft shipments without active warehouse work can be deleted.');
      const cancelLinkedOrder=await prepareCustomerOrderShipmentDeletion(tx,{scope:s,actor,shipmentId:key,shipment:old});cancelLinkedOrder();
      tx.delete(snapshot.ref);tx.delete(ref('uniqueKeys',`${s}_shipment_${old.reference}`));
    }else{
      if(old.reservedQuantity>0)fail('Release stock reservations before archiving this product.');
      const shipments=await tx.get(database().collection('shipments').where('ownerId','==',s));
      if(shipments.docs.some(d=>d.data().status!=='Dispatched'&&d.data().items.some(i=>i.productId===key)))fail('Complete or delete open shipments before archiving this product.');
      tx.update(snapshot.ref,{archived:true,version:old.version+1,updatedBy:actor,updatedAt:now()});
    }
    audit(tx,s,actor,kind,key,kind==='products'?'Archive':'Delete',old.version+1,old.name||old.reference);
    return {id:key};
  });
}
async function warehouse(auth,scope,input){
  const key=id(input.shipmentId),data=validateWarehouseStep(input.data);
  return run(auth,scope,'warehouse',async(tx,s,actor)=>{
    const shipment=scoped(await tx.get(ref('shipments',key)),s);
    const oldSnapshot=await tx.get(ref('warehouseHandovers',key)),old=oldSnapshot.exists?scoped(oldSnapshot,s):null;
    if(shipment.status!=='Draft')fail('Only Draft shipments can be prepared.');
    if((old?.version||0)!==input.version)fail('Warehouse record changed.');
    const expected=old?.status==='Picking'?'Packed':old?.status==='Packed'?'HandedOver':!old||old.status==='Cancelled'?'Picking':null;
    if(data.step!==expected)fail('Complete warehouse steps in order.');
    const products=await Promise.all(shipment.items.map(item=>tx.get(ref('products',item.productId))));
    shipment.items.forEach((item,index)=>{const p=scoped(products[index],s);if(p.archived||p.status!=='Active'||p.quantityOnHand-(p.reservedQuantity||0)+(old?.reservationsHeld?item.quantity:0)<item.quantity)fail('Not enough available stock for warehouse work.');});
    const allocationItems=data.step==='Picking'?shipment.items.map((item,index)=>({...item,allocations:allocateLocations(products[index].data(),item.quantity)})):(old?.items||shipment.items);
    if(data.step==='Picking')allocationItems.forEach((item,index)=>stockWrite(tx,s,actor,item.productId,products[index].data(),{type:'Reservation',quantity:item.quantity,reference:shipment.reference,reason:'Warehouse picking allocation',shipmentId:key,allocations:item.allocations},true));
    const version=(old?.version||0)+1,reference=`PS-${shipment.reference}`;
    const restart=!old||old.status==='Cancelled';
    const payload={ownerId:s,shipmentId:key,reference,items:allocationItems,status:data.step,reservationsHeld:data.step==='Picking'||old?.reservationsHeld===true,notes:data.notes,parcelCount:old?.status==='Packed'?old.parcelCount:data.parcelCount,version,createdAt:old?.createdAt||now(),updatedAt:now(),updatedBy:actor,pickedBy:restart?actor:old.pickedBy,pickedAt:restart?now():old.pickedAt,packedBy:restart?null:old.packedBy,packedAt:restart?null:old.packedAt,handedOverBy:null,handedOverAt:null};
    if(data.step==='Packed'){payload.packedBy=actor;payload.packedAt=now();}
    if(data.step==='HandedOver'){
      payload.handedOverBy=actor;payload.handedOverAt=now();
      const shipmentVersion=shipment.version+1,event=audit(tx,s,actor,'shipments',key,'Prepared',shipmentVersion,shipment.reference);
      tx.update(ref('shipments',key),{status:'Prepared',packed:true,parcelCount:payload.parcelCount,handoverId:key,handoverReference:reference,version:shipmentVersion,updatedAt:now(),updatedBy:actor,lastEventId:event});
    }
    payload.lastEventId=audit(tx,s,actor,'warehouseHandovers',key,data.step,version,reference);
    tx.set(ref('warehouseHandovers',key),payload);return {id:key};
  });
}
async function cancelWarehouse(auth,scope,input){
  return run(auth,scope,'warehouse',async(tx,s,actor)=>{
    const key=id(input.shipmentId),shipment=scoped(await tx.get(ref('shipments',key)),s),job=scoped(await tx.get(ref('warehouseHandovers',key)),s);
    expect(job,input.version);if(shipment.status!=='Draft'||!['Picking','Packed'].includes(job.status))fail('Cancel before completing the prepared handover.');
    const notes=text(input.notes,'Cancellation notes',240,3),products=await Promise.all(job.items.map(i=>tx.get(ref('products',i.productId))));
    if(job.reservationsHeld)job.items.forEach((item,index)=>stockWrite(tx,s,actor,item.productId,scoped(products[index],s),{type:'Release',quantity:item.quantity,reference:shipment.reference,reason:notes,shipmentId:key,allocations:item.allocations||[{location:products[index].data().location,quantity:item.quantity}]},true));
    const event=audit(tx,s,actor,'warehouseHandovers',key,'Cancel',job.version+1,notes);
    tx.update(ref('warehouseHandovers',key),{status:'Cancelled',reservationsHeld:false,notes,cancelledAt:now(),cancelledBy:actor,version:job.version+1,lastEventId:event,updatedAt:now(),updatedBy:actor});return {id:key};
  });
}

function entityData(kind,input){
  if(kind==='suppliers')return validateSupplier(input);
  if(kind==='vehicles')return {name:text(input.name,'Registration',40).toUpperCase(),capacity:number(input.capacity,'capacity',1,100000,true),status:text(input.status,'Vehicle status',20),maintenanceDate:day(input.maintenanceDate),fuelLitres:number(input.fuelLitres,'fuel',0,10000)};
  if(kind==='drivers')return {name:text(input.name,'Driver name'),userId:id(input.userId),licence:text(input.licence,'Licence',80),status:text(input.status,'Driver status',20)};
  fail('Unsupported record kind.');
}
async function entity(auth,scope,input){
  const kind=input.kind;
  if(kind==='suppliers'){onlyFields(input,['kind','data',...(input.id?['id','version']:[])],'Supplier command');if(input.id)inputNumber(input.version,'supplier version',1,Number.MAX_SAFE_INTEGER,true);}
  const data=entityData(kind,input.data),permission=kind==='suppliers'?'procurement':'fleet';
  if(kind==='vehicles'&&!['Available','Maintenance','Unavailable'].includes(data.status))fail('Invalid vehicle status.');
  if(kind==='drivers'&&!['Available','Unavailable'].includes(data.status))fail('Invalid driver status.');
  return run(auth,scope,permission,async(tx,s,actor)=>{
    const key=input.id?id(input.id):randomUUID(),snap=await tx.get(ref(kind,key)),old=snap.exists?scoped(snap,s):null;
    if(input.id&&!old)fail('Record not found in the shared system.','not-found');
    if(old)expect(old,input.version);
    let supplierKey,supplierOldKey;
    if(kind==='suppliers'){
      supplierKey=`supplier_${hash(JSON.stringify([s,...supplierIdentity(data.name,data.contact)]))}`;
      supplierOldKey=old?`supplier_${hash(JSON.stringify([s,...supplierIdentity(old.name,old.contact)]))}`:null;
      const savedKey=await tx.get(ref('procurementKeys',supplierKey));
      const legacy=await tx.get(database().collection('suppliers').where('ownerId','==',s));
      if((savedKey.exists&&savedKey.data().recordId!==key)||legacy.docs.some(d=>d.id!==key&&same(supplierIdentity(d.data().name,d.data().contact),supplierIdentity(data.name,data.contact))))fail('This supplier name and contact are already registered. Edit the existing supplier.');
    }
    const uniqueKey=kind==='vehicles'?`${s}_vehicle_${hash(data.name.replace(/[\s-]/g,''))}`:kind==='drivers'?`${s}_driver_${data.userId}`:null;
    const unique=uniqueKey?await tx.get(ref('uniqueKeys',uniqueKey)):null;
    if(unique?.exists&&unique.data().recordId!==key)fail('This vehicle registration or driver account is already registered.');
    if(old&&['vehicles','drivers'].includes(kind)){
      const lock=await tx.get(ref('resourceAssignments',`${s}_${kind==='vehicles'?'vehicle':'driver'}_${key}`));
      if(lock.exists)fail('Complete or cancel the assigned transport before editing this resource.');
    }
    if(kind==='drivers'){
      const member=await tx.get(ref('users',data.userId));
      if(!member.exists||!member.data().active||!['Driver','Logistics','Manager','Admin'].includes(member.data().role))fail('Select an active delivery team member.');
    }
    const version=(old?.version||0)+1,dates=kind==='suppliers'?{}:fleetComplianceDates(kind,input.data,old??{});
    if(supplierKey){
      if(supplierOldKey&&supplierOldKey!==supplierKey)tx.delete(ref('procurementKeys',supplierOldKey));
      tx.set(ref('procurementKeys',supplierKey),{ownerId:s,kind:'supplier',recordId:key});
    }
    if(uniqueKey){if(old){const oldKey=kind==='vehicles'?`${s}_vehicle_${hash(old.name.replace(/[\s-]/g,''))}`:`${s}_driver_${old.userId}`;if(oldKey!==uniqueKey)tx.delete(ref('uniqueKeys',oldKey));}tx.set(ref('uniqueKeys',uniqueKey),{ownerId:s,kind,recordId:key});}
    tx.set(ref(kind,key),{...data,...dates,ownerId:s,version,createdAt:old?.createdAt||now(),updatedAt:now(),updatedBy:actor});
    audit(tx,s,actor,kind,key,old?'Update':'Create',version,data.name);return {id:key};
  });
}
async function purchaseOrder(auth,scope,input){
  if(!input.id)fail('Purchase references are assigned automatically. Refresh and use the new creation form.');
  const command=validatePurchaseCommand(input),orderId=command.id||randomUUID();
  const permission=['Approve','Reject'].includes(command.step)?'approve':command.step==='Receive'?'stock':'procurement';
  return run(auth,scope,permission,async(tx,s,actor,member)=>{
    const snap=await tx.get(ref('purchaseOrders',orderId)),old=snap.exists?scoped(snap,s):null;
    if(old&&Object.hasOwn(old,'demoReorderSource'))fail('Use the linked demo purchase recovery workflow for this order.');
    const prepared=await preparePurchaseTransition(tx,{scope:s,actor,member,command,orderId,old});
    return writePurchaseTransition(tx,prepared,{stockWrite});
  });
}
async function planTransport(auth,scope,input){
  return run(auth,scope,'fleet',async(tx,s,actor)=>{
    const key=id(input.shipmentId),shipment=scoped(await tx.get(ref('shipments',key)),s);
    const vehicle=scoped(await tx.get(ref('vehicles',id(input.vehicleId))),s),driver=scoped(await tx.get(ref('drivers',id(input.driverId))),s);
    const member=await tx.get(ref('users',driver.userId));
    const existing=await tx.get(ref('transportPlans',key));
    const vehicleLock=await tx.get(ref('resourceAssignments',`${s}_vehicle_${input.vehicleId}`)),driverLock=await tx.get(ref('resourceAssignments',`${s}_driver_${input.driverId}`));
    if(existing.exists&&existing.data().status!=='Cancelled')fail('This shipment already has a transport plan.');
    if(shipment.status!=='Prepared'||vehicle.status!=='Available'||driver.status!=='Available'||!member.exists||!member.data().active||!['Driver','Logistics','Manager','Admin'].includes(member.data().role))fail('Choose a prepared shipment, available vehicle, and active driver.');
    if(vehicle.capacity<shipment.parcelCount)fail('Vehicle capacity is insufficient.');
    if(vehicleLock.exists||driverLock.exists)fail('The vehicle or driver is assigned to another delivery.');
    const plannedDate=day(input.plannedDate);
    requireFleetEligibility(vehicle,driver,fleetScheduleDay(plannedDate));
    const data={ownerId:s,shipmentId:key,vehicleId:input.vehicleId,vehicleName:vehicle.name,driverId:input.driverId,driverUid:driver.userId,driverName:driver.name,origin:text(input.origin,'Origin',240),destination:shipment.address,carrier:text(input.carrier,'Carrier',120),distanceKm:number(input.distanceKm,'distance',0,100000),estimatedHours:number(input.estimatedHours,'ETA hours',0.1,1000),cost:number(input.cost,'cost',0,1000000),plannedDate,status:'Scheduled',version:(existing.data()?.version||0)+1,createdAt:existing.data()?.createdAt||now(),updatedAt:now(),updatedBy:actor};
    tx.set(ref('transportPlans',key),data);
    tx.set(ref('resourceAssignments',`${s}_vehicle_${input.vehicleId}`),{ownerId:s,shipmentId:key});tx.set(ref('resourceAssignments',`${s}_driver_${input.driverId}`),{ownerId:s,shipmentId:key});
    const shipmentEvent=audit(tx,s,actor,'shipments',key,'Assign transport',shipment.version+1,shipment.reference);
    tx.update(ref('shipments',key),{driver:driver.name,driverUid:driver.userId,version:shipment.version+1,updatedAt:now(),updatedBy:actor,lastEventId:shipmentEvent});
    audit(tx,s,actor,'transportPlans',key,'Schedule',data.version,shipment.reference);return {id:key};
  });
}
async function cancelTransport(auth,scope,input){
  return run(auth,scope,'fleet',async(tx,s,actor)=>{
    const key=id(input.shipmentId),shipment=scoped(await tx.get(ref('shipments',key)),s),plan=scoped(await tx.get(ref('transportPlans',key)),s);
    expect(plan,input.version);if(plan.status!=='Scheduled'||shipment.status==='Dispatched')fail('Only an undispatched schedule can be cancelled.');
    const notes=text(input.notes,'Cancellation notes',240,3);
    tx.delete(ref('resourceAssignments',`${s}_vehicle_${plan.vehicleId}`));tx.delete(ref('resourceAssignments',`${s}_driver_${plan.driverId}`));
    tx.update(ref('transportPlans',key),{status:'Cancelled',notes,version:plan.version+1,updatedAt:now(),updatedBy:actor});
    const event=audit(tx,s,actor,'shipments',key,'Cancel transport',shipment.version+1,shipment.reference);
    tx.update(ref('shipments',key),{driver:'',driverUid:null,version:shipment.version+1,lastEventId:event,updatedAt:now(),updatedBy:actor});
    audit(tx,s,actor,'transportPlans',key,'Cancel',plan.version+1,shipment.reference);return {id:key};
  });
}
export function abnormality(shipment,delivery,hasProof=false,currentTime=Date.now()){
  const signals=[];const deadline=Date.parse(`${shipment.expectedDelivery}T23:59:59+08:00`);
  if(currentTime>deadline&&delivery.status!=='Delivered')signals.push('Expected delivery date exceeded');
  if((delivery.failedAttempts||0)>=2)signals.push('Repeated failed delivery attempts');
  if(delivery.status==='Delivered'&&!hasProof)signals.push('Delivered without proof');
  if(delivery.updatedAt?.toMillis&&currentTime-delivery.updatedAt.toMillis()>24*3600000&&!['Delivered','Returned'].includes(delivery.status))signals.push('No delivery update for 24 hours');
  return {signals,score:signals.length*25,level:signals.length>=2?'High':signals.length?'Medium':'Low',technique:'Explainable rules'};
}
async function delivery(auth,scope,input){
  return run(auth,scope,'delivery',async(tx,s,actor,member)=>{
    const key=id(input.shipmentId),shipment=scoped(await tx.get(ref('shipments',key)),s),planSnapshot=await tx.get(ref('transportPlans',key));
    const oldSnapshot=await tx.get(ref('deliveries',key)),old=oldSnapshot.data()||{status:'Dispatched',version:0,failedAttempts:0};
    const plan=planSnapshot.data();
    const prepared=await prepareDeliveryTransition(tx,{scope:s,actor,member,command:{...input,version:input.version||0},shipment,plan,old});
    prepared.apply();return {id:key};
  });
}
async function location(auth,scope,input){
  return run(auth,scope,'delivery',async(tx,s,actor,member)=>{
    const key=id(input.shipmentId),shipment=scoped(await tx.get(ref('shipments',key)),s),plan=(await tx.get(ref('transportPlans',key))).data(),delivery=(await tx.get(ref('deliveries',key))).data();
    if(shipment.status!=='Dispatched'||['Delivered','Returned'].includes(delivery?.status))fail('Location updates are only available during an active delivery.');
    if(member.role==='Driver'&&plan?.driverUid!==actor)fail('This shipment is not assigned to you.','permission-denied');
    const record={ownerId:s,shipmentId:key,latitude:number(input.latitude,'latitude',-90,90),longitude:number(input.longitude,'longitude',-180,180),accuracy:number(input.accuracy,'accuracy',0,100000),actor,submittedAt:now()};
    tx.set(ref('locations',key),record);tx.set(ref('locationEvents',randomUUID()),record);return {id:key};
  });
}
async function registerEvidence(auth,scope,input){
  if(['spark-msi','spark-loopback-test'].includes(process.env.IILAS_DEMO_MODE))return registerMsiWebEvidence(auth,scope,input);
  const key=id(input.id),shipmentId=id(input.shipmentId),path=`evidence/${id(scope)}/${shipmentId}/${key}`;
  if(input.path!==path)fail('Invalid evidence path.');
  const capture=validateEvidenceCapture(input);
  const authorize=(tx,s,actor,member)=>authorizeEvidence(tx,{scope:s,actor,member,shipmentId,capture});
  // Snapshot current scope, approval, role, status and assignment before any
  // object access. Repeat the same checks in the transaction that writes.
  await run(auth,scope,'evidence',authorize);
   const object=evidenceFile(path),[metadata]=await object.getMetadata();
  const bytes=number(metadata.size,'evidence size',1,10*1024*1024,true);
  const declared=metadata.metadata;
  if(declared?.actor!==auth.uid||declared.stage!==capture.stage||declared.evidenceType!==capture.type||declared.captureSource!==capture.captureSource||(declared.capturedAtClient||'')!==(capture.capturedAtClient||''))fail('Evidence capture metadata does not match the upload.');
  if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(metadata.contentType)||capture.type==='Parcel Image'&&!metadata.contentType.startsWith('image/'))fail('Invalid evidence object.');
  const [buffer]=await object.download();if(buffer.length!==bytes)fail('Evidence size changed.');
  const digest=hash(buffer);
  return run(auth,scope,'evidence',async(tx,s,actor,member)=>{
    let prepared;
    try{prepared=await prepareEvidenceRegistration(tx,{scope:s,actor,member,shipmentId,key,path,name:input.name,capture,contentType:metadata.contentType,bytes,sha256:digest});}
    catch(error){if(error.message==='evidence_conflict')fail('Evidence is already registered.');throw error;}
    prepared.apply();
    return {id:key,sha256:digest};
  });
}
async function fleetEvent(auth,scope,input){
  return run(auth,scope,'fleet',async(tx,s,actor)=>{
    const vehicleId=id(input.vehicleId),vehicle=scoped(await tx.get(ref('vehicles',vehicleId)),s);
    if(!['Fuel','Maintenance'].includes(input.type))fail('Choose a fleet event type.');
    const key=randomUUID(),cost=number(input.cost,'cost'),notes=text(input.notes,'Fleet notes',240,3),date=day(input.date);
    const litres=input.type==='Fuel'?number(input.litres,'litres',0.1,10000):0;
    tx.set(ref('fleetEvents',key),{ownerId:s,vehicleId,vehicleName:vehicle.name,type:input.type,cost,litres,notes,date,actor,createdAt:now(),version:1});
    tx.update(ref('vehicles',vehicleId),{fuelLitres:vehicle.fuelLitres+litres,version:vehicle.version+1,updatedAt:now(),updatedBy:actor,...(input.type==='Maintenance'?{maintenanceDate:day(input.nextMaintenanceDate)}:{})});
    audit(tx,s,actor,'fleetEvents',key,input.type,1,vehicle.name);return {id:key};
  });
}
async function prepareVerification(auth,scope,input){
  const kind=input.kind,collection=kind==='inventory'?'stockMovements':kind==='delivery'?'evidence':null;
  if(!collection)fail('Choose inventory or delivery verification.');
  return run(auth,scope,'reports',async(tx,s)=>{
    const key=id(input.id),record={id:key,...scoped(await tx.get(ref(collection,key)),s)};
    const canonical=canonicalRecord(kind,record),referenceHash=hash(`${s}:${kind}:${key}`),digest=hash(canonical);
    return {id:key,kind,referenceHash,digest,canonical,contract:process.env.IILAS_REGISTRY_ADDRESS||null,chainId:Number(process.env.IILAS_CHAIN_ID||31337)};
  });
}
async function registerVerification(auth,scope,input){
  const prepared=await prepareVerification(auth,scope,input),address=process.env.IILAS_REGISTRY_ADDRESS;
  if(!address||!process.env.IILAS_RPC_URL)fail('Configure the trusted integrity registry before recording blockchain verification.','unavailable');
  const {JsonRpcProvider,Contract,Interface}=await import('ethers');
  const abi=['function lookup(bytes32) view returns (bytes32)','event Registered(bytes32 indexed referenceHash, bytes32 digest, address indexed actor)'];
  const provider=new JsonRpcProvider(process.env.IILAS_RPC_URL),network=await provider.getNetwork();
  if(network.chainId!==BigInt(prepared.chainId))fail('Configured blockchain network does not match.');
  const transactionHash=text(input.transactionHash,'Transaction hash',66,66);if(!/^0x[a-fA-F0-9]{64}$/.test(transactionHash))fail('Invalid transaction hash.');
  const receipt=await provider.getTransactionReceipt(transactionHash),iface=new Interface(abi);
  if(!receipt||receipt.status!==1||receipt.to?.toLowerCase()!==address.toLowerCase())fail('A confirmed registry transaction is required.');
  const event=receipt.logs.filter(log=>log.address.toLowerCase()===address.toLowerCase()).map(log=>{try{return iface.parseLog(log);}catch{return null;}}).find(log=>log?.name==='Registered'&&log.args.referenceHash===`0x${prepared.referenceHash}`&&log.args.digest===`0x${prepared.digest}`);
  if(!event)fail('The transaction does not register this record hash.');
  const saved=await new Contract(address,abi,provider).lookup(`0x${prepared.referenceHash}`);
  if(saved!==`0x${prepared.digest}`)fail('The blockchain hash does not match the current record.');
  return run(auth,scope,'reports',async(tx,s,actor)=>{
    const record={id:prepared.id,...scoped(await tx.get(ref(prepared.kind==='inventory'?'stockMovements':'evidence',prepared.id)),s)};
    if(hash(canonicalRecord(prepared.kind,record))!==prepared.digest)fail('The record changed during verification.');
    const key=hash(`${s}:${prepared.kind}:${prepared.id}`),old=await tx.get(ref('verificationRecords',key));
    if(old.exists)fail('Verification is already recorded.');
    tx.set(ref('verificationRecords',key),{ownerId:s,kind:prepared.kind,recordId:prepared.id,referenceHash:prepared.referenceHash,digest:prepared.digest,contract:address,chainId:prepared.chainId,transactionHash,blockNumber:receipt.blockNumber,status:'Verified',actor,createdAt:now(),version:1});
    audit(tx,s,actor,'verificationRecords',key,'Verify',1,prepared.kind);return {id:key};
  });
}
async function predict(auth,scope,input){
  if(input.kind==='inventory')fail('Use Stock AI experiment for simulated scenarios. Real inventory history is not qualified for this model.','unavailable');
  if(input.kind==='parcel')fail('Use the registered evidence parcel analysis workflow to request and recover a parcel outcome.');
  const kind=input.kind,permission=kind==='inventory'?'products':'delivery';
  if(!['inventory','delivery','parcel'].includes(kind))fail('Choose an inference workflow.');
  const key=id(input.id),recordKind=kind==='inventory'?'products':kind==='parcel'?'evidence':'shipments';
  const source=await run(auth,scope,permission,async(tx,s,actor,member)=>{
    const record=scoped(await tx.get(ref(recordKind,key)),s);
    if(member.role==='Driver'&&(recordKind==='evidence'?(await tx.get(ref('transportPlans',record.shipmentId))).data()?.driverUid:record.driverUid)!==actor)fail('Inference is limited to assigned deliveries.','permission-denied');
    if(kind==='inventory'){
      const movements=await tx.get(database().collection('stockMovements').where('ownerId','==',s).where('productId','==',key));
      const values=movements.docs.map(d=>d.data()),receiptTimes=values.filter(v=>v.type==='Receipt').map(v=>v.createdAt.toMillis());
      if(!receiptTimes.length)fail('Record a replenishment receipt before predicting stock risk.');
      const start=Date.now()-30*86400000,recent=values.filter(v=>v.createdAt.toMillis()>=start),available=record.quantityOnHand-(record.reservedQuantity||0);
      return {version:record.version,features:{available_quantity:available,reserved_quantity:record.reservedQuantity||0,movement_frequency:recent.length,reorder_distance:available-record.reorderLevel,adjustment_count:recent.filter(v=>v.type==='Adjustment').length,days_since_replenishment:(Date.now()-Math.max(...receiptTimes))/86400000}};
    }
    if(kind==='delivery'){
      if(record.status!=='Dispatched'||!record.dispatchedAt)fail('Dispatch the shipment before predicting delivery risk.');
      const delivery=(await tx.get(ref('deliveries',key))).data(),events=await tx.get(database().collection('deliveryEvents').where('ownerId','==',s).where('shipmentId','==',key));
      return {version:record.version,deliveryVersion:delivery?.version||0,features:{expected_duration_hours:Math.max(0,(Date.parse(`${record.expectedDelivery}T23:59:59+08:00`)-record.dispatchedAt.toMillis())/3600000),elapsed_hours:Math.max(0,(Date.now()-record.dispatchedAt.toMillis())/3600000),failed_attempts:delivery?.failedAttempts||0,has_proof:delivery?.proofId?1:0,status_event_count:events.size,parcel_count:record.parcelCount}};
    }
    if(record.type!=='Parcel Image')fail('Choose registered parcel-image evidence.');
    return {version:record.version,path:record.path,sha256:record.sha256};
  });
  // A selected parcel-only endpoint cannot serve deferred tabular workflows,
  // even while its manifest is incomplete, absent or invalid.
  if(['IILAS_PARCEL_LOCAL_EVAL_MANIFEST','IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256'].some(key=>Object.hasOwn(process.env,key))||!process.env.RESEARCH_API_URL||!process.env.RESEARCH_API_TOKEN)fail('Research inference is unavailable until labelled datasets, evaluated models, and the Python service are configured.','unavailable');
  const payload={kind,features:source.features||{}};
  const response=await fetch(`${process.env.RESEARCH_API_URL.replace(/\/$/,'')}/predict`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.RESEARCH_API_TOKEN}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
  if(!response.ok)fail('An evaluated model is not available. Check the research service and labelled training data.','unavailable');
  const result=await response.json(),classes=kind==='inventory'?['Normal','Reorder Risk','Critical Stock Risk']:kind==='delivery'?['Low','Medium','High']:['Normal','Damaged'];
  if(!classes.includes(result.label)||!result.modelVersion)fail('The research service returned an invalid prediction.');
  const confidence=number(result.confidence,'confidence',0,1);
  return run(auth,scope,permission,async(tx,s,actor,member)=>{
    const record=scoped(await tx.get(ref(recordKind,key)),s);expect(record,source.version);
    if(member.role==='Driver'&&(recordKind==='evidence'?(await tx.get(ref('transportPlans',record.shipmentId))).data()?.driverUid:record.driverUid)!==actor)fail('Inference is limited to assigned deliveries.','permission-denied');
    if(kind==='delivery'&&((await tx.get(ref('deliveries',key))).data()?.version||0)!==source.deliveryVersion)fail('Delivery events changed during inference. Request a fresh analysis.');
    const predictionId=randomUUID();tx.set(ref('predictions',predictionId),{ownerId:s,kind,recordId:key,sourceVersion:source.version,label:result.label,confidence,model:text(result.model,'Model',80),modelVersion:text(result.modelVersion,'Model version',128),features:source.features||{},globalFeatureImportance:kind==='parcel'?{}:result.globalFeatureImportance||{},evidenceSha256:source.sha256||null,reviewStatus:'Pending',humanReviewRequired:true,actor,createdAt:now(),version:1});
    audit(tx,s,actor,'predictions',predictionId,'Predict',1,`${kind}: ${result.label}`);return {id:predictionId};
  });
}
async function reviewPrediction(auth,scope,input){
  return run(auth,scope,'reports',async(tx,s,actor,member)=>{
    const key=id(input.id),prediction=scoped(await tx.get(ref('predictions',key)),s);expect(prediction,input.version);
    if(prediction.reviewStatus!=='Pending'||!['Accept','Reject'].includes(input.decision))fail('Choose a pending prediction and review decision.');
    if(prediction.kind==='parcel'&&!prediction.analysisId&&(input.decision==='Accept'||['evaluationKind','evaluationManifestSha256','evaluationOnly','runtimeMode','operationally_approved','acceptanceSha256','evidenceSha256','shipmentId','stage'].some(key=>Object.hasOwn(prediction,key))))fail('Parcel predictions require a reciprocal registered-photo result.');
    if(prediction.kind!=='parcel'&&(['evaluationKind','evaluationManifestSha256','evaluationOnly','runtimeMode'].some(key=>Object.hasOwn(prediction,key))||prediction.acceptanceSha256===null))fail('Experimental parcel provenance cannot use generic prediction review.');
    if(prediction.analysisId){await reviewLinkedParcelPrediction(tx,key,prediction,input,actor,member.role);return {id:key};}
    const notes=text(input.notes,'Human review notes',500,3);
    tx.update(ref('predictions',key),{reviewStatus:input.decision==='Accept'?'Accepted':'Rejected',reviewNotes:notes,reviewedBy:actor,reviewedAt:now(),version:prediction.version+1});
    audit(tx,s,actor,'predictions',key,'Review',prediction.version+1,input.decision);return {id:key};
  });
}
export async function executeCommand(auth,request){
  if(process.env.FUNCTIONS_EMULATOR!=='true'||process.env.IILAS_DEMO_MODE==='cloud-demo'){
    const {trustedDemoEnvironment}=await import('./demoEnvironment.mjs'),{assertHybridActionAllowed}=await import('./hybridGateway.mjs');
    const profile=trustedDemoEnvironment();assertHybridActionAllowed(request?.action,profile.mode);
  }
  if(!auth?.uid)fail('Sign in.','permission-denied');
  onlyFields(request,['action','input','workspaceId'],'Command');
  const {action,input={}}=request;
  if(typeof action!=='string'||!input||typeof input!=='object'||Array.isArray(input))fail('Invalid command action or input.');
  if(action==='registerAccount')return registerAccount(auth,input);
  if(['prepareEvidenceUpload','reconcileEvidenceUpload'].includes(action)){
    if(!['spark-msi','spark-loopback-test'].includes(process.env.IILAS_DEMO_MODE))fail('This upload preparation requires the explicit MSI backend.','unavailable');
    return action==='prepareEvidenceUpload'?prepareMsiWebEvidence(auth,input):reconcileMsiWebEvidence(auth,input);
  }
  if(action==='updateAccount')return updateAccount(auth,input);
  if(['getMobileAvailability','getMobileAccessContext','mintMobileWebSession','getMobileAssignments','getMobileShipment','mobileCommand','resolveMobileCommand'].includes(action)){
    const mobileCommands=createMobileCommands();
    if(Object.hasOwn(request,'workspaceId'))fail('Mobile requests cannot select a workspace.','permission-denied');
    return mobileCommands[action](auth,undefined,input);
  }
  const customerCommands=createCustomerCommands();
  if(action==='checkCustomerProofIntegrity'){
    if(Object.hasOwn(request,'workspaceId'))fail('Customer requests cannot select a workspace.','permission-denied');
    return createCustomerProofIntegrity().checkCustomerProofIntegrity(auth,input);
  }
  const customerOrders=createCustomerOrderCommands({prepareRecordSave});
  if(['getCustomerOrders','getCustomerOrder','mutateCustomerOrder','resolveCustomerOrderOperation'].includes(action)){
    if(Object.hasOwn(request,'workspaceId'))fail('Customer order commands cannot select a workspace.','permission-denied');
    return customerOrders[action](auth,input);
  }
  if(['getCustomerShipments','getCustomerShipment'].includes(action)){
    if(Object.hasOwn(request,'workspaceId'))fail('Customer requests cannot select a workspace.','permission-denied');
    return customerCommands[action](auth,input);
  }
  const handlers={save,remove,stock,resolveStock,approval,warehouse,cancelWarehouse,entity,purchaseOrder,planTransport,cancelTransport,delivery,location,registerEvidence,fleetEvent,prepareVerification,registerVerification,predict,reviewPrediction,startParcelAnalysis,resolveParcelAnalysis,cleanupParcelAnalysis,reviewParcelAnalysis,startParcelLiveSession,reserveParcelLiveFrame,analyseParcelLiveFrame,resolveParcelLiveSession,resolveParcelLiveFrame,stopParcelLiveSession,cleanupParcelLiveSession,reviewParcelLiveFrame,getInventoryAssessment,captureInventorySnapshot,resolveInventorySnapshot,reviewInventorySnapshot,resolveInventoryReview,startInventoryExperiment,resolveInventoryExperiment,getInventoryAIReadiness,startInventoryContextExperiment,resolveInventoryContextExperiment,getInventoryDemoProductContext,startInventoryDemoProductExperiment,resolveInventoryDemoProductExperiment,getInventoryDemoReorderAvailability,reviewInventoryDemoReorder,resolveInventoryDemoReorderReview};
  Object.assign(handlers,{getInventoryDemoProcurementAvailability,submitInventoryDemoProcurement,resolveInventoryDemoProcurement});
  Object.assign(handlers,{getDeliveryDemoContext,startDeliveryDemoExperiment,resolveDeliveryDemoExperiment,captureDeliveryAbnormality,resolveDeliveryAbnormality,reviewDeliveryRisk,resolveDeliveryRiskReview});
  Object.assign(handlers,createIntegrityCommands());
  Object.assign(handlers,createFleetTransportCommands());
  Object.assign(handlers,createReportingCommands());
  Object.assign(handlers,createRecordCreationCommands({prepareRecordSave,preparePurchaseCreate}));
  Object.assign(handlers,{getCustomerOrdersForStaff:customerOrders.getCustomerOrdersForStaff,getCustomerOrderForStaff:customerOrders.getCustomerOrderForStaff});
  Object.assign(handlers,{getCustomerAccessContext:customerCommands.getCustomerAccessContext,grantCustomerShipment:customerCommands.grantCustomerShipment,revokeCustomerShipment:customerCommands.revokeCustomerShipment,resolveCustomerShipmentGrant:customerCommands.resolveCustomerShipmentGrant,resolveCustomerShipmentRevocation:customerCommands.resolveCustomerShipmentRevocation});
  if(!Object.hasOwn(handlers,action))fail('Unknown command.');
  const liveActions=['startParcelLiveSession','reserveParcelLiveFrame','analyseParcelLiveFrame','resolveParcelLiveSession','resolveParcelLiveFrame','stopParcelLiveSession','cleanupParcelLiveSession','reviewParcelLiveFrame'];
  const dispatch=async()=>{
    const scope=await approvedScope(auth,liveActions.includes(action)?guardParcelLiveTransaction:undefined);
    if(request.workspaceId&&request.workspaceId!==scope)fail('The system data source cannot be changed by a client.','permission-denied');
    if(process.env.IILAS_DEMO_MODE==='cloud-demo'&&['prepareIntegrityRegistration','registerIntegrityTransaction','resolveIntegrityRegistration','checkIntegrityRecord','resolveIntegrityCheck'].includes(action)){
      const {withHybridIntegrityContext}=await import('./hybridIntegrity.mjs');return withHybridIntegrityContext({actor:auth.uid,scope},()=>handlers[action](auth,scope,input));
    }
    return handlers[action](auth,scope,input);
  };
  if(!liveActions.includes(action))return dispatch();
  try{return await runParcelLiveOperation(dispatch);}
  catch(error){
    if(error?.liveSafe===true)throw error;
    // Initial approval lookup happens before the handler's safe wrapper. Never
    // forward a database/service exception from that live-only boundary.
    if(error?.code==='permission-denied')fail('Your account cannot perform this live parcel operation.','permission-denied');
    fail('Live parcel access could not be verified. Resolve the same saved operation before trying again.','unavailable');
  }
}
