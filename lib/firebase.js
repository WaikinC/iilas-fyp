import { initializeApp, getApps } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import config from "../firebase-config.json" with { type: "json" };
import { validateProduct, validateShipment, validateStockMovement } from "./validation.js";

export const configured = Boolean(config.apiKey && config.projectId && config.appId);
const app = configured ? (getApps()[0] || initializeApp(config)) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const projectId = config.projectId;
if (auth && db && typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings:true});
  connectFirestoreEmulator(db, "127.0.0.1", 8081);
}
const keys = (ownerId, kind, data) => kind === "products" ? [`${ownerId}_sku_${data.sku}`, `${ownerId}_barcode_${data.barcode}`] : [`${ownerId}_shipment_${data.reference}`];

export async function saveRecord(kind, input, existing) {
  if (!auth?.currentUser || !db) throw new Error("Please sign in again.");
  const data = kind === "products" ? validateProduct(input) : validateShipment(input);
  const ownerId = auth.currentUser.uid;
  const id = existing?.id || crypto.randomUUID();
  const record = doc(db, kind, id);
  await runTransaction(db, async transaction => {
    const current = existing ? await transaction.get(record) : null;
    const old = current?.exists() ? current.data() : null;
    if (existing && (!old || old.version !== existing.version)) throw new Error("This record changed. Close the form and reopen its latest version.");
    if (old && old.ownerId !== ownerId) throw new Error("You cannot change another account's record.");
    if (kind === "shipments" && old?.status === "Dispatched") throw new Error("Dispatched shipments are locked to preserve dispatch history.");
    if (kind === "products" && old?.archived === true) throw new Error("This product is archived. Restore it before editing.");
    const nextKeys = keys(ownerId, kind, data);
    const keySnapshots = await Promise.all(nextKeys.map(key => transaction.get(doc(db, "uniqueKeys", key))));
    if (keySnapshots.some(snapshot => snapshot.exists() && snapshot.data().recordId !== id)) throw new Error(kind === "products" ? "That SKU or barcode is already registered." : "That shipment reference is already registered.");
    let selectedProducts = [];
    if (kind === "shipments") {
      selectedProducts = await Promise.all(data.items.map(item => transaction.get(doc(db, "products", item.productId))));
      data.items = data.items.map((item, index) => {
        const selected = selectedProducts[index];
        if (!selected.exists() || selected.data().ownerId !== ownerId) throw new Error("A selected inventory product no longer exists. Reopen the shipment and choose products again.");
        const product = selected.data();
        if (product.status !== "Active") throw new Error(`${product.name} is inactive and cannot be dispatched.`);
        if (product.archived === true && !old?.items?.some(previous => previous.productId === item.productId)) throw new Error(`${product.name} is archived and cannot be added to a new shipment.`);
        const available = Number(product.quantityOnHand ?? 0) - Number(product.reservedQuantity ?? 0);
        if (data.status === "Dispatched" && available < item.quantity) throw new Error(`Not enough available stock for ${product.name}. Available: ${available}.`);
        return {productId:item.productId,sku:product.sku,name:product.name,quantity:item.quantity};
      });
    }
    const version = (old?.version || 0) + 1;
    const eventId = `${kind}_${id}_${version}`;
    const now = serverTimestamp();
    const payload = {...data, ownerId, version, createdAt: old?.createdAt || now, updatedAt: now, updatedBy: ownerId, lastEventId: eventId};
    if (kind === "products") {
      payload.archived = false;
      payload.lastShipmentId = old?.lastShipmentId || null;
      payload.lastStockMovementId = old?.lastStockMovementId || null;
    }
    if (kind === "shipments") payload.dispatchedAt = data.status === "Dispatched" ? now : null;
    if (old) for (const key of keys(ownerId, kind, old).filter(key => !nextKeys.includes(key))) transaction.delete(doc(db, "uniqueKeys", key));
    nextKeys.forEach((key, index) => { if (!keySnapshots[index].exists()) transaction.set(doc(db, "uniqueKeys", key), {ownerId,kind, recordId:id}); });
    transaction.set(record, payload);
    if (kind === "shipments" && data.status === "Dispatched") {
      data.items.forEach((item, index) => {
        const product = selectedProducts[index].data();
        const eventId = `product_${item.productId}_dispatch_${id}`;
        transaction.update(doc(db, "products", item.productId), {quantityOnHand:Number(product.quantityOnHand ?? 0)-item.quantity,reservedQuantity:Number(product.reservedQuantity ?? 0),version:Number(product.version ?? 0)+1,updatedAt:now,updatedBy:ownerId,lastEventId:eventId,lastShipmentId:id});
        transaction.set(doc(db, "auditLogs", eventId), {ownerId,kind:"products",recordId:item.productId,action:"Dispatch",actor:ownerId,at:now,version:Number(product.version ?? 0)+1,label:`${item.quantity} × ${product.name} (${data.reference})`});
      });
    }
    transaction.set(doc(db, "auditLogs", eventId), {ownerId,kind, recordId:id, action:old ? "Update" : "Create", actor:ownerId, at:now, version, label:data.name || data.reference});
  });
  return id;
}

