import {validateStockRequest} from './validation.js';

// One unresolved manual movement per account and shared data scope in this tab.
// Persist before sending: losing a response must never create a fresh operation.
export function createStockRetry(storage,key,command) {
  let inFlight=false;
  function pending() {
    const raw=storage.getItem(key);
    if(!raw)return null;
    try { return validateStockRequest(JSON.parse(raw)); }
    catch { throw new Error('The saved stock request cannot be read. Keep this tab open and ask an administrator to reconcile the movement history before clearing browser storage.'); }
  }
  async function send(input,resolve=false) {
    if(inFlight)throw new Error('A stock request is already running. Wait for its result.');
    const saved=pending();
    if(resolve&&!saved)throw new Error('There is no saved movement to check.');
    const request=saved||validateStockRequest({...input,operationId:crypto.randomUUID()});
    if(!saved) {
      try { storage.setItem(key,JSON.stringify(request)); }
      catch { throw new Error('Unable to save this movement for safe retry. Enable session storage before recording stock.'); }
    }
    inFlight=true;
    try {
      const result=await command(resolve?'resolveStock':'stock',request);
      storage.removeItem(key);
      return result;
    }catch(error){
      // A previous request may already have committed. Only a first submission
      // explicitly rejected before commit can be cleared without reconciliation.
      if(!saved&&error.details?.stockRequestNotApplied===true)storage.removeItem(key);
      throw error;
    }finally{inFlight=false;}
  }
  return {pending,submit:input=>send(input),resolve:()=>send(null,true)};
}
