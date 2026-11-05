import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,type ReactNode} from 'react';
import {createBrowserRouter,RouterProvider,useBlocker,useBeforeUnload,useLocation,useNavigate,Navigate,type BlockerFunction} from 'react-router-dom';
import {appRouteAccess,appRoutePath,parseAppRoute,type AppModule,type AppRoute} from '../../../lib/appRoutes';
export type NavigationGuard={check:(next:AppRoute,proceed:()=>void,cancel:()=>void)=>void;beforeUnload:()=>boolean};
type Navigation={route:AppRoute;pathname:string;go:(module:AppModule,recordId?:string|null,options?:{replace?:boolean})=>void;registerGuard:(key:string,guard:NavigationGuard)=>()=>void};
const Context=createContext<Navigation|null>(null);
const titles:Record<string,string>={dashboard:'Dashboard',products:'Product Management',stock:'Stock Management',warehouse:'Warehouse Operations',procurement:'Replenishment & Procurement',shipments:'Order & Dispatch',fleet:'Fleet Management',transport:'Transport Management',delivery:'Delivery Monitoring',reports:'Reports & Statistics',team:'User Management',customer:'Delivery monitor',customerOrders:'Your orders'};
const routers=new WeakMap<Document,ReturnType<typeof createBrowserRouter>>();
function routerForDocument(children:ReactNode){let router=routers.get(document);if(!router){router=createBrowserRouter([{path:'*',element:<NavigationProvider>{children}</NavigationProvider>}]);routers.set(document,router);}return router;}
// One router per browser document; StrictMode must not create duplicate history listeners.
export function AppRouter({children}:{children:ReactNode}){return <RouterProvider router={routerForDocument(children)}/>;}
function NavigationProvider({children}:{children:ReactNode}){
 const location=useLocation(),navigate=useNavigate(),route=useMemo(()=>parseAppRoute(location.pathname),[location.pathname]);
 const guards=useRef(new Map<string,{guard:NavigationGuard;token:symbol}>());
 const blocker=useBlocker(useCallback<BlockerFunction>(({currentLocation,nextLocation})=>currentLocation.pathname!==nextLocation.pathname&&guards.current.size>0,[]));
 const latestBlocker=useRef(blocker);useLayoutEffect(()=>{latestBlocker.current=blocker;},[blocker]);
 const registerGuard=useCallback((key:string,guard:NavigationGuard)=>{const entry={guard,token:Symbol(key)};guards.current.set(key,entry);return()=>{if(guards.current.get(key)===entry){guards.current.delete(key);if(latestBlocker.current.state==='blocked')latestBlocker.current.reset();}};},[]);
 useEffect(()=>{
  if(blocker.state!=='blocked')return;
  let active=true,settled=false;const entries=[...guards.current.entries()],next=parseAppRoute(blocker.location.pathname);
  const valid=()=>active&&!settled&&latestBlocker.current.state==='blocked'&&latestBlocker.current.location.key===blocker.location.key;
  const cancel=()=>{if(valid()){settled=true;blocker.reset();}};
  const run=(index:number)=>{if(!valid())return;if(index===entries.length){settled=true;blocker.proceed();return;}const [key,entry]=entries[index];if(guards.current.get(key)!==entry){cancel();return;}let decided=false;try{entry.guard.check(next,()=>{if(decided)return;decided=true;if(guards.current.get(key)!==entry){cancel();return;}run(index+1);},()=>{if(decided)return;decided=true;cancel();});}catch{cancel();}};
  run(0);return()=>{active=false;};
 },[blocker]);
 useBeforeUnload(useCallback(event=>{if([...guards.current.values()].some(({guard})=>guard.beforeUnload())){event.preventDefault();event.returnValue='';}},[]));
 const go=useCallback<Navigation['go']>((module,id,options)=>{const path=appRoutePath(module,id);if(path===location.pathname&&!location.search&&!location.hash)return;void navigate(path,{replace:options?.replace===true});},[navigate,location.pathname,location.search,location.hash]);
 useEffect(()=>{document.title=`${titles[route.module]??'Page unavailable'} | IILAS`;},[route.module]);
 const value=useMemo(()=>({route,pathname:location.pathname,go,registerGuard}),[route,location.pathname,go,registerGuard]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAppNavigation(){return useContext(Context);}
export function useNavigationGuard(key:string,guard:NavigationGuard|null){const register=useAppNavigation()?.registerGuard,enabled=guard!==null,current=useRef(guard);useLayoutEffect(()=>{current.current=guard;},[guard]);useEffect(()=>{if(!register||!enabled)return;return register(key,{check:(next,allow,cancel)=>current.current?current.current.check(next,allow,cancel):cancel(),beforeUnload:()=>current.current?.beforeUnload()??false});},[register,key,enabled]);}
export function RoleRouteBoundary({role,children}:{role:string;children:ReactNode}){
 const navigation=useAppNavigation();if(!navigation)return children;
 const access=appRouteAccess(navigation.route,role);
 if(access.state==='redirect')return <Navigate to={access.path} replace/>;
 if(access.state!=='allow')return <main className="setup-notice"><div><h1>{access.state==='forbidden'?'Access unavailable':'Page not found'}</h1><p>{access.state==='forbidden'?'Your current role cannot open this page.':'Check the link or return to your dashboard.'}</p><button className="primary navy" onClick={()=>navigation.go(role==='Customer'?'customer':'dashboard')}>Return to {role==='Customer'?'your shipments':'dashboard'}</button></div></main>;
 if(navigation.route.path!==navigation.pathname)return <Navigate to={navigation.route.path} replace/>;
 return children;
}
