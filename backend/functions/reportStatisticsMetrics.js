import {STATISTICS_PRESETS,validateStatisticsRequest} from './reportStatistics.js';
import {REPORT_RESOURCES,reportDateWindow} from './reporting.js';
const whole=v=>Number.isSafeInteger(v)&&v>=0&&v<=1000000;
const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER;
const text=v=>typeof v==='string'&&v.trim()?v:null;
const label=v=>text(v)??'Unknown';
const day=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
function recordedDay(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const ms=Date.parse(value+'T00:00:00+08:00');return Number.isFinite(ms)&&day(ms)===value?ms:null;}
function distribution(key,title,values){const counts=new Map();for(const v of values)counts.set(v,(counts.get(v)??0)+1);return {key,label:title,denominator:values.length,values:[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([value,count])=>({key:value,label:value,count}))};}
export function aggregateReportStatistics(raw,selection){
 const request=validateStatisticsRequest(raw),p=STATISTICS_PRESETS[request.preset],config=REPORT_RESOURCES[p.resource],{rows,coverage,observedAtMs}=selection;
 if(!Array.isArray(rows)||rows.length>2000||!coverage||coverage.scope!=='filtered'||coverage.complete!==true||coverage.scanCap!==2000||coverage.readCap!==10000||coverage.scanned<rows.length||coverage.scanned>2000||coverage.readCount>10000||!Number.isSafeInteger(observedAtMs))throw Error('Statistics require a complete bounded source selection. Narrow the filters.');
 const summary=[],distributions=[],unknownRows=new Set(),exclusions={unknownFacts:0,invalidFacts:0,undatedExcluded:coverage.undatedExcluded,undatedExcludedCount:coverage.undatedExcluded?null:0};
 const metric=(key,title,value,unit='records',unknownCount=0)=>summary.push({key,label:title,value,unit,unknownCount});
 metric('records','Recorded rows',rows.length);
 let productBalances=[],remainingProducts=0;
 if(p.resource==='products'){
  const active=rows.filter(r=>r.archived!==true&&r.status==='Active'),archived=rows.filter(r=>r.archived===true).length;
  metric('activeProducts','Active products',active.length,'products');metric('archivedProducts','Archived products',archived,'products');metric('inactiveProducts','Other product states',rows.length-active.length-archived,'products');
  const condition=[];
  productBalances=active.map(r=>{
   const facts=[r.quantityOnHand,r.reservedQuantity,r.reorderLevel],missing=facts.some(v=>v===null||v===undefined),invalid=!missing&&(!facts.every(whole)||r.reservedQuantity>r.quantityOnHand||(r.warehouseReservedQuantity!=null&&(!whole(r.warehouseReservedQuantity)||r.warehouseReservedQuantity>r.reservedQuantity)));
   if(missing)unknownRows.add(r);else if(invalid)exclusions.invalidFacts++;
   const valid=!missing&&!invalid;condition.push(valid?(r.quantityOnHand-r.reservedQuantity<=r.reorderLevel?'reorder':'healthy'):'unknown');
   return {id:r.id,sku:text(r.sku),name:text(r.name),onHand:valid?r.quantityOnHand:null,reserved:valid?r.reservedQuantity:null,available:valid?r.quantityOnHand-r.reservedQuantity:null};
  }).sort((a,b)=>(a.sku??'').localeCompare(b.sku??'')||a.id.localeCompare(b.id));
  const d=distribution('condition','Stock condition',condition);d.values=d.values.map(v=>({...v,label:({healthy:'Above reorder level',reorder:'At/below reorder level',unknown:'Unknown or invalid facts'})[v.key]}));distributions.push(d);
  metric('reorderProducts','Need reorder review',condition.filter(v=>v==='reorder').length,'products');metric('unknownProducts','Unknown or invalid facts',condition.filter(v=>v==='unknown').length,'products');
  remainingProducts=Math.max(0,productBalances.length-10);productBalances=productBalances.slice(0,10);
 }else if(['stockAi','deliveryAi'].includes(request.preset)){
  const predicted=rows.filter(r=>r.status==='Predicted'&&text(r.label));
  distributions.push(distribution('label','Experimental prediction labels',predicted.map(r=>r.label)),distribution('status','Request states',rows.map(r=>label(r.status))));
  for(const r of rows)if(!predicted.includes(r))unknownRows.add(r);
 }else{
  const field=request.preset==='stockRules'?'reviewState':request.preset==='deliveryRules'?'level':request.preset==='parcelObservations'?'label':p.resource==='integrityChecks'?'outcome':p.resource==='stockMovements'||p.resource==='fleetEvents'?'type':'status';
  distributions.push(distribution(field,request.preset==='parcelObservations'?'Recorded parcel labels':request.preset==='deliveryRules'?'Rule assessment levels':field==='outcome'?'Retained integrity outcomes':'Recorded categories',rows.map(r=>label(r[field]))));
  for(const r of rows)if(!text(r[field]))unknownRows.add(r);
  if(request.preset==='parcelObservations')distributions.push(distribution('reviewStatus','Review states',rows.map(r=>label(r.reviewStatus))));
 }
 const sumMetric=(field,key,title,unit,eligible=rows)=>{let total=0,valid=0,unknown=0;for(const r of eligible){if(number(r[field])&&number(total+r[field])){total+=r[field];valid++;}else unknown++;}metric(key,title,valid?total:null,unit,unknown);};
 if(p.resource==='deliveries')sumMetric('failedAttempts','failedAttempts','Recorded failed attempts','attempts');
 if(p.resource==='transportPlans')sumMetric('distanceKm','distanceKm','Recorded planned distance','km');
 if(p.resource==='fleetEvents')sumMetric('litres','litres','Recorded fuel volume','litres',rows.filter(r=>r.type==='Fuel'));
 if(p.resource==='vehicles'){
  let due=0,unknown=0;for(const r of rows){const d=r.maintenanceDate;if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)unknown++;else if(d<=day(observedAtMs))due++;}metric('maintenanceDue','Maintenance due by today',due,'vehicles',unknown);
 }
 const window=reportDateWindow(request.filters);let timeSeries=null;
 if(window){
  const dateColumn=config.columns.find(c=>c.path===config.dateField),field=dateColumn?.key,step=request.interval==='week'?7:1,keys=new Set(),bins=Array.from({length:Math.ceil(window.days/step)},(_,i)=>({day:day(window.fromMs+i*step*86400000),values:{}}));
  const category=r=>label(p.resource==='stockMovements'?r.type:p.resource==='deliveryEvents'?r.status:'Records');
  for(const r of rows){const value=r[field],ms=config.dateKind==='day'?recordedDay(value):value;if(config.dateKind==='day'&&ms===null&&value!==null&&value!==undefined){exclusions.invalidFacts++;continue;}if(typeof ms!=='number'||!Number.isFinite(ms)||ms<window.fromMs||ms>window.toMs){unknownRows.add(r);continue;}const key=category(r),bin=bins[Math.floor((ms-window.fromMs)/86400000/step)];keys.add(key);Object.defineProperty(bin.values,key,{value:(Object.hasOwn(bin.values,key)?bin.values[key]:0)+1,writable:true,enumerable:true,configurable:true});}
  const ordered=[...keys].sort();for(const bin of bins)for(const k of ordered)if(!Object.hasOwn(bin.values,k))Object.defineProperty(bin.values,k,{value:0,writable:true,enumerable:true,configurable:true});
  timeSeries={unit:p.resource==='stockMovements'?'movement entries':p.resource==='deliveryEvents'?'events':'records',keys:ordered,buckets:bins};
  if(p.resource==='stockMovements'&&request.filters.productId)sumMetric('quantity','recordedQuantity','Recorded movement quantity (all types separately charted)','product units');
 }
 exclusions.unknownFacts=unknownRows.size;
 return {schema:'iilas-report-statistics-1.0',...request,resource:p.resource,observedAtMs,coverage:{...coverage},summary,distributions,timeSeries,productBalances,remainingProducts,exclusions};
}
