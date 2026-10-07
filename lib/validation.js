export const PRODUCT_STATUSES = ["Active", "Inactive"];
export const SHIPMENT_STATUSES = ["Draft", "Prepared", "Dispatched"];
export const STOCK_MOVEMENT_TYPES = ["Receipt", "Issue", "Adjustment", "Reservation", "Release", "Transfer"];
export function validateProduct(data) {
  const p = Object.fromEntries(["name", "sku", "barcode", "category", "location", "status"].map(k => [k, String(data[k] ?? "").trim()]));
  p.sku = p.sku.toUpperCase();
  p.reorderLevel = Number(data.reorderLevel);
  p.quantityOnHand = Number(data.quantityOnHand);
  p.reservedQuantity = Number(data.reservedQuantity ?? 0);
  p.imageDataUrl = String(data.imageDataUrl ?? "");
  if (!p.name || p.name.length > 120) throw new Error("Enter a product name (1–120 characters).");
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(p.sku)) throw new Error("SKU must have 3–40 letters, numbers, hyphens or underscores.");
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
    productId: String(data.productId ?? "").trim(),
    type: String(data.type ?? "").trim(),
    adjustmentDirection: String(data.adjustmentDirection ?? "").trim(),
    locationTo: String(data.locationTo ?? "").trim(),
    reference: String(data.reference ?? "").trim().toUpperCase(),
    reason: String(data.reason ?? "").trim(),
    quantity: Number(data.quantity),
  };
  if (!/^[a-f0-9-]{36}$/.test(movement.productId)) throw new Error("Choose an inventory product.");
  if (!STOCK_MOVEMENT_TYPES.includes(movement.type)) throw new Error("Choose a valid stock movement type.");
  if (!Number.isInteger(movement.quantity) || movement.quantity < 1 || movement.quantity > 1000000) throw new Error("Quantity must be a whole number from 1 to 1,000,000.");
  if (movement.type === "Adjustment" && !["Increase", "Decrease"].includes(movement.adjustmentDirection)) throw new Error("Choose whether the adjustment increases or decreases stock.");
  if (movement.type === "Transfer" && (!movement.locationTo || movement.locationTo.length > 80)) throw new Error("Enter a destination location within 80 characters.");
  if (movement.reference.length > 80) throw new Error("Reference must be 80 characters or fewer.");
  if (movement.reason.length < 3 || movement.reason.length > 240) throw new Error("Enter a reason from 3 to 240 characters.");
  return movement;
}
export function validateShipment(data) {
  const s = Object.fromEntries(["reference", "recipient", "phone", "address", "handoverReference", "driver", "status", "expectedDelivery"].map(k => [k, String(data[k] ?? "").trim()]));
  s.reference = s.reference.toUpperCase();
  s.parcelCount = Number(data.parcelCount);
  s.packed = data.packed === true;
  if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 2) throw new Error("Choose 1–2 inventory products for the shipment.");
  s.items = data.items.map(item => ({productId:String(item?.productId ?? ""),quantity:Number(item?.quantity)}));
  if (s.items.some(item => !/^[a-f0-9-]{36}$/.test(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000)) throw new Error("Each shipment item needs a valid product and quantity from 1 to 10,000.");
  if (new Set(s.items.map(item => item.productId)).size !== s.items.length) throw new Error("Add each inventory product only once per shipment.");
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(s.reference)) throw new Error("Shipment reference must have 3–40 letters, numbers, hyphens or underscores.");
  if (!s.recipient || s.recipient.length > 120 || s.address.length < 10 || s.address.length > 500) throw new Error("Enter a recipient and a complete delivery address (10–500 characters).");
  if (!/^\+?[0-9 ()-]{8,20}$/.test(s.phone)) throw new Error("Enter a valid contact phone number.");
  if (!Number.isInteger(s.parcelCount) || s.parcelCount < 1 || s.parcelCount > 10000) throw new Error("Parcel count must be a whole number from 1 to 10,000.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.expectedDelivery) || Number.isNaN(Date.parse(s.expectedDelivery)) || new Date(s.expectedDelivery).toISOString().slice(0,10) !== s.expectedDelivery) throw new Error("Select a valid expected delivery date.");
  if (s.driver.length > 120 || s.handoverReference.length > 80) throw new Error("Driver or handover reference is too long.");
  if (!SHIPMENT_STATUSES.includes(s.status)) throw new Error("Select a valid shipment status.");
  if (s.status !== "Draft" && (!s.packed || !s.handoverReference)) throw new Error("Confirm picking and packing and provide the prepared-shipment reference first.");
  if (s.status === "Dispatched" && !s.driver) throw new Error("Assign delivery personnel before confirming dispatch.");
  return s;
}
