import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {collection,getDocs,limit,query,where} from 'firebase/firestore';
import {db} from '../../../lib/firebase';
import {fleetResourceEligibility,fleetScheduleDay,planningEstimate,validatePlanningInputs,type PlanningInputs,type PlanningEstimate,type TransportRevision} from '../../../lib/transportPlanning';
import {useDialogFocus} from '../../components/useDialogFocus';
import TransportPlanningMap from './TransportPlanningMap';
import type {Membership} from '../workspace/WorkspaceGate';
import type {DataRecord} from './Operations';
import {OperationMessages,OperationPager,effectiveAssignment,numericField,operationRoles,recordValue as val,useAssignments,useCompletionAction,useOperationPage,formFields} from './operationsData';
import {OperationalStatus,OperationalTabs} from './FleetTransportUI';
import {transportEditable} from './fleetTransportPresentation';
import './fleetTransport.css';
type Props={member:Membership;shipments:DataRecord[]};
const quantity=(r:DataRecord,key:string)=>typeof r[key]==='number'?new Intl.NumberFormat(undefined,{maximumFractionDigits:3}).format(r[key] as number):'Unknown';
export default function TransportManagement(props:Props){return <TransportBody key={`${props.member.uid}:${props.member.role}:${props.member.version}`} {...props}/>;}
function TransportBody({member,shipments}:Props){
 const operation=useCompletionAction(member,'reviseTransportPlan','resolveTransportRevision'),canEdit=operationRoles.includes(member.role),locked=operation.busy||operation.blocked||!!operation.pending;
 const [status,setStatus]=useState(''),[plannedDate,setPlannedDate]=useState(''),[search,setSearch]=useState(''),[selection,setSelection]=useState<{plan:DataRecord|null;shipment:DataRecord|null}|null>(null);
 const [details,setDetails]=useState<DataRecord|null>(null),[cancel,setCancel]=useState<DataRecord|null>(null),[dirty,setDirty]=useState(false),dialog=useRef<HTMLElement>(null);
 const plans=useOperationPage('transportPlans',member.workspaceId,operation.revision,{status,plannedDate}),vehicles=useOperationPage('vehicles',member.workspaceId,operation.revision),drivers=useOperationPage('drivers',member.workspaceId,operation.revision);
 const va=useAssignments(member.workspaceId,'vehicles',vehicles.rows,operation.revision),da=useAssignments(member.workspaceId,'drivers',drivers.rows,operation.revision);
 const close=useCallback(()=>{if(operation.busy)return;if(dirty&&!operation.pending&&!window.confirm('Discard unsaved changes in this form?'))return;setSelection(null);setCancel(null);setDetails(null);setDirty(false);},[operation.busy,operation.pending,dirty]);
 useDialogFocus(dialog,close,selection!==null||cancel!==null||details!==null);
 const focusDialog=()=>requestAnimationFrame(()=>dialog.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus());
 function edit(plan:DataRecord|null,shipment:DataRecord|null){setDetails(null);setCancel(null);setDirty(false);setSelection({plan:plan?{...plan}:null,shipment:shipment?{...shipment}:null});focusDialog();}
 function cancellation(plan:DataRecord){setDetails(null);setSelection(null);setDirty(false);setCancel({...plan});focusDialog();}
 const matching=plans.rows.filter(p=>[p.id,p.vehicleName,p.driverName,p.vehicleId,p.driverId,p.carrier,shipments.find(s=>s.id===p.shipmentId)?.reference].some(v=>String(v??'').toLowerCase().includes(search.toLowerCase())));
 async function save(input:Omit<TransportRevision,'operationId'>){if(locked)return;if(await operation.start(input)){setSelection(null);setDirty(false);}}
 const currentPlan=details?(plans.rows.find(p=>p.id===details.id)??details):null,currentShipment=currentPlan?shipments.find(s=>s.id===currentPlan.shipmentId):undefined;
 const reference=(p:DataRecord)=>String(shipments.find(s=>s.id===p.shipmentId)?.reference??p.shipmentId);
 const tabs=[{id:'all',label:'All plans'},{id:'Scheduled',label:'Scheduled'},{id:'Completed',label:'Completed'},{id:'Cancelled',label:'Cancelled'}];
 return <div className="operations-page transport-workspace ft-workspace">
  <header className="page-heading"><div><h1>Transport Management</h1><p>Schedule a prepared shipment, then review its transport plan.</p></div>{canEdit&&<button type="button" className="ft-action ft-action--accent" disabled={locked} onClick={()=>edit(null,null)}>Plan prepared shipment</button>}</header>
  <OperationMessages operation={operation} label="transport plan" hideError={!!selection||!!cancel}/>
  <OperationalTabs prefix="transport" label="Transport areas" tabs={tabs} active={status||'all'} onChange={v=>setStatus(v==='all'?'':v)}/>
  <section className="ft-panel" role="tabpanel" id={`transport-panel-${status||'all'}`} aria-labelledby={`transport-tab-${status||'all'}`}>
   <div className="ft-panel-heading"><div><h2>Transport plans</h2><p>{plans.loading?'Loading selection…':`${plans.rows.length} loaded on this page`} · Open a plan for details and actions.</p></div></div>
   <div className="ft-filters"><label>Search this schedule page<input aria-label="Search this schedule page" value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Planned date<input type="date" aria-label="Schedule date filter" value={plannedDate} onChange={e=>setPlannedDate(e.target.value)}/></label><button type="button" className="ft-action" onClick={()=>{setSearch('');setPlannedDate('');setStatus('');}}>Clear filters</button></div>
   {plans.error&&<p role="alert" className="error">{plans.error}</p>}{plans.loading?<p role="status">Loading transport plans…</p>:<div className="ft-list">{matching.map(p=><article key={p.id} className="ft-record"><div className="ft-record-main"><div className="ft-record-heading"><h3>{reference(p)}</h3><OperationalStatus label={val(p,'status')}/></div><p>{val(p,'origin')} → {val(p,'destination')}</p><div className="ft-record-meta"><span>Vehicle {val(p,'vehicleName')}</span><span>Driver {val(p,'driverName')}</span><span>Planned {val(p,'plannedDate')}</span></div></div><button type="button" className="ft-action" aria-label={`Open transport ${reference(p)}`} onClick={()=>{setDirty(false);setDetails({...p});focusDialog();}}>Open plan</button></article>)}</div>}
   {!plans.loading&&!matching.length&&<p className="ft-empty">No matching plans on this page. Change the status/date selection or use the page controls.</p>}<p className="ft-page-note">Search covers the loaded page. Status tabs and date apply to the query; changing them starts at the first page.</p><OperationPager page={plans} label="transport plans"/>
  </section>
  {currentPlan&&<div className="modal-backdrop"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="transport-detail-title" className="ft-dialog">
   <div className="ft-dialog-heading"><div><h2 id="transport-detail-title">Transport plan</h2><p>{reference(currentPlan)}</p></div><button type="button" className="ft-action" aria-label="Close plan details" onClick={close}>Close</button></div>
   <OperationalStatus label={val(currentPlan,'status')}/>
   <dl className="ft-details-grid"><div><dt>Origin</dt><dd>{val(currentPlan,'origin')}</dd></div><div><dt>Destination</dt><dd>{val(currentPlan,'destination')}</dd></div><div><dt>Vehicle</dt><dd>{val(currentPlan,'vehicleName')}</dd></div><div><dt>Driver</dt><dd>{val(currentPlan,'driverName')}</dd></div><div><dt>Planned date</dt><dd>{val(currentPlan,'plannedDate')}</dd></div><div><dt>Carrier</dt><dd>{val(currentPlan,'carrier')}</dd></div><div><dt>Distance</dt><dd>{quantity(currentPlan,'distanceKm')} km</dd></div><div><dt>Estimated duration</dt><dd>{quantity(currentPlan,'estimatedHours')} hours</dd></div><div><dt>Estimated cost</dt><dd>MYR {quantity(currentPlan,'cost')}</dd></div><div><dt>Shipment state</dt><dd>{currentShipment?val(currentShipment,'status'):'Not loaded in this view'}</dd></div></dl>
   {!!currentPlan.planning&&<p className="ft-feedback">Includes saved map planning estimates. Manual distance and duration above remain the recorded scheduling values.</p>}
   {transportEditable(currentPlan,currentShipment,canEdit)?<div className="ft-actions"><button type="button" className="ft-action ft-action--primary" disabled={locked} aria-label={`Edit transport ${reference(currentPlan)}`} onClick={()=>edit(currentPlan,currentShipment??null)}>{currentPlan.status==='Cancelled'?'Review and reschedule':'Edit / reassign'}</button>{currentPlan.status==='Scheduled'&&<button type="button" className="ft-action ft-action--danger-outline" disabled={locked} aria-label={`Cancel transport ${reference(currentPlan)}`} onClick={()=>cancellation(currentPlan)}>Cancel schedule</button>}</div>:<p className="ft-help">{!canEdit?'Your role can view this plan.':!currentShipment?'Load the shipment in Order & Dispatch before changing its transport.':'This plan is read-only after dispatch or completion.'}</p>}
   {locked&&<p className="ft-help">Confirm or recover the saved request above the tabs before another action.</p>}
   <details className="integrity-technical"><summary>Record details</summary><p>Plan {currentPlan.id} · version {currentPlan.version}. Assignment and source versions are rechecked when saving.</p></details>
  </section></div>}
  {selection&&<div className="modal-backdrop"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="transport-editor-title" className="ft-dialog ft-dialog--wide transport-editor">
   <div className="ft-dialog-heading"><div><h2 id="transport-editor-title">{selection.plan?'Review transport assignment':'Plan a prepared shipment'}</h2><p>Choose the shipment and resources, then review schedule and estimates.</p></div><button type="button" className="ft-action" aria-label="Close transport editor" disabled={operation.busy} onClick={close}>Close</button></div>
   <TransportEditor member={member} initial={selection} shipments={shipments} vehicles={vehicles} drivers={drivers} va={va} da={da} busy={locked} onSave={save} onDirty={()=>setDirty(true)} onCancel={close}/>{operation.error&&<p role="alert" className="error">{operation.error} Close this editor to recover the saved plan.</p>}
  </section></div>}
  {cancel&&<div className="modal-backdrop"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="transport-cancel-title" className="ft-dialog">
   <div className="ft-dialog-heading"><div><h2 id="transport-cancel-title">Cancel scheduled transport</h2><p>{reference(cancel)}</p></div><button type="button" className="ft-action" aria-label="Close transport cancellation" disabled={operation.busy} onClick={close}>Close</button></div><p>This releases the vehicle and driver before dispatch. The shipment stays Prepared; stock is unchanged. Use Edit / reassign to swap resources instead.</p>
   <form className="operations-form" onChangeCapture={()=>setDirty(true)} onSubmit={async e=>{e.preventDefault();if(locked)return;if(await operation.legacy('cancelTransport',{shipmentId:cancel.id,version:cancel.version,...formFields(e.currentTarget)})){setCancel(null);setDirty(false);}}}><label className="transport-full-row">Cancellation notes<input name="notes" minLength={3} maxLength={240} required disabled={locked}/></label><footer className="ft-form-footer"><button type="button" className="ft-action" disabled={operation.busy} onClick={close}>Keep schedule</button><button type="submit" className="ft-action ft-action--danger" disabled={locked}>Confirm schedule cancellation</button></footer></form>{operation.error&&<p role="alert" className="error">{operation.error}</p>}<p className="ft-help">If the response is lost, refresh the schedule before repeating cancellation.</p>
  </section></div>}
 </div>;
}

