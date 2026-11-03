import React,{useEffect,useLayoutEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AppRouter,useAppNavigation,useNavigationGuard} from '../../../src/features/navigation/AppNavigation';

const modules=[
  ['dashboard','Dashboard'],['products','Product Management'],['stock','Stock Management'],
  ['warehouse','Warehouse Operations'],['procurement','Replenishment & Procurement'],
  ['shipments','Order & Dispatch'],['fleet','Fleet Management'],['transport','Transport Management'],
  ['delivery','Delivery Monitoring'],['reports','Reports & Statistics'],['team','User Management'],
  ['customer','Your shipments'],
] as const;

type Prompt={path:string;proceed:()=>void;cancel:()=>void};

function EditorGuard(){
  const navigation=useAppNavigation()!;
  const [draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[prompt,setPrompt]=useState<Prompt|null>(null);
  const guard=useMemo(()=>({
    check:(next:{path:string},proceed:()=>void,cancel:()=>void)=>{
      window.appNavigationFixture.guardChecks.push(next.path);
      window.appNavigationFixture.lastProceed=proceed;
      window.appNavigationFixture.lastCancel=cancel;
      if(busy){window.appNavigationFixture.busyRefusals++;cancel();return;}
      if(draft){setPrompt({path:next.path,proceed,cancel});return;}
      proceed();
    },
    beforeUnload:()=>Boolean(draft)||busy,
  }),[draft,busy]);
  useNavigationGuard('fixture-shipment-editor',guard);
  useEffect(()=>{window.appNavigationFixture.editorMounts++;return()=>{window.appNavigationFixture.editorUnmounts++;};},[]);
  return <section aria-label="Fictional shipment draft">
    <h2>Fictional shipment editor</h2>
    <label>Draft recipient<input value={draft} onChange={event=>setDraft(event.target.value)}/></label>
    <label><input type="checkbox" checked={busy} onChange={event=>setBusy(event.target.checked)}/>Request in progress</label>
    <button onClick={()=>navigation.go('shipments','fixture-shipment-2')}>Open second fictional shipment</button>
    {prompt&&<section role="dialog" aria-modal="true" aria-labelledby="fixture-discard-title">
      <h2 id="fixture-discard-title">Discard unsaved changes?</h2>
      <p>Requested destination: <output data-requested-path>{prompt.path}</output></p>
      <button onClick={()=>{setPrompt(null);prompt.cancel();}}>Keep editing</button>
      <button onClick={()=>{setPrompt(null);prompt.proceed();}}>Discard changes</button>
    </section>}
  </section>;
}

function Harness(){
  const navigation=useAppNavigation()!;
  const [authorityVersion,setAuthorityVersion]=useState(1),[guardEnabled,setGuardEnabled]=useState(true),[localCount,setLocalCount]=useState(0);
  const route=navigation.route,currentModule=modules.find(([key])=>key===route.module);
  useEffect(()=>{window.appNavigationFixture.shellMounts++;return()=>{window.appNavigationFixture.shellUnmounts++;};},[]);
  useLayoutEffect(()=>{window.appNavigationFixture.route={...route};window.appNavigationFixture.authorityVersion=authorityVersion;window.appNavigationFixture.navigate=navigation.go;},[route,navigation.go,authorityVersion]);
  return <main>
    <p>Software fixtures only · no Firebase or business commands</p>
    <h1>{currentModule?.[1]??'Page unavailable'}</h1>
    <p>Current URL: <output data-current-path>{route.path}</output></p>
    <p>Current module: <output data-current-module>{String(route.module)}</output></p>
    <p>Current record: <output data-current-record>{route.recordId??'none'}</output></p>
    <nav aria-label="Fixture module navigation">{modules.map(([key,label])=><button key={key} onClick={()=>navigation.go(key)}>{label}</button>)}</nav>
    <section aria-label="Fixture navigation actions">
      <button onClick={()=>navigation.go('shipments','fixture-shipment-1')}>Open first fictional shipment</button>
      <button onClick={()=>navigation.go('procurement','fixture-order-1')}>Open fictional purchase order</button>
      <button onClick={()=>navigation.go('customer','fixture-customer-shipment-1')}>Open fictional customer shipment</button>
      <button onClick={()=>navigation.go('products',undefined,{replace:true})}>Replace with Products</button>
      <a href="/logistics/shipments/fixture-shipment-1" target="_blank" rel="noopener">Open shipment in new tab</a>
      <button onClick={()=>setAuthorityVersion(value=>value+1)}>Change authority version</button>
      <button onClick={()=>setGuardEnabled(value=>!value)}>{guardEnabled?'Unmount editor guard':'Mount editor guard'}</button>
      <button onClick={()=>setLocalCount(value=>value+1)}>Increment stable shell state</button>
      <output aria-label="Stable shell count">{localCount}</output>
      <output aria-label="Authority version">{authorityVersion}</output>
    </section>
    {route.module==='shipments'&&guardEnabled&&<EditorGuard key={authorityVersion}/>}
    <style>{`body{margin:0;background:#f3f5fa;color:#172346;font:16px/1.5 system-ui,sans-serif}main{max-width:960px;margin:auto;padding:24px}nav,section[aria-label="Fixture navigation actions"]{display:flex;flex-wrap:wrap;gap:8px;margin-block:16px}button,a,input{font:inherit}button,a{padding:8px 12px;border:1px solid #a7afd1;border-radius:6px;background:white;color:#26366f}label{display:block;margin:12px 0}input{max-width:100%;box-sizing:border-box}section[role=dialog]{padding:16px;border:2px solid #6752ae;background:#fff}output{overflow-wrap:anywhere}section[aria-label="Fictional shipment draft"]{padding:16px;border:1px solid #a7afd1;background:white}`}</style>
  </main>;
}

createRoot(document.getElementById('root')!).render(<AppRouter><Harness/></AppRouter>);
