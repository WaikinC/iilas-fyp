import {canonicalParcelLiveValue,toPublicParcelLiveSession,toPublicParcelLiveFrame,validateStartParcelLiveSession,validateReserveParcelLiveFrame,validateAnalyseParcelLiveFrame,validateResolveParcelLiveSession,validateResolveParcelLiveFrame,validateReviewParcelLiveFrame} from './parcelLive.js';

// Actual unsettled work survives component/controller/adapter replacement in
// this tab. A new instance fences its SAME shipment/stage predecessor; idle
// panels for other shipments may coexist without invalidating an active one.
const owners=new WeakMap();
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const fail=(message='The live parcel outcome could not be confirmed. Check the saved session before starting again.')=>{throw new Error(message);};
const storageError=()=>fail('Saved live sessions cannot be verified. Enable session storage and reconcile saved sessions before starting again.');
const contextOf=x=>{
  if(!x||!['scopeId','actorUid','shipmentId'].every(k=>id(x[k]))||!['Pre-dispatch','Delivery'].includes(x.stage))fail('Choose a valid live parcel context.');
  return {scopeId:x.scopeId,actorUid:x.actorUid,shipmentId:x.shipmentId,stage:x.stage};
};
const fields=['scopeId','actorUid','shipmentId','stage','operationId','sessionId','blockedSessionId','frameId'];
const actorKey=c=>JSON.stringify([c.scopeId,c.actorUid]);
const storageKey=c=>`iilas:parcel-live:${actorKey(c)}`;
const same=(a,b)=>canonicalParcelLiveValue(a)===canonicalParcelLiveValue(b);
const terminal=s=>s.state!=='Open';
function intentOf(value,context){
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==fields.length||!fields.every(k=>Object.hasOwn(value,k)))storageError();
  const c=contextOf(value);
  if(c.scopeId!==context.scopeId||c.actorUid!==context.actorUid||!uuid(value.operationId)||![value.sessionId,value.blockedSessionId,value.frameId].every(x=>x===null||uuid(x))||value.sessionId&&value.blockedSessionId||value.frameId&&!value.sessionId)storageError();
  return {...c,operationId:value.operationId,sessionId:value.sessionId,blockedSessionId:value.blockedSessionId,frameId:value.frameId};
}

