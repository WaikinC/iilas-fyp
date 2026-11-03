(() => {
  const initial = window.__appURLFixtureOptions || {role:'Admin',signedIn:true};
  const profile = role => ({uid:'fixture-'+role.toLowerCase(),email:role.toLowerCase()+'@example.test',displayName:'Fictional '+role,emailVerified:true,role,status:'Approved',active:true,version:1});
  const user = p => ({uid:p.uid,email:p.email,emailVerified:true,reload:async()=>{},getIdToken:async()=> 'fictional.fixture.signature'});
  const q = window.appURL = {
    profile:profile(initial.role),user:null,activeWorkspace:null,authListeners:new Set(),listeners:new Set(),profileListeners:new Set(),subscriptions:[],queries:[],calls:[],writes:[],adminMounts:0,moduleMounts:[],externalRequests:[],
    records:{
      products:[{id:'p1',ownerId:'scope',version:1,name:'Fictional carton',sku:'PRD-000001',barcode:'1234567890123',category:'Packing',location:'A',reorderLevel:3,quantityOnHand:50,reservedQuantity:0,status:'Active',imageDataUrl:''}],
      shipments:[{id:'s1',ownerId:'scope',version:1,status:'Draft',reference:'SHP-000001',recipient:'Fictional recipient',phone:'+60123456789',address:'Fictional destination',expectedDelivery:'2099-01-01',parcelCount:1,packed:false,items:[{productId:'p1',name:'Fictional carton',sku:'PRD-000001',quantity:2}]}],
      purchaseOrders:[{id:'po1',ownerId:'scope',version:1,status:'Submitted',reference:'PO-000001',supplierId:'supplier',supplierName:'Fictional supplier',requestedBy:'other-staff',expectedDate:'2099-01-01',totalCents:400,items:[{productId:'p1',name:'Fictional carton',sku:'PRD-000001',quantity:2,received:0,unitCost:2,unitCostCents:200}]}],
      suppliers:[{id:'supplier',ownerId:'scope',version:1,name:'Fictional supplier',contact:'supplier@example.test',status:'Active'}],
      auditLogs:[],stockMovements:[],warehouseHandovers:[],transportPlans:[],purchaseOrderEvents:[],expectedReplenishments:[],inventoryDemoReorderRequirements:[],inventoryDemoReorderEvents:[]
    }
  };
  if(initial.signedIn!==false)q.user=user(q.profile);
  q.setSession=(role,signedIn=true)=>{q.profile=profile(role);q.user=signedIn?user(q.profile):null;for(const next of q.authListeners)next(q.user);q.changed();};
  q.changed=()=>{for(const listener of q.listeners)listener();};
  q.profileChanged=()=>{for(const listener of q.profileListeners)listener();};
  q.snapshot=(id,data)=>({id,exists:()=>data!==undefined,data:()=>data});
  q.rows=ref=>{
    let rows=[...(q.records[ref.kind]||[])];
    for(const [field,op,value] of ref.filters||[]){const get=row=>field==='__name__'?row.id:row[field];if(op==='==')rows=rows.filter(row=>get(row)===value);if(op==='>=')rows=rows.filter(row=>get(row)>=value);if(op==='<=')rows=rows.filter(row=>get(row)<=value);if(op==='in')rows=rows.filter(row=>value.includes(get(row)));}
    const cap=ref.filters?.find(filter=>filter[0]==='limit')?.[1];if(cap!==undefined)rows=rows.slice(0,cap);
    return rows.map(({id,...data})=>q.snapshot(id,data));
  };
  q.onSnapshot=(ref,next,error)=>{
    q.subscriptions.push({...ref});
    const deliver=()=>{try{if(ref.kind==='users'&&ref.id)next(q.snapshot(ref.id,ref.id===q.profile.uid?{...q.profile}:undefined));else if(ref.kind==='system')next(q.snapshot(ref.id,{dataScopeId:'scope'}));else if(ref.id)next(q.snapshot(ref.id,q.records[ref.kind]?.find(row=>row.id===ref.id)));else next({docs:q.rows(ref)});}catch(e){if(error)error(e);else throw e;}};
    q.listeners.add(deliver);if(ref.kind==='users'&&ref.id)q.profileListeners.add(deliver);queueMicrotask(()=>{if(q.listeners.has(deliver))deliver();});return()=>{q.listeners.delete(deliver);q.profileListeners.delete(deliver);};
  };
  q.getDocs=async ref=>{q.queries.push({...ref});return {docs:q.rows(ref)};};
  q.getDoc=async ref=>{q.queries.push({...ref});return q.snapshot(ref.id,q.records[ref.kind]?.find(row=>row.id===ref.id));};
  q.forbidWrite=(action,input)=>{q.writes.push({action,input});throw Error('URL shell fixture forbids writes: '+action);};
  q.command=async(action,input={})=>{
    q.calls.push({action,input});
    if(action==='registerAccount')return {initialized:true};
    if(action==='getInventoryDemoProcurementAvailability'||action==='getInventoryDemoReorderAvailability')return {enabled:false,policyVersion:null};
    if(action==='getCustomerShipments')return {rows:[{shipmentId:'s1',reference:'SHP-000001',expectedDelivery:'2099-01-01',status:'Delivered'}],cursor:null,hasMore:false,observedAtMs:Date.now(),scanned:1};
    if(action==='getCustomerShipment'){if(input.shipmentId!=='s1')throw Error('No explicit fictional grant');return {shipmentId:'s1',reference:'SHP-000001',expectedDelivery:'2099-01-01',status:'Delivered',timeline:{rows:[],hasMore:false,coverage:'No delivery events in the fictional fixture.'},location:null,proof:null,observedAtMs:Date.now()};}
    return q.forbidWrite(action,input);
  };
  navigator.geolocation.getCurrentPosition=()=>{throw Error('URL shell fixture forbids GPS');};
})();
