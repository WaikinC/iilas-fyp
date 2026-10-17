// Fixed versioned formats. Avoid object insertion-order and locale-dependent formatting.
export function canonicalRecord(kind,record){
  const time=value=>typeof value?.toMillis==='function'?value.toMillis():Number(value?.seconds||0)*1000;
  if(kind==='inventory'){
    const core=['IILAS-INVENTORY-v1',record.ownerId,record.id,record.productId,record.sku,record.type,record.quantity,record.quantityChange,record.reservedChange,record.quantityBefore,record.quantityAfter,record.reservedBefore,record.reservedAfter,record.locationFrom,record.locationTo,record.reference,record.reason,record.actor,time(record.createdAt),record.productVersion];
    if(record.integrityVersion===2)return JSON.stringify(['IILAS-INVENTORY-v2',core.slice(1),record.origin,record.reversesType||null,record.correctionOf||null,record.approvalId||null,record.shipmentId||null,record.purchaseOrderId||null,record.purchaseReceiptId||null,(record.allocations||[]).map(a=>[a.location,a.quantity]),(record.locationChanges||[]).map(a=>[a.location,a.quantityBefore,a.quantityAfter,a.reservedBefore,a.reservedAfter,a.warehouseBefore,a.warehouseAfter])]);
    return JSON.stringify(core);
  }
  if(kind==='delivery')return JSON.stringify(['IILAS-DELIVERY-v1',record.ownerId,record.id,record.shipmentId,record.type,record.sha256,record.bytes,record.contentType,record.actor,time(record.createdAt)]);
  throw new Error('Unsupported integrity workflow.');
}
