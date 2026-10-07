import { Activity, ArrowRight, Box, CheckCircle, ClipboardList, Package, Truck } from "lucide-react";

type Row = { id: string; [key: string]: unknown };
type Props = {
  products: Row[];
  shipments: Row[];
  activities: Row[];
  onNavigate: (tab: "dashboard" | "products" | "stock" | "shipments", productFilter?: "all" | "lowStock") => void;
};

const label = (value: unknown) => typeof value === "string" ? value : "";
const date = (value: unknown) => {
  const seconds = value && typeof value === "object" && "seconds" in value ? Number(value.seconds) : NaN;
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toLocaleString() : "Just now";
};

export default function Dashboard({ products, shipments, activities, onNavigate }: Props) {
  const active = products.filter(p => p.status === "Active").length;
  const lowStock = products.filter(p => p.status === "Active" && Number(p.quantityOnHand ?? 0) - Number(p.reservedQuantity ?? 0) <= Number(p.reorderLevel ?? 0)).length;
  const draft = shipments.filter(s => s.status === "Draft").length;
  const prepared = shipments.filter(s => s.status === "Prepared").length;
  const dispatched = shipments.filter(s => s.status === "Dispatched").length;
  const categoryCounts = Object.entries(products.reduce<Record<string, number>>((result, product) => {
    const category = label(product.category) || "Uncategorised";
    result[category] = (result[category] || 0) + 1;
    return result;
  }, {})).sort((a, b) => b[1] - a[1]);
  const largestCategory = categoryCounts[0]?.[1] || 1;
  const shipmentStages = [
    { name: "Draft", count: draft, color: "#94a3b8" },
    { name: "Prepared", count: prepared, color: "#16a34a" },
    { name: "Dispatched", count: dispatched, color: "#1b3b6f" },
  ];
  const recent = activities.slice(0, 5);

  return <div className="dashboard">
      <div className="dashboard-heading"><div><h1>Dashboard</h1><p>Live overview of your inventory and dispatch records</p></div></div>
    <div className="dashboard-stats">
      <Stat icon={<Package size={19}/>} value={products.length} title="Total products" detail={`${active} active`} color="navy" onClick={() => onNavigate("products")}/>
      <Stat icon={<Box size={19}/>} value={lowStock} title="At or below reorder level" detail="Available stock to replenish" color="amber" onClick={() => onNavigate("stock")}/>
      <Stat icon={<ClipboardList size={19}/>} value={draft + prepared} title="Pending shipments" detail={`${prepared} prepared for dispatch`} color="amber" onClick={() => onNavigate("shipments")}/>
      <Stat icon={<Truck size={19}/>} value={dispatched} title="Dispatched records" detail="Completed dispatch handovers" color="navy" onClick={() => onNavigate("shipments")}/>
    </div>

    <div className="dashboard-chart-grid">
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><h2>Products by category</h2><p>Current catalogue breakdown</p></div><button onClick={() => onNavigate("products")}>View products <ArrowRight size={14}/></button></div>
        {categoryCounts.length ? <div className="category-chart">{categoryCounts.slice(0, 6).map(([name, count]) => <div className="category-row" key={name}><span title={name}>{name}</span><div className="category-track"><div style={{width:`${count / largestCategory * 100}%`}}/></div><b>{count}</b></div>)}{categoryCounts.length > 6 && <p className="chart-footnote">+ {categoryCounts.length - 6} more categories</p>}</div> : <Empty text="Add products to see the category breakdown."/>}
      </section>
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><h2>Shipment status</h2><p>{shipments.length} saved shipment records</p></div></div>
        <div className="shipment-summary"><div className="shipment-number">{shipments.length}<small>Total shipments</small></div><div className="shipment-status-bar">{shipmentStages.map(stage => stage.count > 0 && <div key={stage.name} style={{width:`${stage.count / shipments.length * 100}%`,background:stage.color}} title={`${stage.name}: ${stage.count}`}/>)}</div><div className="shipment-legend">{shipmentStages.map(stage => <div key={stage.name}><i style={{background:stage.color}}/><span>{stage.name}</span><b>{stage.count}</b></div>)}</div></div>
      </section>
    </div>

    <div className="dashboard-bottom-grid">
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><h2>Needs attention</h2><p>Based on current records</p></div></div><div className="attention-list"><div><span className="attention-dot amber"/><p><b>{lowStock} products at reorder level</b><small>Review stock on hand</small></p></div><div><span className="attention-dot amber"/><p><b>{draft} draft shipments</b><small>Complete preparation and assign a driver</small></p></div><div><span className="attention-dot green"/><p><b>{prepared} prepared shipments</b><small>Ready to review for dispatch</small></p></div></div></section>
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><h2>Recent activity</h2><p>Changes saved in Firestore</p></div><Activity size={16}/></div>{recent.length ? <div className="activity-list">{recent.map(item => <div key={item.id}><CheckCircle size={15}/><p><b>{label(item.action)} {label(item.kind) === "products" ? "product" : "shipment"}: {label(item.label)}</b><small>{date(item.at)}</small></p></div>)}</div> : <Empty text="Create a product or shipment to see activity."/>}</section>
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><h2>Quick links</h2><p>Open a working module</p></div></div><div className="dashboard-links"><button onClick={() => onNavigate("products")}><span><Package size={17}/>Product Management</span><ArrowRight size={15}/></button><button onClick={() => onNavigate("stock")}><span><Box size={17}/>Stock Management</span><ArrowRight size={15}/></button><button onClick={() => onNavigate("shipments")}><span><Truck size={17}/>Order & Dispatch</span><ArrowRight size={15}/></button></div></section>
    </div>
  </div>;
}

function Stat({icon,value,title,detail,color,onClick}:{icon:React.ReactNode;value:number;title:string;detail:string;color:string;onClick:()=>void}) {
  return <button className={`dashboard-stat ${color}`} onClick={onClick}><span className="stat-icon">{icon}</span><b>{value.toLocaleString()}</b><span>{title}</span><small>{detail}</small></button>;
}
function Empty({text}:{text:string}) { return <p className="dashboard-empty">{text}</p>; }