export async function saveStockMovement(input) {
  if (!auth?.currentUser || !db) throw new Error("Please sign in again.");
  const data = validateStockMovement(input);
  const ownerId = auth.currentUser.uid;
  const movementId = crypto.randomUUID();
  const movementRef = doc(db, "stockMovements", movementId);
  const productRef = doc(db, "products", data.productId);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(productRef);
    if (!snapshot.exists() || snapshot.data().ownerId !== ownerId) throw new Error("The selected inventory product no longer exists.");
    const product = snapshot.data();
    if (product.archived === true || product.status !== "Active") throw new Error("Choose an active, non-archived product.");
    const quantityBefore = Number(product.quantityOnHand ?? 0);
    const reservedBefore = Number(product.reservedQuantity ?? 0);
    let quantityAfter = quantityBefore;
    let reservedAfter = reservedBefore;
    let locationTo = String(product.location ?? "");
    let quantityChange = 0;
    let reservedChange = 0;
    if (data.type === "Receipt") quantityChange = data.quantity;
    if (data.type === "Issue") quantityChange = -data.quantity;
    if (data.type === "Adjustment") quantityChange = data.adjustmentDirection === "Increase" ? data.quantity : -data.quantity;
    if (data.type === "Reservation") reservedChange = data.quantity;
    if (data.type === "Release") reservedChange = -data.quantity;
    if (data.type === "Transfer") {
      if (data.locationTo.toLowerCase() === String(product.location ?? "").toLowerCase()) throw new Error("Choose a different destination location.");
      if (data.quantity !== quantityBefore) throw new Error(`This product uses one storage location. Transfer the full on-hand quantity of ${quantityBefore}.`);
      locationTo = data.locationTo;
    }
    quantityAfter += quantityChange;
    reservedAfter += reservedChange;
    if (quantityAfter < 0) throw new Error(`Not enough stock. On hand: ${quantityBefore}.`);
    if (reservedAfter < 0) throw new Error(`Cannot release more than the ${reservedBefore} units currently reserved.`);
    if (reservedAfter > quantityAfter) throw new Error(`Only ${quantityBefore - reservedBefore} units are available after existing reservations.`);
    if (quantityAfter > 1000000 || reservedAfter > 1000000) throw new Error("The resulting quantity exceeds the supported limit of 1,000,000.");
    const version = Number(product.version ?? 0) + 1;
    const eventId = `stock_${movementId}`;
    const now = serverTimestamp();
    transaction.update(productRef, {
      quantityOnHand: quantityAfter,
      reservedQuantity: reservedAfter,
      location: locationTo,
      version,
      updatedAt: now,
      updatedBy: ownerId,
      lastEventId: eventId,
      lastStockMovementId: movementId,
    });
    transaction.set(movementRef, {
      ownerId,
      productId: data.productId,
      productName: String(product.name ?? ""),
      sku: String(product.sku ?? ""),
      type: data.type,
      quantity: data.quantity,
      quantityChange,
      reservedChange,
      quantityBefore,
      quantityAfter,
      reservedBefore,
      reservedAfter,
      locationFrom: String(product.location ?? ""),
      locationTo,
      reference: data.reference,
      reason: data.reason,
      actor: ownerId,
      createdAt: now,
      productVersion: version,
    });
    const label = `${data.type}: ${data.quantity} × ${String(product.name ?? "Product")}`;
    transaction.set(doc(db, "auditLogs", eventId), {ownerId,kind:"products",recordId:data.productId,action:data.type,actor:ownerId,at:now,version,label});
  });
  return movementId;
}
export async function deleteRecord(kind, existing) {
  if (!auth?.currentUser || !db) throw new Error("Please sign in again.");
  await runTransaction(db, async transaction => {
    const ref = doc(db, kind, existing.id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().version !== existing.version) throw new Error("The record changed. Refresh and try again.");
    const data = snapshot.data();
    if (data.ownerId !== auth.currentUser.uid) throw new Error("You cannot delete another account's record.");
    if (kind === "shipments" && data.status !== "Draft") throw new Error("Only draft shipments can be deleted.");
    const eventId = kind === "shipments" ? `shipments_${existing.id}_deleted` : `products_${existing.id}_${data.version + 1}`;
    const now = serverTimestamp();
    if (kind === "products") {
      if (data.archived === true) throw new Error("This product is already archived.");
      transaction.update(ref, {archived:true,reservedQuantity:Number(data.reservedQuantity ?? 0),lastStockMovementId:data.lastStockMovementId || null,version:data.version + 1,updatedAt:now,updatedBy:auth.currentUser.uid,lastEventId:eventId});
    } else {
      transaction.delete(ref);
      for (const key of keys(auth.currentUser.uid, kind, data)) transaction.delete(doc(db, "uniqueKeys", key));
    }
    transaction.set(doc(db,"auditLogs",eventId),{ownerId:auth.currentUser.uid,kind,recordId:existing.id,action:kind === "products" ? "Archive" : "Delete",actor:auth.currentUser.uid,at:now,version:data.version + 1,label:data.name || data.reference});
  });
}
