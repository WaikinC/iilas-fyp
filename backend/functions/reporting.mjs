import {getFirestore,FieldPath,Timestamp} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {approvedTransaction} from './access.mjs';
import {assertCompletionLocal} from './completionOperations.mjs';
import {completionCanonical,completionExact,completionIdentifier} from './completionWorkflow.js';
import {REPORT_RESOURCES,validateReportRequest,reportDateWindow,buildReportCSV} from './reporting.js';
import {validateStatisticsRequest,statisticsSourceRequest} from './reportStatistics.js';
import {aggregateReportStatistics} from './reportStatisticsMetrics.js';
const fail=(message,code='failed-precondition')=>{throw Object.assign(Error(message),{code});};
const get=(data,path)=>Array.isArray(path)?path.map(p=>get(data,p)).find(v=>v!==undefined):path.split('.').reduce((v,k)=>v?.[k],data);
const sha=value=>createHash('sha256').update(completionCanonical(value)).digest('hex');
const timestamp=value=>value&&Number.isInteger(value.seconds)&&Number.isInteger(value.nanoseconds)&&value.nanoseconds>=0&&value.nanoseconds<1e9?{seconds:value.seconds,nanoseconds:value.nanoseconds}:null;
const millis=value=>value?.toMillis?.()??(timestamp(value)?value.seconds*1000+value.nanoseconds/1e6:null);
function columns(config,data,id){let unknown=false;const row={};for(const column of config.columns){let value=column.path==='$id'?id:get(data,column.path);if(column.format==='time')value=millis(value);if(value===undefined||value===null)value=null;else if(!['string','boolean','number'].includes(typeof value)||(typeof value==='number'&&!Number.isFinite(value))||(typeof value==='string'&&value.length>2000)){value=null;unknown=true;}row[column.key]=value;}return {row,unknown};}
const paths=path=>Array.isArray(path)?path:[path];
function projection(config){return [...new Set(['ownerId',config.dateField,'shipmentId','driverUid','kind','recordId','targetKind','targetId','exceptionId',...config.columns.flatMap(c=>paths(c.path)),...Object.values(config.filters).flatMap(f=>paths(f.path)),...config.searchPaths,...config.identifierPaths].filter(p=>p&&p!=='$id'))];}
function normalCursor(raw,binding,config,dated){if(!raw)return null;try{const value=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'));completionExact(value,['version','binding','id','sort']);if(value.version!==1||value.binding!==binding)throw Error();completionIdentifier(value.id);if(!dated){if(value.sort!==null)throw Error();}else if(config.dateKind==='day'){if(typeof value.sort!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.sort))throw Error();}else{completionExact(value.sort,['seconds','nanoseconds']);if(!timestamp(value.sort))throw Error();}return value;}catch{fail('This report continuation does not match the account and filters.');}}
function matches(data,id,filters,config){for(const [key,wanted]of Object.entries(filters)){if(['dateFrom','dateTo'].includes(key))continue;if(key==='id'){if(id!==wanted)return false;}else if(key==='identifier'){if(![id,...config.identifierPaths.map(p=>get(data,p))].some(v=>typeof v==='string'&&v.toUpperCase()===wanted))return false;}else if(key==='search'){if(!config.searchPaths.some(p=>String(get(data,p)??'').toLowerCase().includes(wanted.toLowerCase())))return false;}else{const actual=get(data,config.filters[key].path);if(actual!==wanted)return false;}}return true;}
export function createReportingCommands({clock=Date.now,signal}={}){
 async function run(auth,scope,request,mode,finish=value=>value){
  assertCompletionLocal();completionIdentifier(auth?.uid);completionIdentifier(scope);
  const input=validateReportRequest(request),config=REPORT_RESOURCES[input.resource],started=clock(),deadline=started+15000,full=mode!=='page',scanCap=full?2000:200,readCap=full?10000:1000;
  const pageSize=mode==='statistics'?200:50;
  if(full&&input.cursor)fail('A complete filtered export must start at the beginning.');
  const check=()=>{if(signal?.aborted)fail('Report cancelled.','cancelled');if(clock()>=deadline)fail('Report deadline exceeded. Narrow the filters.','deadline-exceeded');assertCompletionLocal();};check();
  let timer,abort;
  const cancelled=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Report deadline exceeded. Narrow the filters.'),{code:'deadline-exceeded'})),15000);if(signal){abort=()=>reject(Object.assign(Error('Report cancelled.'),{code:'cancelled'}));signal.addEventListener('abort',abort,{once:true});}});
  try{return await Promise.race([cancelled,approvedTransaction(auth,config.roles,async(tx,system,member)=>{
   check();if(system.dataScopeId!==scope)fail('The shared system data source cannot be changed.','permission-denied');
   const driver=member.role==='Driver';if(driver&&!config.driver)fail('This report is not available to Drivers.','permission-denied');if(driver&&input.filters.driverUid&&input.filters.driverUid!==auth.uid)fail('Driver reports only include current assignments.','permission-denied');
   const window=reportDateWindow(input.filters),dated=Boolean(window),binding=sha({actor:auth.uid,scope,role:member.role,resource:input.resource,filters:input.filters,order:dated?config.dateField:'__name__'}),saved=normalCursor(input.cursor,binding,config,dated),db=getFirestore();
   let readCount=2,scanned=0,last=saved,exhausted=false,warning=false;const result=[],cache=new Map();
   const read=async(kind,id,fields)=>{check();if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(id))return null;const key=kind+'/'+id;if(cache.has(key))return cache.get(key);if(readCount>=readCap)fail('Report document-read limit reached. Narrow the filters.');const snap=await tx.get(db.doc(key));readCount++;check();const data=snap.exists?snap.data():null,small=data?.ownerId===scope?Object.fromEntries(fields.map(f=>[f,get(data,f)])):null;cache.set(key,small);return small;};
   const assigned=async id=>(await read('shipments',id,['driverUid']))?.driverUid===auth.uid;
   const integrityAssigned=async data=>data?.kind==='delivery'&&assigned((await read('evidence',data.recordId,['shipmentId']))?.shipmentId);
   const permitted=async(data,id)=>{if(!driver)return true;switch(config.driver){case 'shipment':return data.driverUid===auth.uid;case 'plan':return data.driverUid===auth.uid&&assigned(data.shipmentId??id);case 'shipmentChild':return assigned(data.shipmentId);case 'prediction':return data.kind==='delivery'&&assigned(data.recordId);case 'integrity':return integrityAssigned(data);case 'integrityReview':return integrityAssigned(await read('integrityExceptions',data.exceptionId,['kind','recordId']));case 'deliveryReview':{const kind=data.targetKind==='AI'?'deliveryAIExperiments':data.targetKind==='Rules'?'deliveryAbnormalityAssessments':null;return kind&&assigned((await read(kind,data.targetId,['shipmentId']))?.shipmentId);}default:return false;}};
   let base=db.collection(input.resource).where('ownerId','==',scope);
   // Firestore forbids document-key equality with a range on another field.
   // Dated selections keep the bounded date scan and apply the exact ID below.
   if(input.filters.id&&!dated)base=base.where(FieldPath.documentId(),'==',input.filters.id);
   if(driver&&['shipment','plan'].includes(config.driver))base=base.where('driverUid','==',auth.uid);
   // Exactly one optional indexed selector avoids combinatorial query shapes.
   if(!input.filters.id&&!dated&&!(driver&&['shipment','plan'].includes(config.driver))){const selector=Object.entries(input.filters).find(([k])=>config.filters[k]?.indexed&&typeof config.filters[k].path==='string');if(selector)base=base.where(config.filters[selector[0]].path,'==',selector[1]);}
   if(dated){if(config.dateKind==='day')base=base.where(config.dateField,'>=',input.filters.dateFrom).where(config.dateField,'<=',input.filters.dateTo);else base=base.where(config.dateField,'>=',Timestamp.fromMillis(window.fromMs)).where(config.dateField,'<',Timestamp.fromMillis(window.toMs+1));base=base.orderBy(config.dateField,'asc');}
   base=base.orderBy(FieldPath.documentId(),'asc').select(...projection(config));
   while(scanned<scanCap&&result.length<(full?2000:20)){
    check();const cap=Math.min(pageSize,scanCap-scanned,readCap-readCount);if(cap<1)fail('Report read limit reached. Narrow the filters.');let query=base.limit(cap);if(last){const sort=dated?[config.dateKind==='day'?last.sort:new Timestamp(last.sort.seconds,last.sort.nanoseconds),last.id]:[last.id];query=query.startAfter(...sort);}
    const page=await tx.get(query);readCount+=page.docs.length||1;check();if(!page.docs.length){exhausted=true;break;}let examined=0;
    for(const doc of page.docs){check();const data=doc.data();scanned++;examined++;const sort=dated?(config.dateKind==='day'?get(data,config.dateField):timestamp(get(data,config.dateField))):null;if(dated&&sort===null)fail('A recorded date cannot be paged safely. Narrow the filters.');last={id:doc.id,sort};if(data.ownerId===scope&&matches(data,doc.id,input.filters,config)&&await permitted(data,doc.id)){const projected=columns(config,data,doc.id);result.push(projected.row);warning||=projected.unknown;}if(result.length===(full?2000:20))break;}
    if(examined===page.docs.length&&page.docs.length<cap){exhausted=true;break;}
   }
   // A single projected lookahead proves exact-cap selections without scanning it.
   if(!exhausted&&last&&readCount<readCap){let q=base.limit(1);q=q.startAfter(...(dated?[config.dateKind==='day'?last.sort:new Timestamp(last.sort.seconds,last.sort.nanoseconds),last.id]:[last.id]));const peek=await tx.get(q);readCount+=peek.docs.length||1;check();exhausted=peek.docs.length===0;}
   if(full&&!exhausted)fail('Complete filtered export exceeds the scan or row limit. Narrow the filters.');
   const coverage={scope:full?'filtered':'page',complete:exhausted,scanned,scanCap,readCount,readCap,undatedExcluded:dated,dateBasis:config.dateLabel+' date; Malaysia UTC+08:00',unknownValues:warning,assignedOnly:driver};
   const observedAtMs=clock(),cursor=!exhausted&&last?Buffer.from(JSON.stringify({version:1,binding,...last})).toString('base64url'):null;check();const value=finish({rows:result,cursor,hasMore:!exhausted,scanned,coverage,observedAtMs});check();return value;
  },tx=>{check();return tx;})]);}finally{clearTimeout(timer);if(abort)signal.removeEventListener('abort',abort);}
 }
 return {queryReport:(auth,scope,input)=>run(auth,scope,input,'page'),queryReportStatistics:(auth,scope,input)=>{const request=validateStatisticsRequest(input);return run(auth,scope,statisticsSourceRequest(request),'statistics',selection=>{const value=aggregateReportStatistics(request,selection);if(Buffer.byteLength(JSON.stringify(value),'utf8')>2*1024*1024)fail('Statistics exceed the 2 MiB limit. Narrow the filters.');return value;});},exportReport:async(auth,scope,input)=>{completionExact(input,['resource','filters','mode'],['cursor']);if(!['page','filtered'].includes(input.mode))fail('Choose page or complete filtered export.');const started=clock(),{mode,...request}=input,result=await run(auth,scope,request,mode);const csv=buildReportCSV({...request,...result});if(clock()-started>=15000||signal?.aborted)fail('Report deadline or cancellation reached. Narrow the filters.');return {fileName:`iilas-${request.resource}-${new Date(result.observedAtMs).toISOString().slice(0,10)}-${mode}.csv`,csv,rowCount:result.rows.length,coverage:result.coverage,observedAtMs:result.observedAtMs};}};
}
