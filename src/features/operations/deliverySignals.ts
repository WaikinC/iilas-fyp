type SignalRecord = { [key: string]: unknown };

export function deliverySignals(shipment: SignalRecord, delivery: SignalRecord | undefined, now: number): string[] {
  const status = String(delivery?.status || 'Dispatched');
  const closed = ['Delivered', 'Returned'].includes(status);
  const signals: string[] = [];
  if (!closed && now > Date.parse(`${shipment.expectedDelivery}T23:59:59.999+08:00`)) signals.push('Expected delivery date exceeded');
  // Failed attempts remain useful history after closure; time-based alerts stop.
  if (Number(delivery?.failedAttempts) >= 2) signals.push('Repeated failed delivery attempts');
  const updated = delivery?.updatedAt as { seconds?: number; nanoseconds?: number } | undefined;
  const updatedMillis = Number(updated?.seconds) * 1000 + Number(updated?.nanoseconds || 0) / 1e6;
  if (!closed && updated && now - updatedMillis > 86400000) signals.push('No delivery update for 24 hours');
  return signals;
}