export function createParcelLiveClient({storage,context,command,onChange=()=>{}}){
  if(!storage||!['getItem','setItem','removeItem'].every(k=>typeof storage[k]==='function')||typeof command!=='function')storageError();
  let current=contextOf(context),disposed=false,session=null,frame=null,blocked=null;
  if(!owners.has(storage))owners.set(storage,new Map());
  const byActor=owners.get(storage);
  const entryFor=c=>{const key=actorKey(c);if(!byActor.has(key))byActor.set(key,{contexts:new Map(),work:new Set(),controls:new Set(),listeners:new Set()});return byActor.get(key);};
  const fenceFor=(owner,c)=>{const key=JSON.stringify([c.shipmentId,c.stage]);if(!owner.contexts.has(key))owner.contexts.set(key,{epoch:0});return owner.contexts.get(key);};
  let entry=entryFor(current),fence=fenceFor(entry,current),epoch=++fence.epoch;
  const listener=()=>{try{Promise.resolve(onChange()).catch(()=>{});}catch{/* Observers cannot interrupt cleanup. */}};
  entry.listeners.add(listener);
  const notify=(owner=entry)=>{for(const observer of [...owner.listeners])observer();};
  const selected=()=>({context:{...current},entry,fence,epoch});
  const isCurrent=t=>!disposed&&t.fence.epoch===t.epoch&&entry===t.entry&&fence===t.fence&&epoch===t.epoch;
  const assertCurrent=(t,signal)=>{if(!isCurrent(t)||signal?.aborted)fail();};
  function pendingFor(c){
    let raw;try{raw=storage.getItem(storageKey(c));}catch{storageError();}
    if(raw===null)return null;
    try{return intentOf(JSON.parse(raw),c);}catch{storageError();}
  }
  function write(t,value,previous){
    assertCurrent(t);
    const latest=pendingFor(t.context);assertCurrent(t);
    if(previous?!latest||!same(latest,previous):latest!==null)fail();
    const encoded=JSON.stringify(intentOf(value,t.context));
    try{storage.setItem(storageKey(t.context),encoded);if(storage.getItem(storageKey(t.context))!==encoded)storageError();}catch{storageError();}
    assertCurrent(t);notify();assertCurrent(t);
  }
  function clear(t,original){
    assertCurrent(t);const latest=pendingFor(t.context);assertCurrent(t);
    if(!latest||!same(latest,original))fail();
    try{storage.removeItem(storageKey(t.context));if(storage.getItem(storageKey(t.context))!==null)storageError();}catch{storageError();}
    assertCurrent(t);notify();assertCurrent(t);
  }
  function track(t,control,work){
    const set=control?t.entry.controls:t.entry.work,marker={};set.add(marker);
    // No Promise.race: this promise owns every awaited byte/encoder/raw call.
    return (async()=>{try{return await work();}catch{fail();}finally{set.delete(marker);notify(t.entry);}})();
  }
  function begin(control=false){
    const t=selected();assertCurrent(t);
    if(t.entry.controls.size||!control&&t.entry.work.size)fail('A live parcel operation is still pending. Wait and check the saved session.');
    return t;
  }
  function safeSession(raw,saved,allowBlocked=false){
    const value=toPublicParcelLiveSession(raw);
    if(value.ownerId!==saved.scopeId||value.actorUid!==saved.actorUid||value.sessionId!==(allowBlocked?saved.blockedSessionId:saved.sessionId??value.sessionId))fail();
    if(!allowBlocked&&(value.shipmentId!==saved.shipmentId||value.stage!==saved.stage||value.operationId!==saved.operationId))fail();
    return value;
  }
  function safeFrame(raw,saved,expected){
    const value=toPublicParcelLiveFrame(raw);
    if(value.ownerId!==saved.scopeId||value.actorUid!==saved.actorUid||value.shipmentId!==saved.shipmentId||value.stage!==saved.stage||value.sessionId!==saved.sessionId||value.frameId!==saved.frameId)fail();
    if(expected&&['sequence','sha256','bytes','width','height','capturedAtClient'].some(k=>value[k]!==expected[k]))fail();
    if(session&&(!same(value.model,session.model)||!same(value.policy,session.policy)))fail();
    return value;
  }
  async function discover(t,saved,signal){
    const raw=await command('startParcelLiveSession',validateStartParcelLiveSession({shipmentId:saved.shipmentId,stage:saved.stage,operationId:saved.operationId}));
    assertCurrent(t,signal);
    if(raw?.state==='Busy'){
      if(!uuid(raw.sessionId)||raw.reasonCode!=='session-busy')fail();
      blocked={state:'Busy',sessionId:raw.sessionId,reasonCode:'session-busy'};
      const next={...saved,blockedSessionId:raw.sessionId};write(t,next,saved);return {saved:next,value:{...blocked}};
    }
    const value=safeSession(raw,saved);session=value;blocked=null;
    const next={...saved,sessionId:value.sessionId};write(t,next,saved);
    return {saved:next,value};
  }
  function binding(t,saved,signal){
    assertCurrent(t,signal);
    if(!saved||!same(contextOf(saved),t.context)||!saved.sessionId||saved.blockedSessionId||session?.sessionId!==saved.sessionId||session.state!=='Open')fail();
  }
  async function reconcile(t,stop){
    let saved=pendingFor(t.context);assertCurrent(t);if(!saved)fail('There is no saved live session to check.');
    let value;
    if(!saved.sessionId&&!saved.blockedSessionId){
      const found=await discover(t,saved);saved=found.saved;value=found.value;
      if(value.state==='Busy'&&!stop)return {session:value,frame:null};
    }
    const blockedIntent=!!saved.blockedSessionId,target=saved.blockedSessionId??saved.sessionId;
    if(!value||stop||blockedIntent){
      const raw=await command(stop?'stopParcelLiveSession':'resolveParcelLiveSession',validateResolveParcelLiveSession({sessionId:target}));assertCurrent(t);
      value=safeSession(raw,saved,blockedIntent);
    }
    session=value;blocked=null;
    let outcome=null;
    if(saved.frameId){
      const raw=await command('resolveParcelLiveFrame',validateResolveParcelLiveFrame({sessionId:saved.sessionId,frameId:saved.frameId}));assertCurrent(t);
      outcome=safeFrame(raw,saved);frame=outcome;
      if(terminal(value)&&['Reserved','Running'].includes(outcome.state))fail();
    }
    if(terminal(value))clear(t,saved);
    else if(outcome&&!['Reserved','Running'].includes(outcome.state))write(t,{...saved,frameId:null},saved);
    notify();assertCurrent(t);return {session:value,frame:outcome};
  }
  return {
    pending:()=>pendingFor(current),
    snapshot:()=>({pending:pendingFor(current),busy:entry.work.size+entry.controls.size>0,session:session?toPublicParcelLiveSession(session):null,frame:frame?toPublicParcelLiveFrame(frame):null,blocked:blocked?{...blocked}:null}),
    async open({operationId,signal}){
      const t=begin();assertCurrent(t,signal);
      if(pendingFor(t.context))return Promise.reject(new Error('A saved live session requires an explicit outcome check.'));
      validateStartParcelLiveSession({shipmentId:t.context.shipmentId,stage:t.context.stage,operationId});
      const saved={...t.context,operationId,sessionId:null,blockedSessionId:null,frameId:null};write(t,saved,null);
      return track(t,false,async()=>{
        assertCurrent(t,signal);const found=await discover(t,saved,signal);assertCurrent(t,signal);
        if(found.value.state==='Busy')fail();
        if(terminal(found.value)){clear(t,found.saved);if(found.value.state!=='Unavailable')fail();}
        return {sessionId:found.value.sessionId,state:found.value.state};
      });
    },
    async capture(input,work){
      const {sessionId,frameId,signal}=input;
      const t=begin();const saved=pendingFor(t.context);binding(t,saved,signal);
      validateResolveParcelLiveFrame({sessionId,frameId});
      if(sessionId!==saved.sessionId||saved.frameId||typeof work!=='function')fail();
      return track(t,false,async()=>{assertCurrent(t,signal);const result=await work();assertCurrent(t,signal);return result;});
    },
    async submit(input){
      // Snapshot every caller-owned scalar/signal before callbacks or awaits.
      const {sessionId,frameId,sequence,bytes:declaredBytes,capturedAtClient,signal}=input;
      const {blob,width,height}=input.payload??{};
      const t=begin();let saved=pendingFor(t.context);binding(t,saved,signal);
      validateResolveParcelLiveFrame({sessionId,frameId});
      if(saved.frameId||sessionId!==saved.sessionId)fail();
      if(!(blob instanceof Blob)||blob.type!=='image/jpeg'||blob.size!==declaredBytes||blob.size<1||blob.size>1048576||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>960||height>960)fail();
      validateReserveParcelLiveFrame({sessionId,frameId,sequence,bytes:declaredBytes,capturedAtClient,width,height,sha256:'0'.repeat(64)});
      const next={...saved,frameId};write(t,next,saved);saved=next;
      return track(t,false,async()=>{
        assertCurrent(t,signal);const buffer=await blob.arrayBuffer();assertCurrent(t,signal);
        if(buffer.byteLength!==blob.size)fail();
        const hash=await crypto.subtle.digest('SHA-256',buffer);assertCurrent(t,signal);
        const sha256=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
        const bytes=new Uint8Array(buffer);let binary='';for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
        const jpegBase64=btoa(binary);assertCurrent(t,signal);
        const reserve=validateReserveParcelLiveFrame({sessionId,frameId,sequence,bytes:declaredBytes,sha256,width,height,capturedAtClient});
        const analyse=validateAnalyseParcelLiveFrame({sessionId,frameId,jpegBase64});assertCurrent(t,signal);
        const reservation=await command('reserveParcelLiveFrame',reserve);assertCurrent(t,signal);
        let result=safeFrame(reservation,saved,reserve);frame=result;notify();assertCurrent(t,signal);
        if(result.state==='Running')fail();
        if(result.state==='Reserved'){
          const raw=await command('analyseParcelLiveFrame',analyse);assertCurrent(t,signal);
          const checked=safeFrame(raw,saved,reserve);if(checked.version<result.version)fail();result=checked;frame=result;
        }
        if(['Reserved','Running'].includes(result.state))fail();
        write(t,{...saved,frameId:null},saved);assertCurrent(t,signal);
        return {sessionId:result.sessionId,frameId:result.frameId,sequence:result.sequence,state:result.state==='Cancelled'?'Stale':result.state,label:result.label};
      });
    },
    async close({sessionId}){
      // Cleanup is permitted for an invalidated predecessor, but never grants
      // that predecessor permission to erase a successor's recovery identity.
      const t=selected();validateResolveParcelLiveSession({sessionId});
      const saved=pendingFor(t.context);
      if(!saved&&isCurrent(t)&&session?.sessionId===sessionId&&terminal(session))return undefined;
      if(!saved||saved.sessionId!==sessionId)return Promise.reject(new Error('The saved live session needs reconciliation.'));
      if(t.entry.controls.size)return Promise.reject(new Error('Live session cleanup is still pending.'));
      return track(t,true,async()=>{
        const raw=await command('stopParcelLiveSession',{sessionId});
        const value=safeSession(raw,saved);if(!terminal(value))fail();
        if(isCurrent(t)){session=value;clear(t,saved);}return undefined;
      });
    },
    async recover(){const t=begin(true);return track(t,true,()=>reconcile(t,false));},
    async stopSaved(){const t=begin(true);return track(t,true,()=>reconcile(t,true));},
    async cleanup(record){
      const t=begin(true),saved=pendingFor(t.context),value=toPublicParcelLiveSession(record);
      if(value.ownerId!==t.context.scopeId||value.shipmentId!==t.context.shipmentId&&saved?.blockedSessionId!==value.sessionId||!['Open','Expired','Stale'].includes(value.state))fail();
      const matches=saved&&(saved.blockedSessionId===value.sessionId||saved.actorUid===value.actorUid&&saved.shipmentId===value.shipmentId&&saved.stage===value.stage&&saved.operationId===value.operationId&&(saved.sessionId===null||saved.sessionId===value.sessionId));
      return track(t,true,async()=>{
        const ack=await command('cleanupParcelLiveSession',validateResolveParcelLiveSession({sessionId:value.sessionId}));assertCurrent(t);
        const field=ack&&Object.getOwnPropertyDescriptor(ack,'released');
        if(!ack||![Object.prototype,null].includes(Object.getPrototypeOf(ack))||Reflect.ownKeys(ack).length!==1||!field||!Object.hasOwn(field,'value')||!field.enumerable||typeof field.value!=='boolean')fail();
        if(ack.released){if(matches)clear(t,saved);if(session?.sessionId===value.sessionId){session=null;frame=null;}if(blocked?.sessionId===value.sessionId)blocked=null;notify();assertCurrent(t);}
        return {released:ack.released};
      });
    },
    async review(record,input){
      if(!input||Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).length!==2||!['decision','notes'].every(k=>{const d=Object.getOwnPropertyDescriptor(input,k);return d&&Object.hasOwn(d,'value')&&d.enumerable;}))fail();
      const t=begin(true);const original=toPublicParcelLiveFrame(record);
      if(original.ownerId!==t.context.scopeId||original.shipmentId!==t.context.shipmentId||original.retention!=='Verified'||!original.image||original.reviewStatus!=='Pending'||!['Predicted','Abstained'].includes(original.state)||original.state==='Predicted'&&!['Accepted','Rejected'].includes(input.decision)||original.state==='Abstained'&&input.decision!=='Reviewed')fail();
      const request=validateReviewParcelLiveFrame({sessionId:original.sessionId,frameId:original.frameId,version:original.version,...input});
      return track(t,true,async()=>{
        const raw=await command('reviewParcelLiveFrame',request);assertCurrent(t);const checked=toPublicParcelLiveFrame(raw);
        const mutable=new Set(['version','updatedAt','humanReviewRequired','reviewStatus','reviewNotes','reviewedBy','reviewedAt']);
        if(Object.keys(original).some(k=>!mutable.has(k)&&!same(checked[k],original[k]))||checked.version!==original.version+1||checked.reviewStatus!==request.decision||checked.reviewNotes!==request.notes||checked.humanReviewRequired)fail();
        frame=checked;notify();assertCurrent(t);return checked;
      });
    },
    setContext(value){const next=contextOf(value);if(disposed)fail();if(!same(next,current)){const previous=entry;if(fence.epoch===epoch)fence.epoch++;entry.listeners.delete(listener);current=next;entry=entryFor(next);fence=fenceFor(entry,next);epoch=++fence.epoch;entry.listeners.add(listener);session=null;frame=null;blocked=null;notify(previous);notify();}},
    dispose(){if(!disposed){disposed=true;if(fence.epoch===epoch)fence.epoch++;entry.listeners.delete(listener);session=null;frame=null;blocked=null;}},
  };
}
