export const APP_MODULE_PATHS=Object.freeze({dashboard:'/dashboard',products:'/inventory/products',stock:'/inventory/stock',warehouse:'/inventory/warehouse',procurement:'/inventory/procurement',shipments:'/logistics/shipments',fleet:'/logistics/fleet',transport:'/logistics/transport',delivery:'/logistics/deliveries',reports:'/reports',team:'/users',customer:'/customer',customerOrders:'/customer/orders'});
const detailBases={shipments:'/logistics/shipments/',procurement:'/inventory/procurement/orders/',customer:'/customer/shipments/',customerOrders:'/customer/orders/'};
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id);
export function appRoutePath(module,recordId){
 if(!Object.hasOwn(APP_MODULE_PATHS,module))throw Error('Unknown application module.');
 if(recordId===undefined||recordId===null)return APP_MODULE_PATHS[module];
 if(!Object.hasOwn(detailBases,module)||!validId(recordId))throw Error('Invalid record link.');
 return detailBases[module]+encodeURIComponent(recordId);
}
export function parseAppRoute(pathname){
 const missing=()=>({module:'not-found',recordId:null,path:typeof pathname==='string'?pathname:''});
 if(typeof pathname!=='string'||!pathname.startsWith('/')||pathname.startsWith('//')||/[?#\\]/.test(pathname))return missing();
 const path=pathname.length>1?pathname.replace(/\/$/,''):pathname;
 if(path==='/')return {module:'root',recordId:null,path:'/'};
 for(const [module,value]of Object.entries(APP_MODULE_PATHS))if(path===value)return {module,recordId:null,path:value};
 for(const [module,base]of Object.entries(detailBases))if(path.startsWith(base)){try{const recordId=decodeURIComponent(path.slice(base.length));if(validId(recordId))return {module,recordId,path:appRoutePath(module,recordId)};}catch{/* Malformed URLs are unavailable, never a record action. */}}
 return missing();
}
export function appRouteAccess(route,role){
 if(role==='Customer')return ['customer','customerOrders'].includes(route.module)?{state:'allow'}:{state:'redirect',path:'/customer/orders'};
 if(!['Admin','Manager','Inventory','Warehouse','Logistics','Driver','Viewer'].includes(role))return {state:'forbidden'};
 if(route.module==='root'||route.module==='customer'||route.module==='customerOrders')return {state:'redirect',path:'/dashboard'};
 if(route.module==='not-found')return {state:'not-found'};
 if(route.module==='team'&&role!=='Admin')return {state:'forbidden'};
 return {state:'allow'};
}
