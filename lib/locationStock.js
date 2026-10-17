import {inputNumber,inputText} from './procurementValidation.js';

export const locationName=value=>inputText(value,'Storage location',80).replace(/\s+/g,' ');
export const locationKey=value=>locationName(value).toUpperCase();
const fail=message=>{throw new Error(message);};
export function locationBalances(product){
  const totals={quantity:inputNumber(product.quantityOnHand,'stock balance',0,1000000,true),reserved:inputNumber(product.reservedQuantity??0,'reserved balance',0,1000000,true),warehouse:inputNumber(product.warehouseReservedQuantity??0,'warehouse balance',0,1000000,true)};
  const source=product.locationBalances===undefined?[{location:product.location,...totals}]:product.locationBalances;
  if(!Array.isArray(source)||!source.length||source.length>100)fail('Location balances need review before recording stock.');
  const rows=source.map(row=>({location:locationName(row.location),quantity:inputNumber(row.quantity,'location balance',0,1000000,true),reserved:inputNumber(row.reserved,'location reservation',0,1000000,true),warehouse:inputNumber(row.warehouse,'warehouse location reservation',0,1000000,true)}));
  if(new Set(rows.map(row=>locationKey(row.location))).size!==rows.length||rows.some(row=>row.warehouse>row.reserved||row.reserved>row.quantity)||['quantity','reserved','warehouse'].some(key=>rows.reduce((sum,row)=>sum+row[key],0)!==totals[key])||!rows.some(row=>locationKey(row.location)===locationKey(product.location)))fail('Location totals do not match the product. Ask an administrator to reconcile them.');
  return rows;
}
export function allocateLocations(product,quantity){
  inputNumber(quantity,'allocation quantity',1,1000000,true);
  const rows=locationBalances(product).sort((a,b)=>(locationKey(a.location)===locationKey(product.location)?-1:locationKey(b.location)===locationKey(product.location)?1:locationKey(a.location).localeCompare(locationKey(b.location))));
  let remaining=quantity;const allocations=[];
  for(const row of rows){const take=Math.min(remaining,row.quantity-row.reserved);if(take){allocations.push({location:row.location,quantity:take});remaining-=take;}if(!remaining)break;}
  if(remaining)fail('Not enough available stock for warehouse work.');
  return allocations;
}
export function applyLocationMovement(product,movement,{warehouse=false,allocations,consumeReserved=false}={}){
  const rows=locationBalances(product),quantity=inputNumber(movement.quantity,'quantity',1,1000000,true);
  const location=locationName(movement.locationFrom||product.location),target=movement.type==='Transfer'?locationName(movement.locationTo):location;
  if(movement.type==='Transfer'&&locationKey(location)===locationKey(target))fail('Choose a different destination location.');
  const rawPlan=allocations||[{location,quantity}];
  if(!Array.isArray(rawPlan))fail('Invalid location allocation.');
  const plan=rawPlan.map(a=>({location:locationName(a.location),quantity:inputNumber(a.quantity,'allocated quantity',1,1000000,true)}));
  if(!Array.isArray(plan)||!plan.length||plan.length>100||plan.reduce((sum,a)=>sum+inputNumber(a.quantity,'allocated quantity',1,1000000,true),0)!==quantity||new Set(plan.map(a=>locationKey(a.location))).size!==plan.length)fail('Invalid location allocation.');
  if(consumeReserved&&!warehouse)fail('Only dispatch can consume warehouse reservations.');
  if(allocations&&!warehouse)fail('Only warehouse workflows can consume an allocation plan.');
  const snapshots=[];
  const rowAt=(name,create=false)=>{let row=rows.find(r=>locationKey(r.location)===locationKey(name));if(!row&&create){row={location:locationName(name),quantity:0,reserved:0,warehouse:0};rows.push(row);}if(!row)fail('Choose an existing stock location.');return row;};
  const changeRow=(row,delta,reservedDelta=0,warehouseDelta=0)=>{
    const before={...row};row.quantity+=delta;row.reserved+=reservedDelta;row.warehouse+=warehouseDelta;
    if(row.warehouse<0||row.reserved<row.warehouse)fail('Warehouse allocations must be released by cancelling their warehouse job.');
    if(row.quantity<0||row.reserved<0||row.reserved>row.quantity||row.quantity>1000000)fail('Not enough available stock at this location or an invalid resulting balance.');
    snapshots.push({location:row.location,quantityBefore:before.quantity,quantityAfter:row.quantity,reservedBefore:before.reserved,reservedAfter:row.reserved,warehouseBefore:before.warehouse,warehouseAfter:row.warehouse});
  };
  for(const allocation of plan){
    const q=allocation.quantity,row=rowAt(allocation.location,movement.type==='Receipt'||movement.type==='Adjustment'&&movement.adjustmentDirection==='Increase');
    if(movement.type==='Receipt')changeRow(row,q);
    else if(movement.type==='Issue')changeRow(row,-q,consumeReserved?-q:0,consumeReserved?-q:0);
    else if(movement.type==='Adjustment')changeRow(row,movement.adjustmentDirection==='Increase'?q:-q);
    else if(movement.type==='Reservation')changeRow(row,0,q,warehouse?q:0);
    else if(movement.type==='Release')changeRow(row,0,-q,warehouse?-q:0);
    else if(movement.type==='Transfer'){changeRow(row,-q);changeRow(rowAt(target,true),q);}
    else fail('Unsupported stock movement.');
  }
  let primary=product.location;
  // Retain full-transfer behaviour only when the default bin has actually emptied.
  if(movement.type==='Transfer'&&locationKey(location)===locationKey(primary)&&rowAt(primary).quantity===0)primary=rowAt(target).location;
  const balances=rows.filter(row=>row.quantity>0||locationKey(row.location)===locationKey(primary));
  if(balances.length>100)fail('A product supports at most 100 stock locations.');
  const after=balances.reduce((sum,row)=>sum+row.quantity,0),reservedAfter=balances.reduce((sum,row)=>sum+row.reserved,0),warehouseReserved=balances.reduce((sum,row)=>sum+row.warehouse,0);
  if(after>1000000)fail('Not enough available stock or an invalid resulting balance.');
  return {location:primary,locationBalances:balances,quantityOnHand:after,reservedQuantity:reservedAfter,warehouseReservedQuantity:warehouseReserved,quantityChange:after-product.quantityOnHand,reservedChange:reservedAfter-(product.reservedQuantity||0),locationFrom:plan.length===1?rowAt(plan[0].location,true).location:'Multiple locations',locationTo:movement.type==='Transfer'?rowAt(target).location:plan.length===1?rowAt(plan[0].location,true).location:'Multiple locations',allocations:plan.map(a=>({location:locationName(a.location),quantity:a.quantity})),locationChanges:snapshots};
}
export function correctionMovement(original,reason,reference){
  if(original.origin!=='Manual'||original.correctionOf||!['Receipt','Issue','Adjustment','Transfer'].includes(original.type)||original.shipmentId||original.purchaseOrderId)fail('Only classified manual receipts, issues, adjustments and transfers can be reversed here. Use the owning workflow for linked or legacy movements.');
  const quantity=inputNumber(original.quantity,'original movement quantity',1,1000000,true);
  return {productId:original.productId,quantity,type:original.type==='Transfer'?'Transfer':'Adjustment',adjustmentDirection:original.quantityChange>0?'Decrease':'Increase',locationFrom:original.type==='Transfer'?original.locationTo:original.locationFrom,locationTo:original.type==='Transfer'?original.locationFrom:'',reason,reference};
}
