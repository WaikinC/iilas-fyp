import { useEffect, useState, type ReactNode } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Activity, AlertTriangle, ArrowRight, ArrowUpRight, Camera, Clock, Navigation, Package, ShieldAlert, ShoppingCart, Truck } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../lib/firebase';
import { dashboardReviewAlerts, dashboardSummary, inventoryTrend, timestampMillis, type DashboardRecords, type DashboardRow as Row } from '../src/features/dashboard/dashboardData';
import { dashboardReviewLimit, useDashboardReviewRecords } from '../src/features/dashboard/useDashboardReviewRecords';

type Destination = 'dashboard' | 'products' | 'stock' | 'warehouse' | 'shipments' | 'procurement' | 'transport' | 'delivery' | 'reports';
type Props = { products: Row[]; shipments: Row[]; movements: Row[]; activities: Row[]; scope: string; role: string; uid: string; onNavigate: (tab: Destination, filter?: 'all' | 'lowStock') => void };
type Alert = { id: string; text: string; detail: string; tone: string; open: () => void };
type Kind = keyof DashboardRecords;
const collections: Record<Kind, string> = { purchases: 'purchaseOrders', deliveries: 'deliveries', predictions: 'predictions', evidence: 'evidence', verifications: 'verificationRecords', parcelAnalyses: 'parcelAnalyses' };
const label = (value: unknown) => typeof value === 'string' ? value : '';
const date = (value: unknown) => timestampMillis(value) ? new Date(timestampMillis(value)).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Saving…';
const statusColours: Record<string, string> = { Delivered: '#16a34a', Active: '#1b3b6f', Delayed: '#d97706', Failed: '#dc2626', Returned: '#6d28d9' };
const reviewStatus = (status: unknown) => status === 'NeedsFollowUp' ? 'Needs follow-up' : 'Pending review';

function useDashboardRecords(scope: string) {
  const [records, setRecords] = useState<DashboardRecords>({ purchases: [], deliveries: [], predictions: [], evidence: [], verifications: [] });
  const [loaded, setLoaded] = useState<Partial<Record<Kind, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<Kind, string>>>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!db) return;
    const store = db;
    const unsubscribe = (Object.entries(collections) as [Kind, string][]).map(([kind, name]) => onSnapshot(
      query(collection(store, name), where('ownerId', '==', scope)),
      snapshot => { setRecords(previous => ({ ...previous, [kind]: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) })); setLoaded(previous => ({ ...previous, [kind]: true })); setErrors(previous => { const next = { ...previous }; delete next[kind]; return next; }); },
      error => setErrors(previous => ({ ...previous, [kind]: error.message }))
    ));
    return () => unsubscribe.forEach(stop => stop());
  }, [scope, attempt]);
  return { records, errors, ready: (...kinds: Kind[]) => kinds.every(kind => loaded[kind] && !errors[kind]), retry: () => { setLoaded({}); setErrors({}); setAttempt(value => value + 1); } };
}

