import {useCallback,useEffect,useMemo,useState} from 'react';
import {auth,demoEnvironment,projectId} from '../../../lib/firebaseRuntime.js';
import {workspaceCommand} from '../../../lib/workspace';
import {createCustomerOrderClient,type CustomerOrderClient} from '../../../lib/customerOrderClient';
import {ORDER_KINDS,type OrderKind,type OrderMutation,type NewOrderMutation,type OrderOutcome} from '../../../lib/customerOrders';
export type OrderProfile={uid:string;role:string;status:string;active:boolean;version:number};
type State={pending:OrderMutation|null;busy:boolean;error:string;outcome:OrderOutcome|null};
const empty=()=>Object.fromEntries(ORDER_KINDS.map(kind=>[kind,{pending:null,busy:false,error:'',outcome:null}])) as Record<OrderKind,State>;
const storage={getItem:(key:string)=>window.localStorage.getItem(key),setItem:(key:string,value:string)=>window.localStorage.setItem(key,value),removeItem:(key:string)=>window.localStorage.removeItem(key)};
export function useOrderOperations(profile:OrderProfile){
 const current=useCallback(()=>auth?.currentUser?.uid===profile.uid&&profile.status==='Approved'&&profile.active&&profile.version>0&&Boolean(profile.role),[profile.uid,profile.status,profile.active,profile.version,profile.role]);
 const environmentKey=JSON.stringify([demoEnvironment.mode,projectId,'backendInstanceId'in demoEnvironment?demoEnvironment.backendInstanceId:null,window.location.origin]);
 const client=useMemo(()=>createCustomerOrderClient({storage,context:{uid:profile.uid,environmentKey},command:(action,input)=>workspaceCommand(action,input as Record<string,unknown>),isCurrent:current}),[profile.uid,environmentKey,current]);
 const [snapshot,setSnapshot]=useState<{client:CustomerOrderClient;states:Record<OrderKind,State>;ready:boolean}>(()=>({client,states:empty(),ready:false}));
 const states=snapshot.client===client?snapshot.states:empty();
 useEffect(()=>{client.activate();let live=true;void Promise.resolve().then(()=>{if(!live)return;const next=empty();for(const kind of ORDER_KINDS){try{next[kind].pending=client.pending(kind);}catch(e){next[kind].error=e instanceof Error?e.message:'Saved request unavailable.';}}setSnapshot({client,states:next,ready:true});});return()=>{live=false;client.dispose();};},[client]);
 const run=useCallback(async(kind:OrderKind,action:'start'|'retry'|'check'|'cancel',input?:NewOrderMutation)=>{
  setSnapshot(previous=>({client,ready:true,states:{...(previous.client===client?previous.states:empty()),[kind]:{...(previous.client===client?previous.states[kind]:empty()[kind]),busy:true,error:'',outcome:null}}}));let outcome:OrderOutcome|null=null,error='';
  try{outcome=await(action==='start'?client.start(input!):client[action](kind));return outcome;}
  catch(e){error=e instanceof Error?e.message:'Unable to confirm the request.';throw e;}
  finally{let pending:OrderMutation|null=null;try{pending=client.pending(kind);}catch(e){error=e instanceof Error?e.message:error;}setSnapshot(previous=>previous.client!==client?previous:{client,ready:true,states:{...previous.states,[kind]:{pending,busy:false,error,outcome}}});}
 },[client]);
 return {states,run,ready:snapshot.client===client&&snapshot.ready,busy:ORDER_KINDS.some(kind=>states[kind].busy),blocked:ORDER_KINDS.some(kind=>states[kind].error&&!states[kind].pending),current};
}
export type OrderOperations=ReturnType<typeof useOrderOperations>;
