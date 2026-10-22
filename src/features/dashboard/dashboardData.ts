export type DashboardRow = { id: string; [key: string]: unknown };
export type DashboardRecords = {
  purchases: DashboardRow[]; deliveries: DashboardRow[]; predictions: DashboardRow[];
  evidence: DashboardRow[]; verifications: DashboardRow[]; parcelAnalyses?: DashboardRow[];
};
export const timestampMillis = (value: unknown): number => {
  if (!value || typeof value !== 'object' || !('seconds' in value)) return 0;
  return Number(value.seconds) * 1000 + Number('nanoseconds' in value ? value.nanoseconds : 0) / 1e6;
};
const latestPredictions = (records: DashboardRow[], kind: string) => {
  const latest = new Map<string, DashboardRow>();
  const time = (row: DashboardRow) => kind === 'parcel' && typeof row.createdAt === 'number' && Number.isSafeInteger(row.createdAt) && row.createdAt >= 0 ? row.createdAt : timestampMillis(row.createdAt);
  for (const row of records.filter(r => r.kind === kind)) {
    const key = String(row.recordId), previous = latest.get(key);
    if (!previous || time(row) > time(previous)) latest.set(key, row);
  }
  return [...latest.values()];
};

export function dashboardSummary(products: DashboardRow[], shipments: DashboardRow[], records: DashboardRecords, now: number) {
  const activeProducts = products.filter(p => p.status === 'Active');
  const lowStock = activeProducts.filter(p => Number(p.quantityOnHand ?? 0) - Number(p.reservedQuantity ?? 0) <= Number(p.reorderLevel ?? 0));
  const dispatched = shipments.filter(s => s.status === 'Dispatched');
  const deliveries = dispatched.map(s => ({ shipment: s, status: String(records.deliveries.find(d => d.id === s.id)?.status || 'Dispatched') }));
  const activeDeliveries = deliveries.filter(d => !['Delivered', 'Returned'].includes(d.status));
  const currentDeliveryPredictions = latestPredictions(records.predictions, 'delivery').filter(p => {
    const delivery = activeDeliveries.find(d => d.shipment.id === p.recordId);
    const progress = records.deliveries.find(d => d.id === p.recordId);
    return delivery && p.sourceVersion === delivery.shipment.version && p.reviewStatus !== 'Rejected' &&
      timestampMillis(p.createdAt) >= timestampMillis(progress?.updatedAt);
  });
  const highRisk = currentDeliveryPredictions.filter(p => String(p.label).toLowerCase() === 'high');
  const currentParcelPredictions = latestPredictions(records.predictions, 'parcel').filter(p => {
    const evidence = records.evidence.find(e => e.id === p.recordId);
    const analysis = records.parcelAnalyses?.find(a => a.analysisId === p.analysisId && a.id === p.analysisId);
    const shipment = shipments.find(s => s.id === evidence?.shipmentId);
    const stageCurrent = evidence?.stage === 'Pre-dispatch' && shipment?.status === 'Prepared' || evidence?.stage === 'Delivery' && shipment?.status === 'Dispatched';
    return evidence?.type === 'Parcel Image' && stageCurrent && analysis?.state === 'Predicted' &&
      p.reviewStatus === 'Accepted' && analysis.reviewStatus === 'Accepted' &&
      ['Normal', 'Damaged'].includes(String(p.label)) && p.label === analysis.label &&
      analysis.predictionId === p.id && p.sourceVersion === evidence.version && analysis.evidenceVersion === evidence.version &&
      typeof evidence.sha256 === 'string' && /^[a-f0-9]{64}$/.test(evidence.sha256) &&
      p.evidenceSha256 === evidence.sha256 && analysis.evidenceSha256 === evidence.sha256 &&
      p.stage === evidence.stage && analysis.stage === evidence.stage && analysis.evidenceId === evidence.id &&
      p.shipmentId === shipment?.id && analysis.shipmentId === shipment?.id &&
      evidence.ownerId === p.ownerId && analysis.ownerId === evidence.ownerId;
  });
  const damageAlerts = currentParcelPredictions.filter(p => String(p.label).toLowerCase() === 'damaged');
  const verificationCandidates = records.evidence.filter(e => e.type === 'Proof of Delivery' ||
    (e.type === 'Parcel Image' && damageAlerts.some(p => p.recordId === e.id && p.reviewStatus === 'Accepted')));
  const pendingVerification = verificationCandidates.filter(e => !records.verifications.some(v => v.kind === 'delivery' && v.recordId === e.id && v.status === 'Verified'));
  const statusCounts = { Delivered: 0, Active: 0, Delayed: 0, Failed: 0, Returned: 0 };
  for (const delivery of deliveries) {
    const overdue = now > Date.parse(`${delivery.shipment.expectedDelivery}T23:59:59.999+08:00`);
    const bucket = delivery.status === 'Delivered' ? 'Delivered' : delivery.status === 'Returned' ? 'Returned' :
      delivery.status === 'Attempt Failed' ? 'Failed' : overdue ? 'Delayed' : 'Active';
    statusCounts[bucket]++;
  }
  return {
    activeProducts, lowStock, prepared: shipments.filter(s => s.status === 'Prepared'),
    pendingPurchases: records.purchases.filter(p => ['Submitted', 'Approved', 'Issued', 'PartReceived'].includes(String(p.status))),
    activeDeliveries, currentDeliveryPredictions, highRisk, currentParcelPredictions, damageAlerts, pendingVerification,
    statusCounts, dispatchedCount: dispatched.length,
  };
}

// Group immutable receipts and issues by Malaysia calendar month. Transfers and reservations are not stock flow.
export function inventoryTrend(movements: DashboardRow[], now: number) {
  const local = new Date(now + 8 * 3600000);
  const months = Array.from({ length: 6 }, (_, i) => {
    const month = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 5 + i, 1));
    return { key: month.toISOString().slice(0, 7), month: month.toLocaleDateString('en-MY', { month: 'short', year: '2-digit', timeZone: 'UTC' }), stockIn: 0, stockOut: 0 };
  });
  for (const row of movements) {
    const time = timestampMillis(row.createdAt);
    if (!time || time > now || !['Receipt', 'Issue'].includes(String(row.type))) continue;
    const key = new Date(time + 8 * 3600000).toISOString().slice(0, 7), bucket = months.find(m => m.key === key);
    if (bucket) bucket[row.type === 'Receipt' ? 'stockIn' : 'stockOut'] += Number(row.quantity) || 0;
  }
  return months;
}
