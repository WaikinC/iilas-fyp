import {completionCanonical,completionIdentifier,validateCompletionIntent,validateCompletionOutcome} from './completionWorkflow.js';
async function observe(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No confirmed response within 35 seconds. Recover the same saved operation.')),35000);})]);}finally{clearTimeout(timer);}}
export function createCompletionClient({storage,context,command,isCurrent,resolveActions}){
 if(!context||typeof command!=='function'||typeof isCurrent!=='function'||!storage||!resolveActions||Object.getPrototypeOf(resolveActions)!==Object.prototype)throw Error('A current operation context and resolver map are required.');
 for(const k of ['uid','scope','tab'])completionIdentifier(context[k]);
 const resolvers=new Map(Object.entries(resolveActions));for(const [a,r]of resolvers){completionIdentifier(a);completionIdentifier(r);}if(!resolvers.size)throw Error('No supported operations.');
 const prefix=`iilas.completion.${context.scope}.${context.uid}.${context.tab}.`;let active=true,epoch=0,inFlight=false;
 const current=()=>{if(!active)throw Error('The original operation view closed. Recover its saved intent.');if(!isCurrent())throw Error('The active account changed. Return to the original account to recover.');};
 const key=action=>{completionIdentifier(action);if(!resolvers.has(action))throw Error('Unsupported completion action.');return prefix+action;};
 function pending(action){current();const raw=storage.getItem(key(action));if(raw===null||raw===undefined)return null;try{return validateCompletionIntent(JSON.parse(raw));}catch{throw Error('Saved operation needs administrator reconciliation. Keep the saved data.');}}
 async function send(action,input,resolve=false){
  current();const slot=key(action);if(inFlight)throw Error('An operation request is already running.');let request=pending(action);
  if(input!==undefined){
   if(request)throw Error('Recover the saved operation before starting another.');
   // Validate caller JSON before spreading so an accessor cannot run locally either.
   const clean=JSON.parse(completionCanonical(input));if(!clean||typeof clean!=='object'||Array.isArray(clean)||Object.hasOwn(clean,'operationId'))throw Error('Start requires new plain input without an operation ID.');
   request=validateCompletionIntent({...clean,operationId:crypto.randomUUID()});storage.setItem(slot,JSON.stringify(request));
   if(completionCanonical(pending(action))!==completionCanonical(request))throw Error('The saved operation could not be verified.');
  }
  if(!request)throw Error('No saved operation to recover.');const started=epoch;inFlight=true;
  try{
   const result=validateCompletionOutcome(await observe(Promise.resolve().then(()=>command(resolve?resolvers.get(action):action,request))),{action,input:request});
   if(started!==epoch)throw Error('The original operation view changed. Recover its saved intent.');current();
   const latest=pending(action);if(!latest||completionCanonical(latest)!==completionCanonical(request))throw Error('The saved operation changed. Its outcome cannot be confirmed.');
   storage.removeItem(slot);return result;
  }finally{inFlight=false;}
 }
 return {pending,start:(a,input)=>send(a,input),retry:a=>send(a),resolve:a=>send(a,undefined,true),activate:()=>{active=true;epoch++;},dispose:()=>{active=false;epoch++;}};
}
