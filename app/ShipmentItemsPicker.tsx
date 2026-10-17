import { useMemo, useState } from "react";
import { Package, Plus, Search, Trash2 } from "lucide-react";

export type Item = { productId: string; quantity: number; name?: string; sku?: string };
type Product = { id: string; [key: string]: unknown };
type Props = { products: Product[]; items: Item[]; onChange: (items: Item[]) => void; locked: boolean };
const string = (value: unknown) => typeof value === "string" ? value : "";
const MAX_ITEMS = 100;

export default function ShipmentItemsPicker({ products, items, onChange, locked }: Props) {
  const [search, setSearch] = useState("");
  const matches = useMemo(() => products.filter(product => {
    if (items.some(item => item.productId === product.id)) return false;
    const term = search.trim().toLowerCase();
    return !term || [product.name, product.sku, product.barcode, product.category].some(value => string(value).toLowerCase().includes(term));
  }).slice(0, 8), [products, items, search]);
  const add = (product: Product) => {
    if (items.length >= MAX_ITEMS) return;
    onChange([...items, {productId:product.id, quantity:1, name:string(product.name), sku:string(product.sku)}]);
    setSearch("");
  };
  return <div className="shipment-picker wide">
    <div className="shipment-picker-heading"><b>Inventory products</b><small>Choose products from Product Management. Stock is deducted when dispatched.</small></div>
    {!locked && <><div className="shipment-product-search"><Search size={15}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search product name, SKU, barcode or category" aria-label="Search inventory products"/></div>{items.length >= MAX_ITEMS && <p className="shipment-limit-note" role="status">{MAX_ITEMS} products selected. Remove an item to choose another product.</p>}<div className="shipment-search-results">{matches.map(product => {
      const available = Math.max(0, Number(product.quantityOnHand ?? 0) - Number(product.reservedQuantity ?? 0));
      const disabled = product.status !== "Active" || product.archived === true || available < 1 || items.length >= MAX_ITEMS;
      return <button type="button" key={product.id} disabled={disabled} onClick={() => add(product)}><span className="picker-product-image">{string(product.imageDataUrl) ? <img src={string(product.imageDataUrl)} alt=""/> : <Package size={17}/>}</span><span className="picker-product-label"><b>{string(product.name)}</b><small>{string(product.sku)} · {string(product.category)} · {product.status !== "Active" ? "Inactive" : `${available} available`}</small></span><Plus size={16}/></button>;
    })}{matches.length === 0 && <p>{products.length ? "No matching products available to add." : "Add an inventory product in Product Management first."}</p>}</div></>}
    <div className="shipment-selected"><b>Selected items ({items.length} of {MAX_ITEMS})</b>{items.map(item => {
      const product = products.find(candidate => candidate.id === item.productId);
      const available = Math.max(0, Number(product?.quantityOnHand ?? 0) - Number(product?.reservedQuantity ?? 0));
      return <div className="shipment-selected-row" key={item.productId}><span className="picker-product-label"><b>{(locked ? item.name : string(product?.name)) || item.name || "Product no longer available"}</b><small>{(locked ? item.sku : string(product?.sku)) || item.sku || item.productId}{!locked && ` · ${available} in stock`}</small>{!locked && item.quantity > available && <small className="stock-warning">Exceeds available stock by {item.quantity - available}</small>}</span><label>Qty<input type="number" min="1" max="10000" disabled={locked} value={item.quantity} onChange={event => onChange(items.map(current => current.productId === item.productId ? {...current,quantity:Number(event.target.value)} : current))}/></label>{!locked && <button type="button" className="remove-item" onClick={() => onChange(items.filter(current => current.productId !== item.productId))} title="Remove item"><Trash2 size={15}/></button>}</div>;
    })}{items.length === 0 && <p className="no-selected">No inventory products selected yet.</p>}</div>
  </div>;
}
