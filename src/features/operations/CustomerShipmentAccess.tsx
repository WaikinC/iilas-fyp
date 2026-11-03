import {sessionRecoveryStorage} from '../../../lib/firebaseRuntime';
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {auth} from '../../../lib/firebase';
import {getActiveWorkspace,workspaceCommand} from '../../../lib/workspace';
import {createCompletionClient} from '../../../lib/completionClient';
import {completionExact,completionIdentifier,type CompletionInput} from '../../../lib/completionWorkflow';
import type {Membership} from '../workspace/WorkspaceGate';
import type {DataRecord} from './Operations';
type Context={shipment:{id:string;reference:string;status:string};customer:{uid:string;displayName:string;eligible:boolean};grant:{version:number;active:boolean;shareLocation:boolean;notes:string}};
const actions={grantCustomerShipment:'resolveCustomerShipmentGrant',revokeCustomerShipment:'resolveCustomerShipmentRevocation'};
function checkedContext(value:unknown,shipmentId:string,customerUid:string):Context{
 const root=completionExact(value,['shipment','customer','grant']),s=completionExact(root.shipment,['id','reference','status']),c=completionExact(root.customer,['uid','displayName','eligible']),g=completionExact(root.grant,['version','active','shareLocation','notes']);
 if(s.id!==shipmentId||c.uid!==customerUid||typeof s.reference!=='string'||typeof c.displayName!=='string'||typeof c.eligible!=='boolean'||!Number.isSafeInteger(g.version)||Number(g.version)<0||typeof g.active!=='boolean'||typeof g.shareLocation!=='boolean'||typeof g.notes!=='string')throw Error('The access context could not be verified.');return {shipment:s,customer:c,grant:g} as Context;
}
function tabId(){const key='iilas.completion.tab';try{let id=sessionStorage.getItem(key);if(!id){id=crypto.randomUUID();sessionStorage.setItem(key,id);}return id;}catch{return 'storage-unavailable';}}
export default function CustomerShipmentAccess({member,shipments}:{member:Membership;shipments:DataRecord[]}){
 if(!['Admin','Manager','Logistics'].includes(member.role)||!member.active||member.status!=='Approved')return null;
 return <AccessBody key={`${member.uid}:${member.role}:${member.version}`} member={member} shipments={shipments}/>;
}
function AccessBody({member,shipments}:{member:Membership;shipments:DataRecord[]}){
 const [shipmentId,setShipmentId]=useState(''),[customerUid,setCustomerUid]=useState(''),[context,setContext]=useState<Context|null>(null),[shareLocation,setShareLocation]=useState(false),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState<Record<string,CompletionInput|null>>({}),[blocked,setBlocked]=useState(false);
 const live=useRef(true),inFlight=useRef(false),contextEpoch=useRef(0);
 const current=useCallback(()=>auth?.currentUser?.uid===member.uid&&getActiveWorkspace()?.uid===member.uid&&getActiveWorkspace()?.workspaceId===member.workspaceId&&getActiveWorkspace()?.role===member.role,[member.uid,member.workspaceId,member.role]);
 const client=useMemo(()=>createCompletionClient({storage:sessionRecoveryStorage,context:{uid:member.uid,scope:member.workspaceId,tab:tabId()},command:workspaceCommand,isCurrent:current,resolveActions:actions}),[member.uid,member.workspaceId,current]);
 const sync=useCallback(()=>{try{setPending(Object.fromEntries(Object.keys(actions).map(action=>[action,client.pending(action)])));setBlocked(false);}catch{setBlocked(true);setError('Saved access action needs administrator reconciliation. Keep the saved data.');}},[client]);
 useEffect(()=>{live.current=true;client.activate();async function initial(){sync();}void initial();return()=>{live.current=false;client.dispose();};},[client,sync]);
 async function loadAccess(selectedShipment=shipmentId,selectedCustomer=customerUid){
  const customer=selectedCustomer.trim();completionIdentifier(selectedShipment);completionIdentifier(customer);const gen=++contextEpoch.current;setContext(null);setError('');
  try{const next=checkedContext(await workspaceCommand('getCustomerAccessContext',{shipmentId:selectedShipment,customerUid:customer}),selectedShipment,customer);if(gen===contextEpoch.current&&live.current&&current()){setShipmentId(selectedShipment);setCustomerUid(customer);setContext(next);setShareLocation(next.grant.shareLocation);}}
  catch{if(gen===contextEpoch.current&&live.current&&current())setError('Customer shipment access is unavailable. Check the explicit account ID and shipment with your Admin.');}
 }
 async function check(e:FormEvent){e.preventDefault();if(inFlight.current)return;inFlight.current=true;setBusy(true);try{await loadAccess();}catch{setError('Enter a valid Customer account ID and shipment.');}finally{inFlight.current=false;if(live.current&&current())setBusy(false);}}
 async function mutate(action:keyof typeof actions,mode:'start'|'retry'|'resolve'){
  if(inFlight.current)return;const original=mode==='start'&&context?{customerUid:context.customer.uid,shipmentId:context.shipment.id,expectedVersion:context.grant.version,shareLocation:action==='grantCustomerShipment'&&shareLocation,notes}:pending[action];if(!original)return;inFlight.current=true;setBusy(true);setError('');setNotice('');
  try{const result=mode==='start'?await client.start(action,original):mode==='retry'?await client.retry(action):await client.resolve(action);if(live.current&&current()){setNotice(`${result.state}: original customer access action confirmed.`);await loadAccess(String(original.shipmentId),String(original.customerUid));}}
  catch(e){if(live.current&&current())setError(e instanceof Error?e.message:'Access action failed. Recover its saved request.');}
  finally{inFlight.current=false;if(live.current&&current()){setBusy(false);sync();}}
 }
 function changed(){contextEpoch.current++;setContext(null);setShareLocation(false);setNotice('');}
 const pendingAny=Object.values(pending).some(Boolean),ready=context&&!busy&&!blocked&&!pendingAny&&notes.trim().length>=3;
 return <section className="module-card operations-card customer-access-panel"><h2>Customer shipment access</h2><p>Use a Customer account ID explicitly supplied by your Admin. Access applies to this shipment only; it is never inferred from a recipient name or email. Location sharing starts off and is limited to the latest submitted point during active delivery.</p>
  {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="success-notice" role="status">{notice}</p>}
  {Object.entries(pending).filter(([,input])=>input).map(([action,input])=><div className="integrity-recovery" key={action}><p>Saved {action==='grantCustomerShipment'?'grant':'revocation'} · Customer {String(input?.customerUid)} · Shipment {String(input?.shipmentId)} · {input?.operationId}</p><div className="integrity-actions"><button disabled={busy} onClick={()=>void mutate(action as keyof typeof actions,'retry')}>Retry saved customer {action==='grantCustomerShipment'?'grant':'revocation'}</button><button disabled={busy} onClick={()=>void mutate(action as keyof typeof actions,'resolve')}>Check saved customer {action==='grantCustomerShipment'?'grant':'revocation'} outcome</button></div></div>)}
  <form className="operations-form" onSubmit={e=>void check(e)}><label>Shipment<select aria-label="Access shipment" required disabled={busy} value={shipmentId} onChange={e=>{setShipmentId(e.target.value);changed();}}><option value="">Choose a shipment…</option>{shipments.map(s=><option key={s.id} value={s.id}>{String(s.reference??s.id)}</option>)}</select></label><label>Customer account ID<input aria-label="Customer account ID" required maxLength={128} disabled={busy} value={customerUid} onChange={e=>{setCustomerUid(e.target.value);changed();}}/></label><button disabled={busy}>Check customer access</button></form>
  {context&&<section className="customer-grant-context"><h3>{context.customer.displayName}</h3><p>{context.shipment.reference} · {context.shipment.status}</p><p>Current grant version {context.grant.version}</p><p>{context.grant.active?'Shipment access is currently active.':'Shipment access is currently off.'}</p>{!context.customer.eligible&&<p>This account cannot receive a new grant. An existing grant can still be revoked.</p>}<label><input aria-label="Share latest active-delivery location" type="checkbox" checked={shareLocation} disabled={busy||!context.customer.eligible} onChange={e=>setShareLocation(e.target.checked)}/> Share latest active-delivery location</label><label className="field">Access notes<input aria-label="Customer access notes" required minLength={3} maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)} disabled={busy}/></label><div className="integrity-actions"><button className="primary navy" disabled={!ready||!context.customer.eligible} onClick={()=>void mutate('grantCustomerShipment','start')}>Grant shipment access</button><button disabled={!ready||!context.grant.active} onClick={()=>void mutate('revokeCustomerShipment','start')}>Revoke shipment access</button></div><p>Revocation blocks later portal requests and proof downloads. It cannot recall bytes already downloaded.</p></section>}
 </section>;
}