export default function Dashboard({ products, shipments, movements, activities, scope, role, uid, onNavigate }: Props) {
  const data = useDashboardRecords(scope);
  const review = useDashboardReviewRecords(scope, role, uid);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const visibleShipments = role === 'Driver' ? shipments.filter(s => s.driverUid === uid) : shipments;
  const visibleEvidence = role === 'Driver' ? data.records.evidence.filter(e => visibleShipments.some(s => s.id === e.shipmentId)) : data.records.evidence;
  const summary = dashboardSummary(products, visibleShipments, { ...data.records, evidence: visibleEvidence }, now);
  const trend = inventoryTrend(movements, now);
  const hasMovements = trend.some(row => row.stockIn || row.stockOut);
  const statuses = Object.entries(summary.statusCounts).map(([name, value]) => ({ name, value, color: statusColours[name] }));
  const deliveryReady = data.ready('deliveries');
  const legacyRiskReady = data.ready('deliveries', 'predictions');
  const parcelReady = data.ready('predictions', 'evidence', 'parcelAnalyses');
  const verificationReady = data.ready('predictions', 'evidence', 'verifications', 'parcelAnalyses');
  const recent = dashboardReviewAlerts(role, scope, visibleShipments, data.records.deliveries, review.records);
  const reviewFailed = review.failed || !!data.errors.deliveries;
  const reviewLoading = review.loading || (!deliveryReady && !data.errors.deliveries);
  const currentRisk = review.enabled ? recent.currentAI : summary.currentDeliveryPredictions;
  const highRisk = review.enabled ? recent.highRisk : summary.highRisk;
  const riskReady = review.enabled ? deliveryReady && review.status('deliveryAI') === 'ready' : legacyRiskReady;
  let riskDetail = 'Loading saved risk results…';
  if (riskReady) {
    if (review.enabled) {
      riskDetail = currentRisk.length ? `${currentRisk.length} recent deliveries analysed · demo` : 'No current RF results in recent records';
    } else {
      riskDetail = currentRisk.length ? `${currentRisk.length} active deliveries analysed` : 'No current saved risk predictions';
    }
  } else if (data.errors.deliveries || (review.enabled ? review.status('deliveryAI') === 'error' : data.errors.predictions)) {
    riskDetail = 'Saved risk results unavailable';
  }
  const reviewAlerts: Alert[] = [
    ...(deliveryReady ? recent.aiFollowUp.slice(0, 1).map(row => ({
      id: `delivery-ai-${row.id}`, text: `High delivery risk · ${row.reference}`,
      detail: `Saved demo Random Forest · ${reviewStatus(row.reviewStatus)}`, tone: 'red',
      open: () => onNavigate('delivery'),
    })) : []),
    ...(deliveryReady ? recent.ruleFollowUp.slice(0, 1).map(row => ({
      id: `delivery-rule-${row.id}`, text: `Delivery rule follow-up · ${row.reference}`,
      detail: `Saved rule assessment · ${reviewStatus(row.reviewStatus)}`, tone: 'amber',
      open: () => onNavigate('delivery'),
    })) : []),
    ...recent.integrity.slice(0, 1).map(row => ({
      id: `integrity-${row.id}`, text: `Integrity exception · ${row.kind === 'inventory' ? 'Stock movement' : 'Delivery proof'}`,
      detail: `Saved ${row.outcome === 'NotRegistered' ? 'not registered' : label(row.outcome).toLowerCase()} observation · ${label(row.recordId)}`,
      tone: row.outcome === 'Unmatched' ? 'red' : 'purple', open: () => onNavigate('reports'),
    })),
  ];
  const alerts: Alert[] = [
    ...reviewAlerts,
    ...summary.lowStock.slice(0, 2).map(p => ({ id: `stock-${p.id}`, text: `${label(p.name)} has reached its reorder level.`, detail: `${Number(p.quantityOnHand ?? 0) - Number(p.reservedQuantity ?? 0)} available · reorder at ${Number(p.reorderLevel ?? 0)}`, tone: 'amber', open: () => onNavigate('products', 'lowStock') })),
    ...(!review.enabled && legacyRiskReady ? summary.highRisk.slice(0, 1).map(p => ({ id: p.id, text: `${label(visibleShipments.find(s => s.id === p.recordId)?.reference)} has a saved high-risk prediction.`, detail: `${Math.round(Number(p.confidence) * 100)}% model confidence · ${label(p.reviewStatus)} review`, tone: 'red', open: () => onNavigate('reports') })) : []),
    ...(parcelReady ? summary.damageAlerts.slice(0, 1).map(p => ({ id: p.id, text: 'Possible parcel damage recorded for human review.', detail: `${Math.round(Number(p.confidence) * 100)}% model confidence · ${label(p.reviewStatus)} review`, tone: 'red', open: () => onNavigate('reports') })) : []),
    ...(verificationReady && summary.pendingVerification.length ? [{ id: 'verification', text: `${summary.pendingVerification.length} evidence records await blockchain registration.`, detail: 'Proofs of delivery and accepted damage results', tone: 'purple', open: () => onNavigate('reports') }] : []),
  ];
  const links: { name: string; tab: Destination; tone: string }[] = [
    { name: 'Product Management', tab: 'products', tone: 'blue' }, { name: 'Stock Management', tab: 'stock', tone: 'blue' },
    { name: 'Warehouse Operations', tab: 'warehouse', tone: 'blue' }, { name: 'Order & Dispatch', tab: 'shipments', tone: 'purple' },
    { name: 'Delivery Monitoring', tab: 'delivery', tone: 'purple' }, { name: 'Reporting & Verification', tab: 'reports', tone: 'purple' },
  ];
  return <div className="dashboard prototype-dashboard">
    <header className="page-heading"><div><h1>Dashboard</h1><p>{role === 'Driver' ? 'Shared inventory and your assigned deliveries.' : 'Your shared inventory and logistics overview.'}</p></div><button className="secondary-button" onClick={() => onNavigate('reports')}>View reports <ArrowUpRight size={16}/></button></header>
    {Object.keys(data.errors).length > 0 && <div className="dashboard-load-error" role="alert"><span>Some dashboard records could not be loaded. Unavailable counts are shown as —.</span><button className="secondary-button" onClick={data.retry}>Retry dashboard</button></div>}
    <div className="prototype-stats" aria-label="Inventory and logistics summaries">
      <Stat icon={<Package size={19}/>} value={products.length} title="Total products" detail={`${summary.activeProducts.length} active products`} tone="blue" onClick={() => onNavigate('products')}/>
      <Stat icon={<AlertTriangle size={19}/>} value={summary.lowStock.length} title="Low-stock items" detail="At or below reorder level" tone="amber" onClick={() => onNavigate('products', 'lowStock')}/>
      <Stat icon={<ShoppingCart size={19}/>} value={data.ready('purchases') ? summary.pendingPurchases.length : null} title="Pending purchase orders" detail="Awaiting approval or receipt" tone="blue" onClick={() => onNavigate('procurement')}/>
      <Stat icon={<Truck size={19}/>} value={summary.prepared.length} title="Prepared shipments" detail="Warehouse handover complete" tone="purple" onClick={() => onNavigate('shipments')}/>
      <Stat icon={<Navigation size={19}/>} value={deliveryReady ? summary.activeDeliveries.length : null} title="Active deliveries" detail={role === 'Driver' ? 'Your dispatched, unfinished jobs' : 'Dispatched, not delivered or returned'} tone="blue" onClick={() => onNavigate('delivery')}/>
      <Stat icon={<ShieldAlert size={19}/>} value={riskReady && currentRisk.length ? highRisk.length : null} title="High-risk deliveries" detail={riskDetail} tone="red" onClick={() => onNavigate(review.enabled ? 'delivery' : 'reports')}/>
      <Stat icon={<Camera size={19}/>} value={parcelReady && summary.currentParcelPredictions.length ? summary.damageAlerts.length : null} title="Damage alerts" detail={!parcelReady ? 'Loading saved parcel results…' : summary.currentParcelPredictions.length ? `${summary.currentParcelPredictions.length} current, human-accepted assessments` : 'No current accepted parcel assessments'} tone="red" onClick={() => onNavigate('reports')}/>
      <Stat icon={<Clock size={19}/>} value={verificationReady ? summary.pendingVerification.length : null} title="Evidence awaiting verification" detail="Proofs and accepted damage results" tone="purple" onClick={() => onNavigate('reports')}/>
    </div>
    <div className="prototype-charts">
      <section className="dashboard-panel trend-panel"><div className="dashboard-panel-heading"><div><h2>Inventory level trend</h2><p>Recorded stock-in vs stock-out · last 6 months</p></div><button onClick={() => onNavigate('stock')}>View movements <ArrowRight size={14}/></button></div>
        {hasMovements ? <div className="dashboard-chart"><ResponsiveContainer width="100%" height={230} minWidth={0}><AreaChart data={trend} margin={{ top: 10, right: 8, left: -15, bottom: 0 }} accessibilityLayer><defs><linearGradient id="stock-in-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1b3b6f" stopOpacity={0.2}/><stop offset="95%" stopColor="#1b3b6f" stopOpacity={0}/></linearGradient><linearGradient id="stock-out-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6d28d9" stopOpacity={0.16}/><stop offset="95%" stopColor="#6d28d9" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#e2e6ed"/><XAxis dataKey="month" tick={{ fontSize: 11, fill: '#626b7c' }}/><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#626b7c' }}/><Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #dde1ea' }}/><Area type="monotone" dataKey="stockIn" name="Stock in" stroke="#1b3b6f" strokeWidth={2} fill="url(#stock-in-fill)" isAnimationActive={false}/><Area type="monotone" dataKey="stockOut" name="Stock out" stroke="#6d28d9" strokeWidth={2} fill="url(#stock-out-fill)" isAnimationActive={false}/></AreaChart></ResponsiveContainer></div> : <div className="dashboard-chart-empty"><Package size={28}/><p>No receipts or issues recorded in these six months.</p><button onClick={() => onNavigate('stock')}>Open Stock Management</button></div>}
        <div className="chart-key"><span><i style={{ background: '#1b3b6f' }}/>Stock in</span><span><i style={{ background: '#6d28d9' }}/>Stock out</span></div>
        <details className="chart-values"><summary>View monthly chart values</summary><div className="table-wrap" role="region" aria-label="Monthly stock flow" tabIndex={0}><table><thead><tr><th scope="col">Month</th><th scope="col">Stock in</th><th scope="col">Stock out</th></tr></thead><tbody>{trend.map(row => <tr key={row.key}><th scope="row">{row.month}</th><td>{row.stockIn.toLocaleString()}</td><td>{row.stockOut.toLocaleString()}</td></tr>)}</tbody></table></div></details>
      </section>
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><h2>Delivery status</h2><p>{deliveryReady ? `${summary.dispatchedCount} dispatched shipments · all stored records` : 'Loading delivery records…'}</p></div></div>
        {deliveryReady && summary.dispatchedCount > 0 ? <div className="dashboard-chart"><ResponsiveContainer width="100%" height={170} minWidth={0}><PieChart accessibilityLayer><Pie data={statuses.filter(s => s.value)} innerRadius={49} outerRadius={73} dataKey="value" paddingAngle={3} isAnimationActive={false}>{statuses.filter(s => s.value).map(status => <Cell key={status.name} fill={status.color}/>)}</Pie><Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}/></PieChart></ResponsiveContainer></div> : <div className="delivery-chart-empty"><Truck size={28}/><p>{deliveryReady ? 'Delivery progress appears after dispatch.' : 'Waiting for delivery records.'}</p></div>}
        <ul className="delivery-legend" aria-label="Delivery status counts">{statuses.map(status => <li key={status.name}><span><i style={{ background: status.color }}/>{status.name === 'Failed' ? 'Attempt failed' : status.name}</span><b>{deliveryReady ? status.value : '—'}</b></li>)}</ul><p className="chart-footnote">Delayed means the expected delivery date has passed. Returned deliveries are closed.</p>
      </section>
    </div>
    <div className="prototype-bottom">
      <section className="dashboard-panel">
        <div className="dashboard-panel-heading"><div><h2>Recent alerts</h2><p>Saved results and current stock checks</p></div><AlertTriangle size={17}/></div>
        {review.enabled && reviewLoading && <p role="status">Loading recent review alerts…</p>}
        {review.enabled && reviewFailed && <p role="alert">Some review alerts are unavailable.</p>}
        {review.enabled && review.failed && <button className="secondary-button" onClick={review.retry}>Retry review alerts</button>}
        <div className="dashboard-alerts">{(review.enabled ? alerts : alerts.slice(0, 4)).map(alert =>
          <button className={`dashboard-alert ${alert.tone}`} key={alert.id} onClick={alert.open}>
            <AlertTriangle size={15}/><span><b>{alert.text}</b><small>{alert.detail}</small></span><ArrowRight size={14}/>
          </button>)}
          {!alerts.length && (!review.enabled || !reviewLoading && !reviewFailed) &&
            <p className="dashboard-empty">No stock alerts or saved analysis alerts to review.</p>}
        </div>
        {review.enabled && <p className="chart-footnote">One review alert per category from up to {dashboardReviewLimit} recent records per source. In Delivery Monitoring, choose Risk &amp; follow-up. In Reports &amp; Statistics, open research and integrity tools.</p>}
        <p className="chart-footnote">Risk and parcel cards show saved predictions.</p>
      </section>
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><h2>Recent activity</h2><p>Latest changes across the shared system</p></div><Activity size={17}/></div>{activities.length ? <ul className="prototype-activity">{activities.slice(0, 4).map(item => <li key={item.id}><span className="event-icon"><Activity size={14}/></span><div><b>{label(item.label) || `${label(item.action)} record`}</b><small><span className={['evidence', 'verificationRecords', 'predictions'].includes(label(item.kind)) ? 'activity-kind purple' : 'activity-kind blue'}>{label(item.action)}</span><time>{date(item.at)}</time></small></div></li>)}</ul> : <p className="dashboard-empty">Saved operational changes will appear here.</p>}</section>
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><h2>Quick links</h2><p>Continue work in your modules</p></div></div><div className="dashboard-quick-links">{links.map(link => <button key={link.tab} className={link.tone} onClick={() => onNavigate(link.tab)}>{link.name}<ArrowRight size={14}/></button>)}</div></section>
    </div>
  </div>;
}
function Stat({ icon, value, title, detail, tone, onClick }: { icon: ReactNode; value: number | null; title: string; detail: string; tone: string; onClick: () => void }) {
  return <button className={`prototype-stat ${tone}`} onClick={onClick}><span className="prototype-stat-top"><span className="prototype-stat-icon">{icon}</span><ArrowUpRight size={14}/></span><span className="prototype-stat-value">{value === null ? '—' : value.toLocaleString()}</span><span className="prototype-stat-title">{title}</span><small>{detail}</small></button>;
}
