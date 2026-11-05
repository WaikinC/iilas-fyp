import {createHash} from 'node:crypto';

const claimKind = 'manualStockReference';
const historyLimit = 25;
const fail = (message, code) => {
  throw Object.assign(Error(message), {code, publicMessage: message});
};
const duplicate = () => fail(
  'This reference is already used or pending for this product and movement type. Use a distinct reference for a separate movement.',
  'already-exists',
);

export async function prepareStockReference(tx, db, {scope, productId, type, reference, approvalId, reject = false}) {
  const canonical = typeof reference === 'string' ? reference.trim().toUpperCase() : '';
  if (!canonical) return null;
  const hash = createHash('sha256').update(JSON.stringify([scope, productId, type, canonical])).digest('hex');
  const key = db.collection('uniqueKeys').doc('stock_reference_' + hash);
  const snapshot = await tx.get(key);
  const claim = snapshot.data();
  const ownPending = approvalId && claim?.ownerId === scope && claim.kind === claimKind &&
    claim.state === 'Pending' && claim.recordId === approvalId;
  if (reject) return ownPending ? key : null;
  if (snapshot.exists && !ownPending) duplicate();

  const movements = await tx.get(db.collection('stockMovements')
    .where('ownerId', '==', scope).where('productId', '==', productId)
    .where('type', '==', type).where('reference', '==', canonical)
    .select('origin', 'shipmentId', 'purchaseOrderId', 'purchaseReceiptId').limit(historyLimit + 1));
  const origin = type === 'Correction' ? 'Correction' : 'Manual';
  if (movements.docs.some(doc => {
    const row = doc.data();
    return row.origin === origin || (!row.origin && !row.shipmentId && !row.purchaseOrderId && !row.purchaseReceiptId);
  })) duplicate();
  if (movements.size > historyLimit) {
    fail('This reference has too much linked movement history to check safely. Use a distinct reference.', 'failed-precondition');
  }

  // Older pending approvals have no key. They still reserve their reference
  // against new requests. A reviewer may resolve one of two legacy duplicates.
  if (!approvalId && ['Adjustment', 'Correction'].includes(type)) {
    const pending = await tx.get(db.collection('approvals')
      .where('ownerId', '==', scope).where('productId', '==', productId)
      .where('kind', '==', type).where('status', '==', 'Pending')
      .where('input.reference', '==', canonical).limit(1));
    if (!pending.empty) duplicate();
  }
  return key;
}

export function saveStockReference(tx, key, scope, actor, state, recordId) {
  if (key) tx.set(key, {ownerId: scope, actor, kind: claimKind, state, recordId});
}
