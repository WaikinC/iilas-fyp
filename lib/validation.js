import {inputNumber,inputText,validDay,malaysiaDay} from './procurementValidation.js';
export const PRODUCT_STATUSES = ["Active", "Inactive"];
export const SHIPMENT_STATUSES = ["Draft", "Prepared", "Dispatched"];
export const STOCK_MOVEMENT_TYPES = ["Receipt", "Issue", "Adjustment", "Reservation", "Release", "Transfer"];
export function validateProduct(data) { return productFields(data,true); }
export function validateProductCreation(data) {
  if(Object.hasOwn(data,'sku'))throw new Error('The item code is assigned automatically.');
  const p=productFields(data,false);if(p.reservedQuantity!==0)throw new Error('New products start without reserved stock.');return p;
}
function productFields(data,withCode) {
  const p = Object.fromEntries(["name", ...(withCode?["sku"]:[]), "barcode", "category", "location", "status"].map(k => [k, inputText(data[k]===undefined?"":data[k],k,k==="address"?500:1000000,0,k==="address")]));
  if(withCode)p.sku = p.sku.toUpperCase();
  p.reorderLevel = inputNumber(data.reorderLevel,"reorder level",0,1000000,true);
  p.quantityOnHand = inputNumber(data.quantityOnHand,"stock on hand",0,1000000,true);
  p.reservedQuantity = inputNumber(data.reservedQuantity===undefined?0:data.reservedQuantity,"reserved stock",0,1000000,true);
  p.imageDataUrl = inputText(data.imageDataUrl===undefined?"":data.imageDataUrl,"Product image",300000,0);
  if (!p.name || p.name.length > 120) throw new Error("Enter a product name (1–120 characters).");
  if (withCode&&!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(p.sku)) throw new Error("SKU must have 3–40 letters, numbers, hyphens or underscores.");
  if (!/^[0-9]{8,14}$/.test(p.barcode)) throw new Error("Barcode must contain 8–14 digits.");
  if (!p.category || p.category.length > 60 || !p.location || p.location.length > 80) throw new Error("Enter a category and storage location within the field limits.");
  if (data.reorderLevel === "" || !Number.isInteger(p.reorderLevel) || p.reorderLevel < 0 || p.reorderLevel > 1000000) throw new Error("Reorder level must be a whole number from 0 to 1,000,000.");
  if (data.quantityOnHand === "" || !Number.isInteger(p.quantityOnHand) || p.quantityOnHand < 0 || p.quantityOnHand > 1000000) throw new Error("Stock on hand must be a whole number from 0 to 1,000,000.");
  if (!Number.isInteger(p.reservedQuantity) || p.reservedQuantity < 0 || p.reservedQuantity > p.quantityOnHand) throw new Error("Reserved stock must be a whole number that does not exceed stock on hand.");
  if (!PRODUCT_STATUSES.includes(p.status)) throw new Error("Select a valid product status.");
  if (p.imageDataUrl && (p.imageDataUrl.length > 300000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.imageDataUrl))) throw new Error("Choose a supported product image smaller than 300 KB.");
  return p;
}

