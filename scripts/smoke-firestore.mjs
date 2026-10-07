import assert from "node:assert/strict";
import { createUserWithEmailAndPassword, connectAuthEmulator, signOut } from "firebase/auth";
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { auth, db, deleteRecord, saveRecord, saveStockMovement } from "../lib/firebase.js";

connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8081);

const suffix = crypto.randomUUID().slice(0, 8);
const first = await createUserWithEmailAndPassword(auth, `supervisor-${suffix}@example.test`, "LocalTestPassword123!");
const ownerId = first.user.uid;

const product = {
  name: "Test Pump", sku: `SKU-${suffix}`, barcode: "8888001234567",
  category: "Custom Pumps", location: "A-01", reorderLevel: "3", quantityOnHand: "5", status: "Active",
  imageDataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==",
};
const productId = await saveRecord("products", product);
let snapshot = await getDoc(doc(db, "products", productId));
assert.equal(snapshot.data().name, "Test Pump");
assert.equal(snapshot.data().ownerId, ownerId);
assert.equal(snapshot.data().category, "Custom Pumps");
assert.equal(snapshot.data().quantityOnHand, 5);
assert.equal(snapshot.data().reservedQuantity, 0);
assert.equal(snapshot.data().imageDataUrl, product.imageDataUrl);
await assert.rejects(() => saveRecord("products", { ...product, name: "Duplicate" }), /already registered/);
await saveRecord("products", { ...product, name: "Updated Pump" }, { id: productId, version: 1 });
snapshot = await getDoc(doc(db, "products", productId));
assert.equal(snapshot.data().name, "Updated Pump");
const shipment = {
  reference: `SHP-${suffix}`, recipient: "Test Recipient", phone: "0123456789",
  address: "1 Test Road, Kuala Lumpur", handoverReference: "", driver: "",
  status: "Draft", expectedDelivery: "2026-09-20", parcelCount: "2", packed: false,
  items: [{ productId, quantity: 2 }],
};
const shipmentId = await saveRecord("shipments", shipment);
assert.equal((await getDoc(doc(db, "shipments", shipmentId))).data().status, "Draft");
await assert.rejects(() => saveRecord("shipments", { ...shipment, status: "Dispatched" }, { id: shipmentId, version: 1 }), /Confirm picking and packing/);
await saveRecord("shipments", { ...shipment, handoverReference: "PS-001", packed: true, status: "Prepared" }, { id: shipmentId, version: 1 });
await saveRecord("shipments", { ...shipment, handoverReference: "PS-001", packed: true, driver: "Test Driver", status: "Dispatched" }, { id: shipmentId, version: 2 });
assert.equal((await getDoc(doc(db, "shipments", shipmentId))).data().status, "Dispatched");
assert.deepEqual((await getDoc(doc(db, "shipments", shipmentId))).data().items.map(item => [item.sku, item.quantity]), [[product.sku.toUpperCase(), 2]]);
assert.equal((await getDoc(doc(db, "products", productId))).data().quantityOnHand, 3);
await assert.rejects(() => deleteRecord("shipments", { id: shipmentId, version: 3 }), /Only draft shipments/);

const excess = { ...shipment, reference: `SHPX-${suffix}`, items: [{ productId, quantity: 4 }] };
const excessId = await saveRecord("shipments", excess);
await assert.rejects(() => saveRecord("shipments", { ...excess, handoverReference: "PS-002", packed: true, driver: "Test Driver", status: "Dispatched" }, { id: excessId, version: 1 }), /Not enough available stock/);
assert.equal((await getDoc(doc(db, "products", productId))).data().quantityOnHand, 3);
await deleteRecord("shipments", { id: excessId, version: 1 });

await saveStockMovement({productId,type:"Receipt",quantity:2,reference:"PO-001",reason:"Supplier delivery received"});
await saveStockMovement({productId,type:"Reservation",quantity:3,reference:"SO-001",reason:"Reserve units for planned dispatch"});
await assert.rejects(() => saveStockMovement({productId,type:"Issue",quantity:3,reference:"ISS-001",reason:"Manual issue should exceed available"}), /available/);
await saveStockMovement({productId,type:"Release",quantity:1,reference:"SO-001",reason:"One reserved unit no longer needed"});
await saveStockMovement({productId,type:"Issue",quantity:2,reference:"ISS-002",reason:"Issued for internal maintenance"});
await saveStockMovement({productId,type:"Adjustment",adjustmentDirection:"Increase",quantity:4,reference:"COUNT-001",reason:"Verified physical stock count"});
await saveStockMovement({productId,type:"Transfer",quantity:7,locationTo:"B-02",reference:"MOVE-001",reason:"Relocate the full product balance"});
snapshot = await getDoc(doc(db, "products", productId));
assert.equal(snapshot.data().quantityOnHand, 7);
assert.equal(snapshot.data().reservedQuantity, 2);
assert.equal(snapshot.data().location, "B-02");
assert.equal((await getDocs(query(collection(db, "stockMovements"), where("ownerId", "==", ownerId)))).size, 6);
await deleteRecord("products", { id: productId, version: 9 });
assert.equal((await getDoc(doc(db, "products", productId))).data().archived, true);
assert.equal((await getDocs(query(collection(db, "products"), where("ownerId", "==", ownerId)))).docs.filter(doc => doc.data().archived !== true).length, 0);

await signOut(auth);
await createUserWithEmailAndPassword(auth, `other-${suffix}@example.test`, "LocalTestPassword123!");
assert.equal((await getDocs(query(collection(db, "shipments"), where("ownerId", "==", auth.currentUser.uid)))).empty, true);
await assert.rejects(() => getDoc(doc(db, "shipments", shipmentId)), /permission/i);
await signOut(auth);
console.log("Firestore emulator smoke test passed: product CRUD/archive, linked dispatch, receipt, reservation, release, issue, adjustment, transfer, and account isolation.");
