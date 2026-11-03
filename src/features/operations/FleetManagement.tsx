import {useCallback,useRef,useState,type FormEvent} from 'react';
import {useDialogFocus} from '../../components/useDialogFocus';
import type {Membership} from '../workspace/WorkspaceGate';
import type {DataRecord} from './Operations';
import {OperationMessages,OperationPager,effectiveAssignment,formFields,numericField,operationRoles,recordValue as val,useAssignments,useCompletionAction,useOperationPage} from './operationsData';
import {OperationalStatus,OperationalTabs} from './FleetTransportUI';
import {resourceEditReason} from './fleetTransportPresentation';
import './fleetTransport.css';
type Props={member:Membership;shipments:DataRecord[]};
type FleetTab='vehicles'|'drivers'|'events';
type FleetDialog={mode:'create';kind:'vehicles'|'drivers'}|{mode:'edit';kind:'vehicles'|'drivers';row:DataRecord}|{mode:'event';eventType:'Fuel'|'Maintenance'};
export default function FleetManagement(props:Props){return <FleetBody key={`${props.member.uid}:${props.member.role}:${props.member.version}`} {...props}/>;}
function FleetBody({member,shipments}:Props){
 const operation=useCompletionAction(member,'updateFleetResource','resolveFleetResourceUpdate'),canEdit=operationRoles.includes(member.role),locked=operation.busy||operation.blocked||!!operation.pending;
 const [tab,setTab]=useState<FleetTab>('vehicles'),[vehicleStatus,setVehicleStatus]=useState(''),[driverStatus,setDriverStatus]=useState(''),[vehicleSearch,setVehicleSearch]=useState(''),[driverSearch,setDriverSearch]=useState('');
 const [selection,setSelection]=useState<FleetDialog|null>(null),[dirty,setDirty]=useState(false),dialog=useRef<HTMLElement>(null);
 const vehicles=useOperationPage('vehicles',member.workspaceId,operation.revision,{status:vehicleStatus}),drivers=useOperationPage('drivers',member.workspaceId,operation.revision,{status:driverStatus}),events=useOperationPage('fleetEvents',member.workspaceId,operation.revision);
 const vehicleAssignments=useAssignments(member.workspaceId,'vehicles',vehicles.rows,operation.revision),driverAssignments=useAssignments(member.workspaceId,'drivers',drivers.rows,operation.revision);
 const close=useCallback(()=>{if(operation.busy)return;if(dirty&&!operation.pending&&!window.confirm('Discard unsaved changes in this form?'))return;setSelection(null);setDirty(false);},[operation.busy,operation.pending,dirty]);
 useDialogFocus(dialog,close,selection!==null);
 const open=(next:FleetDialog)=>{setDirty(false);setSelection(next);};
 const finish=()=>{setSelection(null);setDirty(false);};
 const matches=(r:DataRecord,search:string)=>[r.id,r.name,r.licence,r.userId].some(v=>String(v??'').toLowerCase().includes(search.toLowerCase()));
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!selection||locked)return;const data=formFields(e.currentTarget);let saved=false;
  if(selection.mode==='create')saved=await operation.legacy('entity',{kind:selection.kind,data});
  else if(selection.mode==='edit'){const clean=selection.kind==='vehicles'?{...data,capacity:numericField(data.capacity),fuelLitres:numericField(data.fuelLitres)}:data;saved=await operation.start({kind:selection.kind,id:selection.row.id,expectedVersion:selection.row.version,data:clean});}
  else saved=await operation.legacy('fleetEvent',{...data,type:selection.eventType});
  if(saved)finish();
 }
 const tabs=[{id:'vehicles',label:'Vehicles'},{id:'drivers',label:'Drivers'},...(canEdit?[{id:'events',label:'Fuel & Maintenance'}]:[])];
 const resourceKind=selection&&selection.mode!=='event'?selection.kind:null,original=selection?.mode==='edit'?selection.row:null;
 const title=selection?.mode==='event'?`Record ${selection.eventType.toLowerCase()}`:selection?.mode==='edit'?`Edit ${resourceKind==='vehicles'?'vehicle':'driver'}`:resourceKind==='vehicles'?'Add vehicle':'Add driver';
 const vehicleFields=resourceKind==='vehicles',editing=selection?.mode==='edit';
 return <div className="operations-page fleet-workspace ft-workspace">
  <header className="page-heading"><div><h1>Fleet Management</h1><p>Vehicles, drivers and service records. One task at a time.</p></div></header>
  <OperationMessages operation={operation} label="resource edit" hideError={!!selection}/>
  <OperationalTabs prefix="fleet" label="Fleet areas" tabs={tabs} active={tab} onChange={v=>setTab(v as FleetTab)}/>
  <section className="ft-panel" role="tabpanel" id={`fleet-panel-${tab}`} aria-labelledby={`fleet-tab-${tab}`}>
   {tab==='vehicles'&&<>
    <div className="ft-panel-heading"><div><h2>Vehicles</h2><p>Check current assignments before choosing a vehicle.</p></div>{canEdit&&<button type="button" className="ft-action ft-action--primary" disabled={locked} onClick={()=>open({mode:'create',kind:'vehicles'})}>Add vehicle</button>}</div>
    <div className="ft-filters"><label>Search this vehicle page<input aria-label="Search this vehicle page" value={vehicleSearch} onChange={e=>setVehicleSearch(e.target.value)}/></label><label>Base-status filter<select aria-label="Vehicle base-status filter" value={vehicleStatus} onChange={e=>setVehicleStatus(e.target.value)}><option value="">All base statuses</option><option>Available</option><option>Maintenance</option><option>Unavailable</option></select></label></div>
    {vehicles.error&&<p role="alert" className="error">{vehicles.error}</p>}{vehicleAssignments.error&&<p role="alert" className="error">{vehicleAssignments.error} Availability remains unknown.</p>}
    {vehicles.loading?<p role="status">Loading vehicles…</p>:<div className="ft-list">{vehicles.rows.filter(r=>matches(r,vehicleSearch)).map(v=>{const effective=effectiveAssignment(v,'vehicles',vehicleAssignments,member.workspaceId,shipments),reason=resourceEditReason({ready:vehicleAssignments.ready,assigned:effective.assigned,operationLocked:locked});return <article className="ft-record" key={v.id}><div className="ft-record-main"><div className="ft-record-heading"><h3>{val(v,'name')}</h3><OperationalStatus label={effective.label}/></div><div className="ft-record-meta"><span>Capacity {val(v,'capacity')} parcels</span><span>Maintenance due {val(v,'maintenanceDate')}</span><span>Fuel {val(v,'fuelLitres')} L</span></div><p className="ft-base-status">Base status: {val(v,'status')}</p></div>{canEdit&&<div className="ft-row-action"><button type="button" className="ft-action" disabled={!!reason} title={reason||undefined} aria-label={`Edit vehicle ${val(v,'name')}`} onClick={()=>open({mode:'edit',kind:'vehicles',row:{...v}})}>Edit vehicle</button>{reason&&<small>{reason}</small>}</div>}</article>;})}</div>}
    {!vehicles.loading&&!vehicles.rows.filter(r=>matches(r,vehicleSearch)).length&&<p className="ft-empty">No matching vehicles on this page. Change the filter or use the page controls.</p>}<p className="ft-page-note">Search covers this loaded page. Base status and current assignment are separate checks.</p><OperationPager page={vehicles} label="vehicles"/>
   </>}
   {tab==='drivers'&&<>
    <div className="ft-panel-heading"><div><h2>Drivers</h2><p>Approved delivery-team accounts and their assignments.</p></div>{canEdit&&<button type="button" className="ft-action ft-action--primary" disabled={locked} onClick={()=>open({mode:'create',kind:'drivers'})}>Add driver</button>}</div>
    <div className="ft-filters"><label>Search this driver page<input aria-label="Search this driver page" value={driverSearch} onChange={e=>setDriverSearch(e.target.value)}/></label><label>Base-status filter<select aria-label="Driver base-status filter" value={driverStatus} onChange={e=>setDriverStatus(e.target.value)}><option value="">All base statuses</option><option>Available</option><option>Unavailable</option></select></label></div>
    {drivers.error&&<p role="alert" className="error">{drivers.error}</p>}{driverAssignments.error&&<p role="alert" className="error">{driverAssignments.error} Availability remains unknown.</p>}
    {drivers.loading?<p role="status">Loading drivers…</p>:<div className="ft-list">{drivers.rows.filter(r=>matches(r,driverSearch)).map(d=>{const effective=effectiveAssignment(d,'drivers',driverAssignments,member.workspaceId,shipments),reason=resourceEditReason({ready:driverAssignments.ready,assigned:effective.assigned,operationLocked:locked});return <article className="ft-record" key={d.id}><div className="ft-record-main"><div className="ft-record-heading"><h3>{val(d,'name')}</h3><OperationalStatus label={effective.label}/></div><div className="ft-record-meta"><span>Licence {val(d,'licence')}</span><span>Account {val(d,'userId')}</span></div><p className="ft-base-status">Base status: {val(d,'status')}</p></div>{canEdit&&<div className="ft-row-action"><button type="button" className="ft-action" disabled={!!reason} title={reason||undefined} aria-label={`Edit driver ${val(d,'name')}`} onClick={()=>open({mode:'edit',kind:'drivers',row:{...d}})}>Edit driver</button>{reason&&<small>{reason}</small>}</div>}</article>;})}</div>}
    {!drivers.loading&&!drivers.rows.filter(r=>matches(r,driverSearch)).length&&<p className="ft-empty">No matching drivers on this page. Other pages are not searched.</p>}<p className="ft-page-note">One driver resource per approved delivery-team account. Registration does not approve a login.</p><OperationPager page={drivers} label="drivers"/>
   </>}
   {tab==='events'&&canEdit&&<>
    <div className="ft-panel-heading"><div><h2>Fuel &amp; Maintenance</h2><p>Record a service event separately from vehicle registration.</p></div><div className="ft-actions"><button type="button" className="ft-action ft-action--primary" disabled={locked} onClick={()=>open({mode:'event',eventType:'Fuel'})}>Record fuel</button><button type="button" className="ft-action ft-action--accent" disabled={locked} onClick={()=>open({mode:'event',eventType:'Maintenance'})}>Record maintenance</button></div></div>
    {events.error&&<p role="alert" className="error">{events.error}</p>}{events.loading?<p role="status">Loading service records…</p>:<div className="ft-list">{events.rows.map(e=><article className="ft-record" key={e.id}><div className="ft-record-main"><div className="ft-record-heading"><h3>{val(e,'vehicleName')}</h3><OperationalStatus label={val(e,'type')}/></div><div className="ft-record-meta"><span>{val(e,'date')}</span><span>MYR {val(e,'cost')}</span></div><p>{val(e,'notes')}</p></div></article>)}</div>}
    {!events.loading&&!events.rows.length&&<p className="ft-empty">No service records on this page. Use Record fuel or Record maintenance to log an event.</p>}<OperationPager page={events} label="fleet events"/>
   </>}
  </section>
  {selection&&<div className="modal-backdrop"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="fleet-form-title" className="ft-dialog">
   <div className="ft-dialog-heading"><div><h2 id="fleet-form-title">{title}</h2><p>{selection.mode==='event'?'Save one service event for the selected vehicle.':selection.mode==='edit'?'Assignment and record version are checked when saved.':'Enter one new resource. Its internal record ID is generated automatically.'}</p></div><button type="button" className="ft-action" aria-label="Close fleet form" disabled={operation.busy} onClick={close}>Close</button></div>
   <form className="operations-form" onSubmit={e=>void submit(e)} onChangeCapture={()=>setDirty(true)} key={selection.mode==='edit'?selection.row.id:selection.mode==='event'?selection.eventType:selection.kind}>
    <fieldset className="ft-form-section" disabled={locked}><legend>{selection.mode==='event'?'Service details':vehicleFields?'Vehicle details':'Driver details'}</legend>
     {selection.mode==='event'?<>
      <label>Fleet event vehicle<select name="vehicleId" required><option value="">Select from current vehicle page…</option>{vehicles.rows.map(v=><option value={v.id} key={v.id}>{val(v,'name')}</option>)}</select></label><label>Event date<input type="date" name="date" required/></label><label>Event cost (MYR)<input type="number" name="cost" min={0} max={1000000} step="any" required/></label>
      {selection.eventType==='Fuel'?<label>Fuel added (litres)<input name="litres" type="number" min="0.1" max={10000} step="any" required/></label>:<label>Next maintenance date<input type="date" name="nextMaintenanceDate" required/></label>}<label className="transport-full-row">Fleet event notes<input name="notes" minLength={3} maxLength={240} required/></label><div className="transport-full-row"><OperationPager page={vehicles} label="vehicle choices"/></div>
     </>:vehicleFields?<>
      <label>Registration<input aria-label={editing?'Edit registration':undefined} name="name" defaultValue={original?val(original,'name'):''} required maxLength={40}/></label><label>Parcel capacity<input aria-label={editing?'Edit parcel capacity':undefined} name="capacity" type="number" min={1} max={100000} defaultValue={original?val(original,'capacity'):''} required/></label><label>{editing?'Base status':'Vehicle base status'}<select aria-label={editing?'Edit vehicle base status':undefined} name="status" defaultValue={original?val(original,'status'):'Available'}><option>Available</option><option>Maintenance</option><option>Unavailable</option></select></label><label>Maintenance due<input aria-label={editing?'Edit maintenance due':undefined} name="maintenanceDate" type="date" defaultValue={original?val(original,'maintenanceDate'):''} required/></label><label>Fuel litres<input aria-label={editing?'Edit fuel litres':undefined} name="fuelLitres" type="number" min={0} max={10000} step="any" defaultValue={original?val(original,'fuelLitres'):'0'} required/></label>
     </>:<>
      <label>Driver name<input aria-label={editing?'Edit driver name':undefined} name="name" defaultValue={original?val(original,'name'):''} required maxLength={120}/></label><label>Driver account ID<input aria-label={editing?'Edit driver account ID':undefined} name="userId" defaultValue={original?val(original,'userId'):''} required maxLength={128}/><small>An Admin can copy the approved account ID from User Management.</small></label><label>{editing?'Licence':'Driver licence'}<input aria-label={editing?'Edit driver licence':undefined} name="licence" defaultValue={original?val(original,'licence'):''} required maxLength={80}/></label>{editing?<label>Base status<select aria-label="Edit driver base status" name="status" defaultValue={val(original!,'status')}><option>Available</option><option>Unavailable</option></select></label>:<input type="hidden" name="status" value="Available"/>}<p className="ft-help transport-full-row">This links an existing approved delivery-team account. It does not create or approve a login.</p>
     </>}
    </fieldset>
    {selection.mode==='edit'&&<small className="transport-full-row">Original record {selection.row.id} · version {selection.row.version}. Pending requests keep these original details.</small>}
    {operation.error&&<p role="alert" className="error transport-full-row">{operation.error} {operation.pending?'Close this form to recover the saved request above the tabs.':'Check the current list/history before repeating a request after a lost reply.'}</p>}
    <footer className="ft-form-footer"><button type="button" className="ft-action" disabled={operation.busy} onClick={close}>{operation.pending?'Close form':'Cancel'}</button><button type="submit" className="ft-action ft-action--primary" disabled={locked}>{operation.busy?'Saving…':selection.mode==='edit'?'Save resource changes':selection.mode==='event'?`Save ${selection.eventType.toLowerCase()} record`:vehicleFields?'Create vehicle':'Create driver'}</button></footer>
   </form>
  </section></div>}
 </div>;
}