export function validateStockMovement(data) {
  const movement = {
    productId: inputText(data.productId===undefined?"":data.productId,"productId",1000000,0,false),
    type: inputText(data.type===undefined?"":data.type,"type",1000000,0,false),
    adjustmentDirection: inputText(data.adjustmentDirection===undefined?"":data.adjustmentDirection,"adjustmentDirection",1000000,0,false),
    locationTo: inputText(data.locationTo===undefined?"":data.locationTo,"locationTo",1000000,0,false),
    reference: inputText(data.reference===undefined?"":data.reference,"reference",1000000,0,false).toUpperCase(),
    reason: inputText(data.reason===undefined?"":data.reason,"reason",1000000,0,true),
    quantity: inputNumber(data.quantity,"Quantity",1,1000000,true),
  };
  if(data.locationFrom!==undefined&&data.locationFrom!=='')movement.locationFrom=inputText(data.locationFrom,'Stock location',80).replace(/\s+/g,' ');
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(movement.productId)) throw new Error("Choose an inventory product.");
  if (!STOCK_MOVEMENT_TYPES.includes(movement.type)) throw new Error("Choose a valid stock movement type.");
  if (!Number.isInteger(movement.quantity) || movement.quantity < 1 || movement.quantity > 1000000) throw new Error("Quantity must be a whole number from 1 to 1,000,000.");
  if (movement.type === "Adjustment" && !["Increase", "Decrease"].includes(movement.adjustmentDirection)) throw new Error("Choose whether the adjustment increases or decreases stock.");
  if (movement.type === "Transfer" && (!movement.locationTo || movement.locationTo.length > 80)) throw new Error("Enter a destination location within 80 characters.");
  if (movement.reference.length > 80) throw new Error("Reference must be 80 characters or fewer.");
  if (movement.reason.length < 3 || movement.reason.length > 240) throw new Error("Enter a reason from 3 to 240 characters.");
  return movement;
}
// Manual stock commands require a stable ID. Internal PO/warehouse movements
// keep their existing transaction contracts and use validateStockMovement.
export function validateStockRequest(data) {
  if(data.type==='Correction'){
    const productId=inputText(data.productId,'Inventory product',128),correctionOf=inputText(data.correctionOf,'Original movement',128),reason=inputText(data.reason,'Correction reason',240,3,true),reference=inputText(data.reference??'','Reference',80,0).toUpperCase(),operationId=inputText(data.operationId,'Stock operation ID',36).toLowerCase();
    if(!/^[a-zA-Z0-9_-]+$/.test(productId)||!/^[a-zA-Z0-9_-]+$/.test(correctionOf)||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(operationId))throw new Error('Choose a valid original movement and stock operation ID.');
    if(Object.keys(data).some(key=>!['productId','type','correctionOf','reason','reference','operationId'].includes(key)))throw new Error('Correction contains unsupported fields. Quantities and locations are derived from the original movement.');
    return {productId,type:'Correction',correctionOf,reference,reason,operationId};
  }
  const movement = validateStockMovement(data);
  const operationId = inputText(data.operationId===undefined?"":data.operationId,"Stock operation ID",36,0).toLowerCase();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(operationId)) throw new Error("A valid stock operation ID is required. Reopen the movement form.");
  return {...movement, adjustmentDirection: movement.type === 'Adjustment' ? movement.adjustmentDirection : '', locationTo: movement.type === 'Transfer' ? movement.locationTo : '', operationId};
}
// Current-day policy belongs at new-mutation boundaries. Saved input, historical
// edits and outcome recovery must remain valid after their delivery date passes.
export function validateNewShipmentDate(value,today=malaysiaDay()) {
  const day=validDay(value,'Expected delivery date');
  if(day<today)throw new Error('Expected delivery must be today or later (Malaysia time).');
  return day;
}
export function validateShipment(data, maxItems = 2) { return shipmentFields(data,maxItems,true); }
export function validateShipmentCreation(data,maxItems=100) {
  if(Object.hasOwn(data,'reference'))throw new Error('The shipment reference is assigned automatically.');
  const s=shipmentFields({...data,status:data.status??'Draft'},maxItems,false);
  if(s.status!=='Draft'||s.packed||s.driver||s.handoverReference)throw new Error('Create a Draft shipment before warehouse preparation or assignment.');return s;
}
function shipmentFields(data,maxItems,withCode) {
  const s = Object.fromEntries([...(withCode?["reference"]:[]), "recipient", "phone", "address", "handoverReference", "driver", "status", "expectedDelivery"].map(k => [k, inputText(data[k]===undefined?"":data[k],k,k==="address"?500:1000000,0,k==="address")]));
  if(withCode)s.reference = s.reference.toUpperCase();
  s.parcelCount = inputNumber(data.parcelCount,"parcel count",1,10000,true);
  if(data.packed!==undefined&&typeof data.packed!=="boolean")throw new Error("Packing confirmation must be true or false.");
  s.packed = data.packed === true;
  if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > maxItems) throw new Error(`Choose 1–${maxItems} inventory products for the shipment.`);
  s.items = data.items.map(item => ({productId:inputText(item?.productId,"Shipment product",128),quantity:inputNumber(item?.quantity,"shipment quantity",1,10000,true)}));
  if (s.items.some(item => !/^[a-zA-Z0-9_-]{1,128}$/.test(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000)) throw new Error("Each shipment item needs a valid product and quantity from 1 to 10,000.");
  if (new Set(s.items.map(item => item.productId)).size !== s.items.length) throw new Error("Add each inventory product only once per shipment.");
  if (withCode&&!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(s.reference)) throw new Error("Shipment reference must have 3–40 letters, numbers, hyphens or underscores.");
  if (!s.recipient || s.recipient.length > 120 || s.address.length < 10 || s.address.length > 500) throw new Error("Enter a recipient and a complete delivery address (10–500 characters).");
  if (!/^\+?[0-9 ()-]{8,20}$/.test(s.phone)||s.phone.replace(/\D/g,"").length<7||s.phone.replace(/\D/g,"").length>15) throw new Error("Enter a valid contact phone number.");
  if (!Number.isInteger(s.parcelCount) || s.parcelCount < 1 || s.parcelCount > 10000) throw new Error("Parcel count must be a whole number from 1 to 10,000.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.expectedDelivery) || Number.isNaN(Date.parse(s.expectedDelivery)) || new Date(s.expectedDelivery).toISOString().slice(0,10) !== s.expectedDelivery) throw new Error("Select a valid expected delivery date.");
  if (s.driver.length > 120 || s.handoverReference.length > 80) throw new Error("Driver or handover reference is too long.");
  if (!SHIPMENT_STATUSES.includes(s.status)) throw new Error("Select a valid shipment status.");
  if (s.status !== "Draft" && (!s.packed || !s.handoverReference)) throw new Error("Confirm picking and packing and provide the prepared-shipment reference first.");
  if (s.status === "Dispatched" && !s.driver) throw new Error("Assign delivery personnel before confirming dispatch.");
  return s;
}

export function validateWarehouseStep(input) {
  const step = inputText(input.step,"Warehouse step",20);
  const notes = inputText(input.notes,"Warehouse notes",240,3,true);
  const parcelCount = inputNumber(input.parcelCount,"parcel count",1,10000,true);
  if (!["Picking", "Packed", "HandedOver"].includes(step)) throw new Error("Choose a valid warehouse step.");
  if (notes.length < 3 || notes.length > 240) throw new Error("Enter warehouse notes from 3 to 240 characters.");
  if (!Number.isInteger(parcelCount) || parcelCount < 1 || parcelCount > 10000) throw new Error("Parcel count must be a whole number from 1 to 10,000.");
  return {step, notes, parcelCount};
}
