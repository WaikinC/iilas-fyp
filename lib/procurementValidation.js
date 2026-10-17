export const PURCHASE_STATUSES=['Submitted','Rejected','Approved','Issued','PartReceived','Received','Cancelled'];
export const malaysiaDay=(millis=Date.now())=>new Date(millis+8*3600000).toISOString().slice(0,10);
const invalid=message=>{throw new Error(message);};
export function onlyFields(value,keys,label='Input') {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))invalid(`${label} contains unsupported fields.`);
}
export function inputText(value,label,max=120,min=1,multiline=false) {
  if(typeof value!=='string')invalid(`${label} must be text.`);
  const text=value.trim();
  if(text.length<min||text.length>max||(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))||(!multiline&&/[\r\n\t]/.test(text)))invalid(`${label} must contain ${min}–${max} readable characters.`);
  return text;
}
export function inputNumber(value,label,min=0,max=1000000,integer=false) {
  if(!['string','number'].includes(typeof value)||(typeof value==='string'&&(!value.trim()||!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value.trim()))))invalid(`Invalid ${label}.`);
  const n=Number(value);
  if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isSafeInteger(n)))invalid(`Invalid ${label}.`);
  return n;
}
export function validDay(value,label='Date') {
  const day=inputText(value,label,10,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)invalid(`Choose a valid ${label.toLowerCase()}.`);
  return day;
}
function recordId(value,label) {
  const key=inputText(value,label,128);
  if(!/^[a-zA-Z0-9_-]+$/.test(key))invalid(`Choose a valid ${label.toLowerCase()}.`);
  return key;
}
export const supplierIdentity=(name,contact)=>[String(name).trim().toLowerCase().replace(/\s+/g,' '),String(contact).includes('@')?String(contact).trim().toLowerCase():String(contact).replace(/\D/g,'')];
export function validateSupplier(value) {
  onlyFields(value,['name','contact','status'],'Supplier');
  const name=inputText(value.name,'Supplier name'),contact=inputText(value.contact,'Supplier contact');
  const email=/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(contact)&&!/[<>]/.test(contact);
  const phone=/^\+?[\d ()-]+$/.test(contact)&&contact.replace(/\D/g,'').length>=7&&contact.replace(/\D/g,'').length<=15;
  if(!email&&!phone)invalid('Supplier contact must be an email address or phone number with 7–15 digits.');
  const status=value.status===undefined?'Active':value.status;
  if(!['Active','Inactive'].includes(status))invalid('Choose Active or Inactive for the supplier.');
  return {name,contact,status};
}
export function purchaseReference(value) {
  const reference=inputText(value,'Purchase reference',40,3).toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9_./-]{2,39}$/.test(reference))invalid('Purchase reference needs 3–40 letters, numbers, hyphens, underscores, dots or slashes.');
  return reference;
}
export function validatePurchaseDetails(value,today=malaysiaDay()) {
  const supplierId=recordId(value.supplierId,'Supplier');
  const expectedDate=validDay(value.expectedDate,'Expected replenishment date');
  if(expectedDate<today)invalid('Expected replenishment cannot be before today. Correct the date before submitting.');
  if(!Array.isArray(value.items)||value.items.length<1||value.items.length>100)invalid('Choose 1–100 purchase lines.');
  const items=value.items.map(item=>{
    onlyFields(item,['productId','quantity','unitCost'],'Purchase line');
    const productId=recordId(item.productId,'Purchase product'),quantity=inputNumber(item.quantity,'quantity',1,1000000,true),unitCost=inputNumber(item.unitCost,'unit cost',0,1000000);
    const unitCostCents=Math.round(unitCost*100);
    if(unitCost!==unitCostCents/100)invalid('Unit cost must use at most two decimal places.');
    return {productId,quantity,unitCost:unitCostCents/100,unitCostCents,lineTotalCents:quantity*unitCostCents};
  });
  if(new Set(items.map(item=>item.productId)).size!==items.length)invalid('Choose each purchase product once; combine its quantities on one line.');
  const totalCents=items.reduce((sum,item)=>sum+item.lineTotalCents,0);
  if(!Number.isSafeInteger(totalCents))invalid('The purchase total exceeds the supported accounting limit.');
  return {supplierId,expectedDate,items,totalCents};
}
export function validatePurchaseCommand(value,today=malaysiaDay()) {
  if(!value?.id){
    onlyFields(value,['reference','supplierId','expectedDate','items'],'Purchase order');
    return {reference:purchaseReference(value.reference),...validatePurchaseDetails(value,today)};
  }
  const id=recordId(value.id,'Purchase order'),version=inputNumber(value.version,'order version',1,Number.MAX_SAFE_INTEGER,true),step=value.step;
  if(!['Approve','Reject','Issue','Cancel','Receive','Resubmit'].includes(step))invalid('Choose a valid purchase order action.');
  const keys=['id','version','step','notes',...(step==='Resubmit'?['supplierId','expectedDate','items']:step==='Receive'?['quantities','receiptReference']:[])];
  onlyFields(value,keys,'Purchase action');
  const required=['Approve','Reject','Cancel','Resubmit'].includes(step);
  const notes=value.notes===undefined&&!required?'':inputText(value.notes??'','Action notes',500,required?3:0,true);
  if(step==='Resubmit')return {id,version,step,notes,...validatePurchaseDetails(value,today)};
  if(step==='Receive') {
    if(!Array.isArray(value.quantities)||value.quantities.length<1||value.quantities.length>100)invalid('Enter received quantities for every line.');
    const quantities=value.quantities.map(q=>inputNumber(q,'received quantity',0,1000000,true));
    if(!quantities.some(q=>q>0))invalid('Receive at least one unit.');
    const receiptReference=inputText(value.receiptReference,'Delivery note reference',80,3).toUpperCase();
    if(!/^[A-Z0-9][A-Z0-9_./-]{2,79}$/.test(receiptReference))invalid('Use letters, numbers, hyphens, underscores, dots or slashes for the delivery note reference.');
    return {id,version,step,notes,quantities,receiptReference};
  }
  return {id,version,step,notes};
}

export function filterPurchases(orders,filters) {
  const from=filters.from?validDay(filters.from,'From date'):'',to=filters.to?validDay(filters.to,'To date'):'';
  if(from&&to&&from>to)invalid('From date must be on or before To date.');
  const term=String(filters.search||'').trim().toLowerCase();
  return orders.filter(p=>(!filters.status||p.status===filters.status)&&(!filters.supplierId||p.supplierId===filters.supplierId)&&(!from||p.expectedDate>=from)&&(!to||p.expectedDate<=to)&&(!term||[p.reference,p.supplierName,...(p.items||[]).flatMap(i=>[i.name,i.sku])].some(v=>String(v||'').toLowerCase().includes(term))));
}