type EditorProps={member:Membership;initial:{plan:DataRecord|null;shipment:DataRecord|null};shipments:DataRecord[];vehicles:ReturnType<typeof useOperationPage>;drivers:ReturnType<typeof useOperationPage>;va:ReturnType<typeof useAssignments>;da:ReturnType<typeof useAssignments>;busy:boolean;onSave:(input:Omit<TransportRevision,'operationId'>)=>Promise<void>;onDirty:()=>void;onCancel:()=>void};
function TransportEditor({member,initial,shipments,vehicles,drivers,va,da,busy,onSave,onDirty,onCancel}:EditorProps){
 const [mapOpen,setMapOpen]=useState(false);
 const [shipment,setShipment]=useState<DataRecord|null>(initial.shipment),[basePlan,setBasePlan]=useState<DataRecord|null>(initial.plan),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [vehicleId,setVehicleId]=useState(String(initial.plan?.vehicleId??'')),[driverId,setDriverId]=useState(String(initial.plan?.driverId??''));
 const [origin,setOrigin]=useState(String(initial.plan?.origin??'')),[carrier,setCarrier]=useState(String(initial.plan?.carrier??'')),[day,setDay]=useState(String(initial.plan?.plannedDate??'')),[distance,setDistance]=useState(String(initial.plan?.distanceKm??'')),[hours,setHours]=useState(String(initial.plan?.estimatedHours??'')),[cost,setCost]=useState(String(initial.plan?.cost??''));
 const savedPlanning=initial.plan?.planning as PlanningInputs|undefined;
 const [coordinates,setCoordinates]=useState({originLatitude:String(savedPlanning?.origin?.latitude??''),originLongitude:String(savedPlanning?.origin?.longitude??''),destinationLatitude:String(savedPlanning?.destination?.latitude??''),destinationLongitude:String(savedPlanning?.destination?.longitude??''),speedKph:String(savedPlanning?.speedKph??60)});
 const [preview,setPreview]=useState<{inputs:PlanningInputs;estimate:PlanningEstimate}|null>(()=>{try{if(savedPlanning){const inputs=validatePlanningInputs({origin:savedPlanning.origin,destination:savedPlanning.destination,speedKph:savedPlanning.speedKph});return {inputs,estimate:planningEstimate(inputs)};}}catch{/* Unknown legacy estimates remain manual values. */}return null;}),[includePlanning,setIncludePlanning]=useState(Boolean(savedPlanning)),[mapNotice,setMapNotice]=useState('');
 const epoch=useRef(0),live=useRef(true);
 // A selection reply may not replace a later selection or a closed editor.
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 const stale=shipment&&shipments.find(s=>s.id===shipment.id)?.version!==shipment.version;
 async function selectShipment(id:string){const gen=++epoch.current;setError('');setShipment(null);setBasePlan(null);if(!id)return;const selected=shipments.find(s=>s.id===id);if(!selected||!db)return;setLoading(true);
  try{const result=await getDocs(query(collection(db,'transportPlans'),where('ownerId','==',member.workspaceId),where('shipmentId','==',id),limit(2)));if(gen!==epoch.current||!live.current)return;if(result.size>1)throw Error('Multiple transport plans were found. Refresh before planning.');const old=result.docs[0];if(old&&(old.id!==id||old.data().ownerId!==member.workspaceId||old.data().shipmentId!==id))throw Error('The transport plan identity differs. Refresh before planning.');if(old&&!['Scheduled','Cancelled'].includes(String(old.data().status)))throw Error('This plan cannot be revised.');setShipment({...selected});setBasePlan(old?{...old.data(),id:old.id} as DataRecord:null);}
  catch(e){if(gen===epoch.current&&live.current)setError(e instanceof Error?e.message:'The current plan is unavailable.');}finally{if(gen===epoch.current&&live.current)setLoading(false);}
 }
 function calculate(){onDirty();setError('');try{const inputs=validatePlanningInputs({origin:{latitude:numericField(coordinates.originLatitude),longitude:numericField(coordinates.originLongitude)},destination:{latitude:numericField(coordinates.destinationLatitude),longitude:numericField(coordinates.destinationLongitude)},speedKph:numericField(coordinates.speedKph)});setPreview({inputs,estimate:planningEstimate(inputs)});setIncludePlanning(true);setMapNotice('Planning waypoints will be saved with this plan. Review and deliberately apply estimates or keep manual values.');}catch(e){setPreview(null);setIncludePlanning(false);setError(e instanceof Error?e.message:'Enter valid planning waypoints.');}}
 function changeCoordinate(key:keyof typeof coordinates,value:string){setCoordinates(v=>({...v,[key]:value}));setPreview(null);setIncludePlanning(false);setMapNotice('Waypoints changed. Calculate again to save them. Existing manual distance/time values are retained.');}
 const eligibilityDay=fleetScheduleDay(day);
 const vehicleDates=new Map(vehicles.rows.map(row=>[row.id,fleetResourceEligibility('vehicles',row,eligibilityDay)]));
 const driverDates=new Map(drivers.rows.map(row=>[row.id,fleetResourceEligibility('drivers',row,eligibilityDay)]));
 const selectedVehicleDates=vehicleDates.get(vehicleId),selectedDriverDates=driverDates.get(driverId);
 const blockedDates=[...(selectedVehicleDates?.blocked??[]),...(selectedDriverDates?.blocked??[])];
 const unknownDates=[...(selectedVehicleDates?.unknown??[]),...(selectedDriverDates?.unknown??[])];
 async function submit(e:FormEvent){e.preventDefault();if(busy||!shipment||loading||stale||blockedDates.length)return;await onSave({shipmentId:shipment.id,expectedShipmentVersion:shipment.version,expectedPlanVersion:basePlan?.version??0,vehicleId,driverId,origin,carrier,plannedDate:day,distanceKm:numericField(distance),estimatedHours:numericField(hours),cost:numericField(cost),planning:includePlanning&&preview?preview.inputs:null});}
 return <form className="operations-form transport-plan-form" onSubmit={e=>void submit(e)} onChangeCapture={onDirty}>
  <fieldset className="ft-form-section" disabled={busy}><legend>Shipment</legend>
  <label>Prepared shipment<select aria-label="Plan shipment" value={shipment?.id??''} disabled={!!initial.plan||loading} required onChange={e=>void selectShipment(e.target.value)}><option value="">Select a prepared shipment…</option>{shipments.filter(s=>s.status==='Prepared').map(s=><option key={s.id} value={s.id}>{val(s,'reference')}</option>)}</select></label>
  {shipment&&<p className="transport-full-row">Recorded destination: {val(shipment,'address')} · Shipment version {shipment.version} · {basePlan?`Plan version ${basePlan.version} (${val(basePlan,'status')})`:'No existing plan'}. Dispatch and resource availability are checked when saved.</p>}{stale&&<p role="alert">The selected shipment changed. Close this editor and review its current facts.</p>}
  </fieldset>
  <fieldset className="ft-form-section" disabled={busy}><legend>Vehicle and driver</legend>
   <label>Vehicle<select aria-label="Plan vehicle" value={vehicleId} onChange={e=>setVehicleId(e.target.value)} required>
    <option value="">Select from the current vehicle page…</option>
    {basePlan&&!vehicles.rows.some(v=>v.id===basePlan.vehicleId)&&<option value={String(basePlan.vehicleId)}>Current saved assignment: {val(basePlan,'vehicleName')}</option>}
    {vehicles.rows.map(vehicle=>{
     const lock=va.rows.find(a=>a.id===`${member.workspaceId}_vehicle_${vehicle.id}`);
     const effective=effectiveAssignment(vehicle,'vehicles',va,member.workspaceId,shipments);
     const dates=vehicleDates.get(vehicle.id);
     const reason=dates?.blocked[0];
     return <option key={vehicle.id} value={vehicle.id} disabled={!!reason||!va.ready||vehicle.status!=='Available'||!!lock&&lock.shipmentId!==shipment?.id}>
      {val(vehicle,'name')} · {reason??effective.label}
     </option>;
    })}
   </select></label>
   <label>Driver<select aria-label="Plan driver" value={driverId} onChange={e=>setDriverId(e.target.value)} required>
    <option value="">Select from the current driver page…</option>
    {basePlan&&!drivers.rows.some(d=>d.id===basePlan.driverId)&&<option value={String(basePlan.driverId)}>Current saved assignment: {val(basePlan,'driverName')}</option>}
    {drivers.rows.map(driver=>{
     const lock=da.rows.find(a=>a.id===`${member.workspaceId}_driver_${driver.id}`);
     const effective=effectiveAssignment(driver,'drivers',da,member.workspaceId,shipments);
     const reason=driverDates.get(driver.id)?.blocked[0];
     return <option key={driver.id} value={driver.id} disabled={!!reason||!da.ready||driver.status!=='Available'||!!lock&&lock.shipmentId!==shipment?.id}>
      {val(driver,'name')} · {reason??effective.label}
     </option>;
    })}
   </select></label>
   <p className="ft-help transport-full-row">Recorded fleet dates are checked for {eligibilityDay} (Malaysia).</p>
   {!!blockedDates.length&&<p className="error transport-full-row" role="alert">{blockedDates.join(' ')}</p>}
   {!!unknownDates.length&&<p className="ft-help transport-full-row">Dates not recorded: {unknownDates.join(', ')}.</p>}
  {vehicles.error&&<p role="alert">{vehicles.error}</p>}{drivers.error&&<p role="alert">{drivers.error}</p>}{(va.error||da.error)&&<p role="alert">Resource assignment is unavailable; availability remains unknown.</p>}<div className="transport-full-row"><OperationPager page={vehicles} label="vehicle choices"/><OperationPager page={drivers} label="driver choices"/></div>
  </fieldset><fieldset className="ft-form-section" disabled={busy}><legend>Route and schedule</legend><label>Origin<input aria-label="Plan origin" required maxLength={240} value={origin} onChange={e=>setOrigin(e.target.value)}/></label><label>Carrier<input aria-label="Plan carrier" required maxLength={120} value={carrier} onChange={e=>setCarrier(e.target.value)}/></label><label>Planned date<input aria-label="Plan date" type="date" required value={day} onChange={e=>setDay(e.target.value)}/></label></fieldset><fieldset className="ft-form-section" disabled={busy}><legend>Estimates</legend><label>Distance (km)<input aria-label="Plan distance (km)" type="number" min={0} max={100000} step="any" required value={distance} onChange={e=>setDistance(e.target.value)}/></label><label>Estimated hours<input aria-label="Plan estimated hours" type="number" min="0.1" max={1000} step="any" required value={hours} onChange={e=>setHours(e.target.value)}/></label><label>Estimated cost (MYR)<input aria-label="Plan cost (MYR)" type="number" min={0} max={1000000} step="any" required value={cost} onChange={e=>setCost(e.target.value)}/></label>
  </fieldset><details className="ft-map-disclosure" onToggle={e=>setMapOpen(e.currentTarget.open)}><summary>Optional planning map</summary>{mapOpen&&<fieldset className="transport-full-row transport-waypoints" disabled={busy}><legend>Planning waypoints</legend><p>Enter waypoints deliberately. No GPS capture or address lookup is performed. The dashed line is a great-circle estimate; it does not represent a road route, traffic or a delivery prediction. The basemap uses OpenStreetMap tiles.</p><div className="transport-coordinate-grid">{([['originLatitude','Origin latitude',-90,90],['originLongitude','Origin longitude',-180,180],['destinationLatitude','Destination latitude',-90,90],['destinationLongitude','Destination longitude',-180,180],['speedKph','Planning speed (km/h)',5,120]] as const).map(([key,label,min,max])=><label key={key}>{label}<input aria-label={label} type="number" min={min} max={max} step="any" value={coordinates[key]} onChange={e=>changeCoordinate(key,e.target.value)}/></label>)}</div><button type="button" onClick={calculate}>Calculate planning estimate</button>{mapNotice&&<p>{mapNotice}</p>}
   {preview&&<><p>Great-circle planning estimate: {preview.estimate.distanceKm.toFixed(3)} km · {preview.estimate.estimatedHours.toFixed(3)} hours at {preview.inputs.speedKph} km/h.</p><TransportPlanningMap inputs={preview.inputs}/><div className="integrity-actions"><button type="button" onClick={()=>{setDistance(String(preview.estimate.distanceKm));onDirty();}}>Use estimated distance</button><button type="button" disabled={preview.estimate.estimatedHours<.1||preview.estimate.estimatedHours>1000} onClick={()=>{setHours(String(preview.estimate.estimatedHours));onDirty();}}>Use estimated time</button></div>{preview.estimate.estimatedHours<.1&&<p>The estimate is below the scheduling minimum of 0.1 hours. Enter an explicit admissible manual time; it is never silently clamped.</p>}<label><input type="checkbox" checked={includePlanning} onChange={e=>setIncludePlanning(e.target.checked)}/> Save these planning waypoints and estimate alongside the manual values</label></>}
  </fieldset>}</details>
  {error&&<p className="error transport-full-row" role="alert">{error}</p>}<footer className="ft-form-footer"><button type="button" className="ft-action" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="ft-action ft-action--accent" disabled={busy||loading||!!stale||!shipment||!va.ready||!da.ready||!!blockedDates.length}>Save transport plan</button></footer>
 </form>;
}
