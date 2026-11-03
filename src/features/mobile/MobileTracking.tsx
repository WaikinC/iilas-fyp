import type {DriverTracking} from '../../../lib/mobilePlatformClient.js';
export default function MobileTracking({value,busy,disabled,onStart,onStop}:{value:DriverTracking|null;busy:boolean;disabled:boolean;onStart:()=>void;onStop:()=>void}){
 const active=value?.phase==='Tracking'||value?.phase==='Starting';
 return <section className={'mobile-tracking '+(active?'is-active':'')} aria-labelledby="tracking-title"><div><h2 id="tracking-title">Delivery tracking</h2><p role="status">{value?.phase||'Checking tracking state'}</p>{value?.reason&&<p>{value.reason}</p>}</div>
  <p>Start with the app open. Android may vary the 20-second target. Offline capture stops when its authorisation expires.</p>
  {value?.lastCapturedAtMs!==null&&value?.lastCapturedAtMs!==undefined&&<p>Last captured {new Date(value.lastCapturedAtMs).toLocaleTimeString()}{value.accuracy!==null?` · Reported accuracy ${Math.round(value.accuracy)} m`:''}</p>}
  {value?.leaseUntilMs&&<p>Authorised until {new Date(value.leaseUntilMs).toLocaleTimeString()} · {value.sequence} saved samples</p>}
  <div className="mobile-actions"><button className="mobile-primary" disabled={busy||disabled||active||!value} onClick={onStart}>Start tracking</button><button className="mobile-stop" disabled={busy||!active} onClick={onStop}>Stop tracking</button></div>
 </section>;
}
