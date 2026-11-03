import {completionExact,completionIdentifier,completionCanonical} from './completionWorkflow.js';
import {validateStatisticsRequest,STATISTICS_PRESETS} from './reportStatistics.js';
import {validateReportCoverage} from './reportResponse.js';
import {reportDateWindow} from './reporting.js';
const fail=()=>{throw Error('Invalid or incomplete statistics response. Run the report again.');};
const count=(v,max=2000)=>{if(!Number.isSafeInteger(v)||v<0||v>max)fail();};
const string=(s,max=2000)=>{if(typeof s!=='string'||!s.length||s.length>max)fail();};
const finite=v=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>Number.MAX_SAFE_INTEGER)fail();};
const array=(v,max)=>{if(!Array.isArray(v)||v.length>max)fail();};
function safeTree(value,depth=0,counter={n:0}){if(++counter.n>50000||depth>20)fail();if(value===null||['string','number','boolean'].includes(typeof value))return;if(!value||typeof value!=='object')fail();if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype)fail();for(const [key,d]of Object.entries(Object.getOwnPropertyDescriptors(value))){if(Array.isArray(value)&&key==='length')continue;if(!d.enumerable||!Object.hasOwn(d,'value'))fail();safeTree(d.value,depth+1,counter);}if(Object.getOwnPropertySymbols(value).length)fail();}
const unique=values=>{if(new Set(values).size!==values.length)fail();};
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export function validateReportStatistics(raw,expected){
 safeTree(raw);if(new TextEncoder().encode(JSON.stringify(raw)).length>2*1024*1024)fail();
 const r=completionExact(raw,['schema','preset','resource','filters','interval','observedAtMs','coverage','summary','distributions','timeSeries','productBalances','remainingProducts','exclusions']);
 const request=validateStatisticsRequest(expected),actual=validateStatisticsRequest({preset:r.preset,filters:r.filters,interval:r.interval});
 if(r.schema!=='iilas-report-statistics-1.0'||completionCanonical(actual)!==completionCanonical(request)||r.resource!==STATISTICS_PRESETS[request.preset].resource)fail();
 count(r.observedAtMs,8640000000000000);const c=validateReportCoverage(r.coverage);if(c.scope!=='filtered'||!c.complete||c.scanCap!==2000||c.readCap!==10000)fail();
 array(r.summary,12);unique(r.summary.map(m=>m.key));for(const m of r.summary){completionExact(m,['key','label','value','unit','unknownCount']);string(m.key,100);string(m.label,160);string(m.unit,80);if(m.value!==null)finite(m.value);count(m.unknownCount);}
 const total=r.summary.find(m=>m.key==='records');if(!total)fail();count(total.value);if(total.value>c.scanned)fail();
 array(r.distributions,4);unique(r.distributions.map(d=>d.key));for(const d of r.distributions){completionExact(d,['key','label','denominator','values']);string(d.key,100);string(d.label,160);count(d.denominator);if(d.denominator>total.value)fail();array(d.values,2000);unique(d.values.map(v=>v.key));let n=0;for(const v of d.values){completionExact(v,['key','label','count']);string(v.key);string(v.label);count(v.count);n+=v.count;}if(n!==d.denominator)fail();}
 const window=reportDateWindow(request.filters);
 if(window){const t=completionExact(r.timeSeries,['unit','keys','buckets']);string(t.unit,80);array(t.keys,2000);t.keys.forEach(k=>string(k));unique(t.keys);const step=request.interval==='week'?7:1;array(t.buckets,request.interval==='week'?53:366);if(t.buckets.length!==Math.ceil(window.days/step))fail();let n=0;for(const [i,b]of t.buckets.entries()){completionExact(b,['day','values']);const expectedDay=new Date(window.fromMs+i*step*86400000+8*3600000).toISOString().slice(0,10);if(b.day!==expectedDay)fail();completionExact(b.values,t.keys);for(const v of Object.values(b.values)){count(v);n+=v;}}if(n>total.value)fail();}else if(r.timeSeries!==null)fail();
 array(r.productBalances,10);unique(r.productBalances.map(p=>p.id));count(r.remainingProducts);for(const p of r.productBalances){completionExact(p,['id','sku','name','onHand','reserved','available']);completionIdentifier(p.id);for(const k of ['sku','name'])if(p[k]!==null)string(p[k]);for(const k of ['onHand','reserved','available'])if(p[k]!==null)count(p[k],1000000);if([p.onHand,p.reserved,p.available].some(v=>v===null)){if(![p.onHand,p.reserved,p.available].every(v=>v===null))fail();}else if(p.reserved+p.available!==p.onHand)fail();}
 if(r.resource!=='products'&&(r.productBalances.length||r.remainingProducts))fail();if(r.resource==='products'&&r.productBalances.length+r.remainingProducts!==r.summary.find(m=>m.key==='activeProducts')?.value)fail();
 const e=completionExact(r.exclusions,['unknownFacts','invalidFacts','undatedExcluded','undatedExcludedCount']);count(e.unknownFacts);count(e.invalidFacts);if(e.undatedExcluded!==c.undatedExcluded||(e.undatedExcluded?e.undatedExcludedCount!==null:!Number.isSafeInteger(e.undatedExcludedCount)))fail();if(e.undatedExcludedCount!==null)count(e.undatedExcludedCount);
 return freeze(structuredClone(r));
}
