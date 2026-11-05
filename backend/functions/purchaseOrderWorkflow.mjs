import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {inputNumber,purchaseIncomingFacts} from './procurementValidation.js';
import {assertPreparedBusinessCode} from './businessCodeAllocation.mjs';
const preparedPlans=new WeakSet();
const fail=(message,code='failed-precondition')=>{throw Object.assign(new Error(message),{code});};
const hash=v=>createHash('sha256').update(v).digest('hex');
const now=()=>FieldValue.serverTimestamp();
const database=()=>getFirestore();
const ref=(kind,key)=>database().collection(kind).doc(key);
const scoped=(snapshot,scope)=>{if(!snapshot.exists||snapshot.data().ownerId!==scope)fail('Record not found in the shared system.','not-found');return snapshot.data();};
const expect=(record,version)=>{if(record.version!==version)fail('This record changed. Refresh and try again.');};
const number=inputNumber;
const audit=(tx,scope,actor,kind,key,action,version,label)=>tx.set(ref('auditLogs',`${kind}_${key}_${version}`),{ownerId:scope,actor,kind,recordId:key,action,version,label:String(label).slice(0,240),at:now()});
const storedTime=value=>Number.isSafeInteger(value?.seconds)&&Number.isInteger(value?.nanoseconds)&&value.nanoseconds>=0&&value.nanoseconds<1e9;
async function prepareIncoming(tx,{key,step,old,result}){
    const target=ref('expectedReplenishments',key),snapshot=await tx.get(target);
    let createdAt=storedTime(old.issuedAt)?old.issuedAt:now();
    if(snapshot.exists){
      if(step==='Issue')fail('An unissued purchase has an existing expected incoming record.');
      const {createdAt:original,updatedAt,...saved}=snapshot.data();
      if(!storedTime(original)||!storedTime(updatedAt)||!isDeepStrictEqual(saved,purchaseIncomingFacts(old,key)))fail('Expected incoming and the purchase order differ. Reconcile before receiving stock.');
      createdAt=original;
    }
    return {target,exists:snapshot.exists,data:{...purchaseIncomingFacts(result,key),createdAt,updatedAt:now()}};
}
export async function preparePurchaseTransition(tx,{scope:s,actor,member,command,orderId,old,codeAllocation}){
    const key=orderId,orderRef=ref('purchaseOrders',key);
    if(old&&old.ownerId!==s)fail('Purchase order not found.','not-found');
    if(command.id&&!old)fail('Purchase order not found.','not-found');
    if(old)expect(old,command.version);
    const step=old?command.step:'Submit',version=(old?.version||0)+1,eventId=`${key}_${version}`;
    let data=old?{...old}:null,referenceKey,receiptKey;
    const receipts=[];
    if(!old||step==='Resubmit'){
      if(old&&!['Submitted','Rejected'].includes(old.status))fail('Only submitted or rejected orders can be corrected and resubmitted.');
      const reference=old?.reference||command.reference;
      referenceKey=`purchase_${hash(JSON.stringify([s,reference.trim().toUpperCase()]))}`;
      const reserved=await tx.get(ref('procurementKeys',referenceKey));
      // Also inspect legacy references without changing existing IDs/casing.
      if(codeAllocation){assertPreparedBusinessCode(codeAllocation,{tx,scope:s,kind:'purchaseOrders',recordId:key});if(old||codeAllocation.code!==reference)fail('Generated purchase identity differs.');}
      const legacy=codeAllocation?{docs:[]}:await tx.get(database().collection('purchaseOrders').where('ownerId','==',s));
      if((reserved.exists&&reserved.data().recordId!==key)||legacy.docs.some(d=>d.id!==key&&String(d.data().reference).trim().toUpperCase()===reference.trim().toUpperCase()))fail('Purchase reference is already registered. Open that order or choose a new reference.');
      const supplier=scoped(await tx.get(ref('suppliers',command.supplierId)),s);
      if(supplier.status!=='Active')fail('Choose an active supplier.');
      const products=await Promise.all(command.items.map(item=>tx.get(ref('products',item.productId))));
      const items=command.items.map((item,n)=>{
        const p=scoped(products[n],s);if(p.archived||p.status!=='Active')fail('Choose an active product.');
        return {...item,name:p.name,sku:p.sku,received:0};
      });
      data={...old,reference,supplierId:command.supplierId,supplierName:supplier.name,supplierContact:supplier.contact,expectedDate:command.expectedDate,items,totalCents:command.totalCents,status:'Submitted',requestedBy:actor,requestedAt:now(),revision:(old?.revision||0)+1,approvedBy:null,approvedAt:null,reviewNotes:'',correctionNotes:command.notes||''};
    }else if(['Approve','Reject','Issue'].includes(step)){
      if(step==='Issue'&&old.status!=='Approved')fail('Approve the purchase order first.');
      if(step!=='Issue'&&old.status!=='Submitted')fail('Only submitted orders can be reviewed.');
      if(step!=='Issue'&&actor===old.requestedBy)fail('A different manager must review this purchase.');
      if(step!=='Reject'){
        const supplier=scoped(await tx.get(ref('suppliers',old.supplierId)),s);
        if(supplier.status!=='Active')fail('Reactivate the supplier or cancel this unissued order.');
        const products=await Promise.all(old.items.map(item=>tx.get(ref('products',item.productId))));
        if(products.some(p=>{const item=scoped(p,s);return item.archived||item.status!=='Active';}))fail('Reactivate inactive products or correct the submitted order before approval/issue.');
      }
      if(step==='Approve')data={...data,status:'Approved',approvedBy:actor,approvedAt:now(),reviewNotes:command.notes};
      if(step==='Reject')data={...data,status:'Rejected',rejectedBy:actor,rejectedAt:now(),reviewNotes:command.notes};
      if(step==='Issue')data={...data,status:'Issued',issuedBy:actor,issuedAt:now()};
    }else if(step==='Cancel'){
      if(!['Submitted','Rejected','Approved'].includes(old.status))fail('Only an unissued order can be cancelled. Receipts and issued orders must be preserved.');
      data={...data,status:'Cancelled',cancelledBy:actor,cancelledAt:now(),cancellationNotes:command.notes};
    }else if(step==='Receive'){
      if(!['Issued','PartReceived'].includes(old.status))fail('Only issued purchase orders can be received.');
      if(command.quantities.length!==old.items.length)fail('Enter received quantities for every line.');
      const checked=old.items.map((line,n)=>number(command.quantities[n],'received quantity',0,line.quantity-line.received,true));
      receiptKey=`receipt_${hash(JSON.stringify([s,key,command.receiptReference]))}`;
      if((await tx.get(ref('procurementKeys',receiptKey))).exists)fail('This delivery note was already received for this order. Review its receipt history.');
      const products=await Promise.all(old.items.map(item=>tx.get(ref('products',item.productId))));
      for(let n=0;n<old.items.length;n++)if(checked[n]){
        const product=scoped(products[n],s);
        if(product.archived||product.status!=='Active')fail('Reactivate the received product before recording delivered goods.');
        if(product.quantityOnHand+checked[n]>1000000)fail('Receipt would exceed the supported stock balance.');
      }
      old.items.forEach((line,n)=>{if(checked[n])receipts.push({productId:line.productId,product:products[n].data(),quantity:checked[n],input:{type:'Receipt',quantity:checked[n],reference:old.reference,reason:`Purchase receipt ${command.receiptReference}`,purchaseOrderId:key,purchaseReceiptId:eventId}});});
      const items=old.items.map((line,n)=>({...line,received:line.received+checked[n]}));
      data={...data,items,status:items.every(line=>line.received===line.quantity)?'Received':'PartReceived',lastReceiptReference:command.receiptReference};
    }
    const result={...data,ownerId:s,version,createdAt:old?.createdAt||now(),updatedAt:now(),updatedBy:actor};
    const incoming=old&&!Object.hasOwn(old,'demoReorderSource')&&['Issue','Receive'].includes(step)
      ? await prepareIncoming(tx,{key,step,old,result}) : null;
    const prepared={s,actor,member,command,key,orderRef,step,version,eventId,data,referenceKey,receiptKey,receipts,result,incoming};
    preparedPlans.add(prepared);return prepared;
}
export function writePurchaseTransition(tx,prepared,{stockWrite}){
 if(!preparedPlans.has(prepared))fail('Invalid internal purchase transition.');preparedPlans.delete(prepared);
 const {s,actor,member,command,key,orderRef,step,version,eventId,data,referenceKey,receiptKey,receipts,result,incoming}=prepared;
 const movements=receipts.map(line=>({productId:line.productId,quantity:line.quantity,movementId:stockWrite(tx,s,actor,line.productId,line.product,line.input)}));
    if(referenceKey)tx.set(ref('procurementKeys',referenceKey),{ownerId:s,kind:'purchase',recordId:key});
    if(receiptKey)tx.create(ref('procurementKeys',receiptKey),{ownerId:s,kind:'receipt',recordId:key,eventId});
    tx.set(orderRef,result);
    tx.create(ref('purchaseOrderEvents',eventId),{...result,orderId:key,step,actor,actorName:member.displayName||member.email,actorRole:member.role,at:now(),notes:command.notes||'',receiptReference:command.receiptReference||'',movements});
    if(incoming){
      if(incoming.exists)tx.set(incoming.target,incoming.data);
      else tx.create(incoming.target,incoming.data);
    }
    audit(tx,s,actor,'purchaseOrders',key,step,version,`${data.reference}: ${command.notes||data.status}`);
    return {id:key,status:data.status,version};
}
