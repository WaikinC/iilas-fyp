import {PARCEL_ANALYSIS_STATES,PARCEL_ANALYSIS_TERMINAL_STATES,validateStartParcelAnalysis,validateResolveParcelAnalysis,toPublicParcelAnalysis} from './parcelAnalysis.js';

// This module is for sessionStorage, never localStorage. It performs no timers,
// automatic retry or inference: every network request follows submit/check.
// The storage object must be shared by controllers belonging to the same tab.
// REQUIRED SERVER CONTRACT: a Busy start atomically saves a private immutable
// Blocked receipt for scope/actor/operation+command hash -> blocking analysis ID.
// Every same-operation replay returns that SAME Busy, even after its blocker
// terminalizes. Without this durable server receipt a reload cannot safely
// discover a lost public ID from the four-ID intent. The next explicit check
// resolves that blocker; it must never silently execute a replacement request.
const activeByStorage=new WeakMap();
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const error=message=>{throw new Error(message);};
function validContext(value) {
  if(!value||!['scopeId','actorUid','evidenceId'].every(key=>id(value[key]))||!['Pre-dispatch','Delivery'].includes(value.stage))error('Choose a valid parcel analysis context.');
  return {scopeId:value.scopeId,actorUid:value.actorUid,evidenceId:value.evidenceId,stage:value.stage};
}
const keyFor=context=>`iilas:parcel-analysis:${JSON.stringify([context.scopeId,context.actorUid,context.evidenceId])}`;
export function createParcelAnalysisRetry({storage,context,command,createOperationId=()=>crypto.randomUUID()}) {
  if(!storage||!['getItem','setItem','removeItem'].every(key=>typeof storage[key]==='function')||typeof command!=='function')error('Parcel recovery requires session storage and a command handler.');
  let current=validContext(context),generation=0,known=null,terminal=null,inFlight=false;
  if(!activeByStorage.has(storage))activeByStorage.set(storage,new Set());
  const active=activeByStorage.get(storage);
  function pendingFor(selected) {
    let raw;
    try {raw=storage.getItem(keyFor(selected));}catch{error('The saved parcel request cannot be read. Keep it for outcome recovery.');}
    if(raw===null)return null;
    try {
      const saved=JSON.parse(raw);
      if(!saved||Object.keys(saved).length!==4||!['scopeId','actorUid','evidenceId','operationId'].every(key=>Object.hasOwn(saved,key))||saved.scopeId!==selected.scopeId||saved.actorUid!==selected.actorUid||saved.evidenceId!==selected.evidenceId)throw new Error();
      validateStartParcelAnalysis({evidenceId:saved.evidenceId,operationId:saved.operationId});
      return {scopeId:saved.scopeId,actorUid:saved.actorUid,evidenceId:saved.evidenceId,operationId:saved.operationId};
    }catch{error('The saved parcel request is invalid. Reconcile saved analyses before clearing it.');}
  }
  function checkResponse(result,saved,wasResolve,blocked) {
    if(result?.state==='Busy'){
      if(wasResolve||result.reasonCode!=='evidence-busy'||!id(result.analysisId))error('Invalid parcel analysis response.');
      return {state:'Busy',analysisId:result.analysisId,reasonCode:'evidence-busy'};
    }
    if(!result||!PARCEL_ANALYSIS_STATES.includes(result.state)||!id(result.analysisId)||result.ownerId!==saved.scopeId||result.evidenceId!==saved.evidenceId
      ||(!blocked&&(result.actorUid!==saved.actorUid||result.operationId!==saved.operationId))||wasResolve&&result.analysisId!==known?.analysisId)error('Invalid parcel analysis response. Keep the saved request for recovery.');
    // Historical resolution is intentionally not fenced by the record stage:
    // the UI generation guards the active context; saved evidence stays immutable.
    try {return toPublicParcelAnalysis(result);}catch{error('Invalid parcel analysis response. Keep the saved request for recovery.');}
  }
  async function send(check) {
    const selected={...current},key=keyFor(selected),startedGeneration=generation;
    if(inFlight||active.has(key))error('A parcel request is already running. Wait for its result.');
    let saved=pendingFor(selected);
    if(check&&!saved)error('There is no saved parcel request to check.');
    if(!saved){
      const input=validateStartParcelAnalysis({evidenceId:selected.evidenceId,operationId:createOperationId()});
      saved={scopeId:selected.scopeId,actorUid:selected.actorUid,evidenceId:input.evidenceId,operationId:input.operationId};
      try {storage.setItem(key,JSON.stringify(saved));if(storage.getItem(key)!==JSON.stringify(saved))throw new Error();}
      catch{error('Unable to save this parcel request for safe recovery. Enable session storage before submitting.');}
    }
    inFlight=true;active.add(key);
    try {
      const wasResolve=!!known;
      const result=await command(wasResolve?'resolveParcelAnalysis':'startParcelAnalysis',wasResolve?validateResolveParcelAnalysis({analysisId:known.analysisId}):{evidenceId:saved.evidenceId,operationId:saved.operationId});
      if(generation!==startedGeneration)error('Parcel analysis context changed. The original saved request remains recoverable.');
      const response=checkResponse(result,saved,wasResolve,known?.blocked===true);
      known={analysisId:response.analysisId,blocked:response.state==='Busy'||known?.blocked===true};
      if(PARCEL_ANALYSIS_TERMINAL_STATES.includes(response.state)){
        terminal=response;
        // Compare before removal so no newer saved identity can be erased.
        const latest=pendingFor(selected);
        if(latest?.operationId===saved.operationId)storage.removeItem(key);
        known=null;
      }
      return response;
    }finally{inFlight=false;active.delete(key);}
  }
  return {
    pending:()=>pendingFor(current),
    submit:()=>send(false),
    check:()=>send(true),
    setContext(value){const next=validContext(value);if(JSON.stringify(next)!==JSON.stringify(current)){current=next;generation++;known=null;terminal=null;}},
    dismissTerminal(){if(inFlight||!terminal)error('Check the saved request until a terminal outcome is known before dismissing it.');terminal=null;},
  };
}
