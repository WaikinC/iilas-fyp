import {STATISTICS_PRESETS,statisticsAllowed,statisticsDefaultRequest,validateStatisticsRequest} from './reportStatistics.js';
import {validateReportStatistics} from './reportStatisticsResponse.js';
const idle=()=>({status:'idle',request:null,result:null,error:''});
function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const retired=Symbol('retired statistics request');
export function createReportStatisticsClient({execute,identity,onChange=()=>{},timeoutMs=21000}){
 if(typeof execute!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>21000)throw Error('Explicit statistics client dependencies are required.');
 let who=identity,epoch=0,closed=false,tail=Promise.resolve();const drafts=new Map(),loads=new Map(),selectedByTab=new Map();
 const allowed=()=>Object.keys(STATISTICS_PRESETS).filter(k=>who&&statisticsAllowed(k,who.role));
 const initial=()=>{const selectedPreset=allowed()[0]??'';return {tab:'overview',selectedPreset,draft:selectedPreset?statisticsDefaultRequest(selectedPreset):null,selected:idle(),overview:{}};};
 let state=freeze(initial());
 const emit=patch=>{if(!closed){state=freeze({...state,...patch});onChange(state);}};
 const current=t=>!closed&&who!==null&&t===epoch;
 function retire(){epoch++;for(const [key,value]of loads)if(value.status==='loading')loads.set(key,idle());const overview=Object.fromEntries(Object.entries(state.overview).map(([k,v])=>[k,v.status==='loading'?idle():v]));return overview;}
 function ensure(preset){if(closed||!who||!statisticsAllowed(preset,who.role))throw Error('This statistics report is unavailable for your role.');}
 function invoke(request,ticket){
  const work=async()=>{if(!current(ticket))throw retired;let timer;try{return validateReportStatistics(await Promise.race([Promise.resolve().then(()=>execute('queryReportStatistics',request)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Statistics response timed out. Run the report again.')),timeoutMs);})]),request);}finally{clearTimeout(timer);}};
  const result=tail.then(work,work);tail=result.catch(()=>{});return result;
 }
 const error=e=>e instanceof Error?e.message.slice(0,400):'Statistics unavailable. Try narrower filters.';
 return {
  getSnapshot:()=>state,
  setIdentity(next){if(closed)return;if(JSON.stringify(who)===JSON.stringify(next))return;retire();who=next;drafts.clear();loads.clear();selectedByTab.clear();emit(initial());},
  setTab(tab){if(!['overview','inventory','logistics','ai'].includes(tab))throw Error('Unknown report area.');if(closed)return;const overview=retire();let preset=state.selectedPreset;if(tab!=='overview'&&STATISTICS_PRESETS[preset]?.tab!==tab){preset=selectedByTab.get(tab)??allowed().find(k=>STATISTICS_PRESETS[k].tab===tab)??'';if(!preset)throw Error('This report area is unavailable for your role.');}const draft=preset?(drafts.get(preset)??statisticsDefaultRequest(preset)):null;emit({tab,selectedPreset:preset,draft,selected:loads.get(preset)??idle(),overview});},
  setDraft(request){ensure(request?.preset);const overview=retire(),draft=structuredClone(request);drafts.set(request.preset,draft);selectedByTab.set(STATISTICS_PRESETS[request.preset].tab,request.preset);loads.set(request.preset,idle());emit({tab:STATISTICS_PRESETS[request.preset].tab,selectedPreset:request.preset,draft,selected:idle(),overview});},
  async run(){if(closed)return;let request;const overview=retire(),ticket=epoch;try{ensure(state.selectedPreset);request=validateStatisticsRequest(state.draft);}catch(e){emit({selected:{...idle(),status:'error',error:error(e)},overview});return;}
   const loading={status:'loading',request,result:null,error:''};loads.set(request.preset,loading);emit({selected:loading,overview});
   try{const result=await invoke(request,ticket);if(current(ticket)){const ready={status:'ready',request,result,error:''};loads.set(request.preset,ready);emit({selected:ready});}}catch(e){if(current(ticket)&&e!==retired){const failed={status:'error',request,result:null,error:error(e)};loads.set(request.preset,failed);emit({selected:failed});}}
  },
  async refreshOverview(period){if(closed||!who)return;retire();const ticket=epoch,ids=['stockCondition','purchaseOrders','shipmentStatus','deliveryStatus'].filter(k=>statisticsAllowed(k,who.role));emit({tab:'overview',selected:idle(),overview:Object.fromEntries(ids.map(k=>[k,idle()]))});
   for(const preset of ids){if(!current(ticket))break;let request;try{request=validateStatisticsRequest({preset,filters:STATISTICS_PRESETS[preset].currentState?{}:period,interval:'day'});}catch(e){emit({overview:{...state.overview,[preset]:{...idle(),status:'error',error:error(e)}}});continue;}
    emit({overview:{...state.overview,[preset]:{status:'loading',request,result:null,error:''}}});
    try{const result=await invoke(request,ticket);if(current(ticket))emit({overview:{...state.overview,[preset]:{status:'ready',request,result,error:''}}});}catch(e){if(current(ticket)&&e!==retired)emit({overview:{...state.overview,[preset]:{status:'error',request,result:null,error:error(e)}}});}
   }
  },
  dispose(){retire();closed=true;who=null;},
 };
}
