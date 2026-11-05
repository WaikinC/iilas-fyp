import {locationBalances, locationKey, locationName} from '../../../../lib/locationStock.js';
import type {DataRecord} from '../Operations';

type Bin = {location: string; quantity: number | null; reserved: number | null};

export function approvalBins(input: Record<string, unknown>, product: DataRecord | null): Bin[] {
  let balances: Bin[] = [];
  if (product) {
    try {
      balances = locationBalances(product);
    } catch {
      // An incomplete ledger cannot substantiate a bin balance.
    }
  }
  const bins = new Map<string, Bin>();
  for (const value of [input.locationFrom, input.locationTo]) {
    let location;
    try {
      location = locationName(value);
    } catch {
      continue;
    }
    const key = locationKey(location);
    const balance = balances.find(row => locationKey(row.location) === key);
    bins.set(key, {
      location: balance?.location ?? location,
      quantity: balance?.quantity ?? null,
      reserved: balance?.reserved ?? null,
    });
  }
  return [...bins.values()];
}

export function linkedApprovalMovement(record: DataRecord | null, productId: string, scope: string) {
  return record?.ownerId === scope && record.productId === productId ? record : null;
}
