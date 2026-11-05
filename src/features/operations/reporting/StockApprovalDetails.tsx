import {useEffect, useState} from 'react';
import {collection, doc, getDocFromServer, getDocsFromServer, limitToLast, orderBy, query, where} from 'firebase/firestore';
import {db} from '../../../../lib/firebase';
import {timestampMillis} from '../../dashboard/dashboardData';
import type {DataRecord} from '../Operations';
import {approvalBins, linkedApprovalMovement} from './stockApprovalContext';

const text = (value: unknown, fallback = 'Unavailable') =>
  typeof value === 'string' && value.trim() ? value : fallback;
const units = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) ? value.toLocaleString('en-MY') : 'Unavailable';
const recordId = (value: unknown) =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : '';
const date = (value: unknown) => {
  const time = timestampMillis(value);
  return time > 0 && time <= 8.64e15
    ? new Date(time).toLocaleString('en-MY', {timeZone: 'Asia/Kuala_Lumpur'}) + ' MYT' : 'Date unavailable';
};

type Context = {
  product: DataRecord | null;
  original: DataRecord | null;
  resulting: DataRecord | null;
  history: DataRecord[] | null;
};

function Movement({row}: {row: DataRecord}) {
  const from = text(row.locationFrom, '');
  const to = text(row.locationTo, '');
  const location = from && to && from !== to ? `${from} → ${to}` : from || to || 'Bin unavailable';
  return <>
    <strong>{text(row.type, 'Movement')} · {units(row.quantity)} units</strong>
    <p>{date(row.createdAt)} · {location}</p>
    <p>Reference {text(row.reference, 'not recorded')} · Record {row.id}</p>
    <p>On hand {units(row.quantityBefore)} → {units(row.quantityAfter)}</p>
  </>;
}

export default function StockApprovalDetails({record, scope}: {record: DataRecord; scope: string}) {
  const productId = recordId(record.productId);
  const originalId = recordId(record.correctionOf);
  const resultingId = recordId(record.movementId);
  const input = record.input && typeof record.input === 'object' && !Array.isArray(record.input)
    ? record.input as Record<string, unknown> : {};
  const [context, setContext] = useState<Context | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    async function read(kind: 'products' | 'stockMovements', id: string) {
      if (!db || !id) return null;
      const snapshot = await getDocFromServer(doc(db, kind, id));
      const data = snapshot.data();
      return data?.ownerId === scope ? {...data, id: snapshot.id} as DataRecord : null;
    }
    async function history() {
      if (!db || !productId) return null;
      const snapshot = await getDocsFromServer(query(collection(db, 'stockMovements'),
        where('ownerId', '==', scope), where('productId', '==', productId), orderBy('createdAt'), limitToLast(5)));
      return snapshot.docs.map(d => linkedApprovalMovement({...d.data(), id: d.id} as DataRecord, productId, scope))
        .filter(row => row !== null).reverse();
    }
    async function load() {
      const [product, original, resulting, recent] = await Promise.all([
        read('products', productId).catch(() => null),
        read('stockMovements', originalId).catch(() => null),
        read('stockMovements', resultingId).catch(() => null),
        history().catch(() => null),
      ]);
      if (live) setContext({
        product,
        original: linkedApprovalMovement(original, productId, scope),
        resulting: linkedApprovalMovement(resulting, productId, scope),
        history: recent,
      });
    }
    void load();
    return () => { live = false; };
  }, [scope, productId, originalId, resultingId, attempt]);

  const bins = approvalBins(input, context?.product ?? null);
  const missingContext = context && (!context.product || context.history === null ||
    (originalId && !context.original) || (resultingId && !context.resulting));
  return <div className="stock-approval-details">
    <dl className="stock-approval-facts">
      <div><dt>Product</dt><dd>{text(context?.product?.name, context ? 'Unavailable' : 'Loading…')}</dd></div>
      <div><dt>SKU</dt><dd>{text(context?.product?.sku)}</dd></div>
      <div><dt>Product ID</dt><dd>{productId || 'Unavailable'}</dd></div>
      <div><dt>Product status</dt><dd>{context?.product?.archived ? 'Archived' : text(context?.product?.status)}</dd></div>
      <div><dt>Requested movement</dt><dd>{text(input.type)} {text(input.adjustmentDirection, '')} · {units(input.quantity)} units</dd></div>
      <div><dt>Request reference</dt><dd>{text(input.reference, 'Not recorded')}</dd></div>
      <div><dt>Requested at</dt><dd>{date(record.createdAt)}</dd></div>
    </dl>
    {!context && <p role="status">Loading stock context…</p>}
    {missingContext && <p className="reports-warning" role="status">Some stock context is unavailable. <button type="button" onClick={() => {
      setContext(null);
      setAttempt(value => value + 1);
    }}>Retry context</button></p>}
    <h4>Affected bins</h4>
    {bins.length ? <>
      <p>Recorded balances when these details were loaded.</p>
      <ul>{bins.map(bin => <li key={bin.location}><strong>{bin.location}</strong> · {bin.quantity === null || bin.reserved === null
        ? 'Balance unavailable' : `${units(bin.quantity)} on hand · ${units(bin.reserved)} reserved · ${units(bin.quantity - bin.reserved)} available`}</li>)}</ul>
    </> : <p>No bin was recorded on this request.</p>}
    {record.kind === 'Correction' && <section><h4>Original movement</h4>
      {context?.original ? <Movement row={context.original}/> : <p>{originalId || 'No linked record'}{context && originalId ? ' · Details unavailable' : ''}</p>}
    </section>}
    {resultingId && <section><h4>Resulting movement</h4>
      {context?.resulting ? <Movement row={context.resulting}/> : <p>{resultingId}{context ? ' · Details unavailable' : ''}</p>}
    </section>}
    <h4>Recent movement history</h4>
    {context && (context.history === null ? <p>Movement history unavailable.</p>
      : context.history.length ? <><p>Up to five dated movements for this product.</p>
        <ul className="stock-approval-history">{context.history.map(row => <li key={row.id}><Movement row={row}/></li>)}</ul></>
      : <p>No dated movements found for this product.</p>)}
  </div>;
}
