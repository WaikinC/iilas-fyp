import {AsyncLocalStorage} from 'node:async_hooks';
import {performance} from 'node:perf_hooks';

// Server-only operation context. It is never accepted from command input. A
// direct handler gets the same bound as dispatch, which starts before approval.
const operations=new AsyncLocalStorage();
const timeoutError=()=>Object.assign(new Error('The live parcel outcome is uncertain after its time limit. Resolve the same saved operation before trying again.'),{code:'unavailable',liveSafe:true,liveDeadline:true});
function expire(control){
  if(control.expired)return;control.expired=true;
  clearTimeout(control.timer);control.reject(timeoutError());
  for(const cancel of control.cancel){try{cancel();}catch{/* Cancellation cannot prevent the fixed timeout response. */}}
  control.cancel.clear();
}
function arm(control,milliseconds){
  // A changed wall clock or a transaction retry can never extend the actual
  // observer timer. Only a protected NEW-work lease may tighten this bound.
  control.monotonicDue=Math.min(control.monotonicDue,performance.now()+milliseconds);
  clearTimeout(control.timer);
  if(milliseconds<=0){expire(control);return;}
  control.timer=setTimeout(()=>expire(control),Math.max(0,control.monotonicDue-performance.now()));
}
export function guardParcelLiveOperation(){
  const control=operations.getStore();if(!control)throw timeoutError();
  if(control.expired||Date.now()>=control.deadline||performance.now()>=control.monotonicDue){expire(control);throw timeoutError();}
}
export function parcelLiveOperationDeadline(){guardParcelLiveOperation();return operations.getStore().deadline;}
export function tightenParcelLiveOperationDeadline(deadline){
  guardParcelLiveOperation();const control=operations.getStore();
  if(!Number.isSafeInteger(deadline)||deadline<0)throw timeoutError();
  if(deadline<control.deadline){control.deadline=deadline;arm(control,deadline-Date.now());}
  guardParcelLiveOperation();return control.deadline;
}
export function onParcelLiveCancel(cancel){guardParcelLiveOperation();const control=operations.getStore();control.cancel.add(cancel);return ()=>control.cancel.delete(cancel);}

export function guardParcelLiveTransaction(transaction){
  guardParcelLiveOperation();
  return new Proxy(transaction,{get(target,key){
    if(key==='get')return async(...args)=>{guardParcelLiveOperation();const result=await target.get(...args);guardParcelLiveOperation();return result;};
    if(['create','set','update','delete'].includes(key))return (...args)=>{guardParcelLiveOperation();return target[key](...args);};
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
}

export function runParcelLiveOperation(work){
  const inherited=operations.getStore();
  if(inherited)return Promise.resolve().then(()=>{guardParcelLiveOperation();return work();}).then(result=>{guardParcelLiveOperation();return result;});
  const control={deadline:Date.now()+50000,expired:false,cancel:new Set(),timer:null,reject:null,monotonicDue:Infinity};
  // Keep and observe the original promise after timeout. Cancellation cannot
  // retract an already submitted native commit; late callbacks are fenced and
  // the caller must explicitly reconcile the SAME IDs. Never start a replacement.
  const timeout=new Promise((_,reject)=>{control.reject=reject;arm(control,50000);});
  const raw=operations.run(control,()=>Promise.resolve().then(()=>{guardParcelLiveOperation();return work();}).then(result=>{guardParcelLiveOperation();return result;}));
  return Promise.race([raw,timeout]).finally(()=>{clearTimeout(control.timer);control.cancel.clear();});
}
