import{createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode}from'react';
import{auth,demoEnvironment,projectId,recordCreationRecoveryStorage}from'../../../lib/firebaseRuntime.js';
import{getActiveWorkspace,workspaceCommand}from'../../../lib/workspace';
import{createRecordCreationClient,type RecordCreationClient}from'../../../lib/recordCreationClient';
import type{RecordKind,RecordCreateInput,RecordCreateOutcome}from'../../../lib/recordCreation';
import type{Membership}from'./WorkspaceGate';
type State={pending:RecordCreateInput|null;busy:boolean;error:string;outcome:RecordCreateOutcome|null};
type Store={client:RecordCreationClient;states:Record<RecordKind,State>;run:(kind:RecordKind,action:'start'|'retry'|'check'|'cancel',data?:Record<string,unknown>)=>Promise<RecordCreateOutcome>};
const Context=createContext<Store|null>(null),kinds:RecordKind[]=['products','shipments','purchaseOrders'];
type Props={member:Membership;children:ReactNode;adapter?:{storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>;command:(action:string,input:unknown)=>Promise<unknown>;isCurrent:()=>boolean;environmentKey:string}};
export function RecordCreationProvider(props:Props){const{member,adapter}=props;return <CreationSession key={JSON.stringify([member.uid,member.workspaceId,adapter?.environmentKey||demoEnvironment.mode+':'+projectId])} {...props}/>;}
function CreationSession({member,children,adapter}:Props){
 const current=useCallback(()=>(adapter?adapter.isCurrent():auth?.currentUser?.uid===member.uid&&getActiveWorkspace()?.uid===member.uid&&getActiveWorkspace()?.workspaceId===member.workspaceId),[adapter,member.uid,member.workspaceId]);
 const client=useMemo(()=>createRecordCreationClient({storage:adapter?.storage||recordCreationRecoveryStorage,context:{uid:member.uid,scope:member.workspaceId,environmentKey:adapter?.environmentKey||`${demoEnvironment.mode}:${projectId}`},command:adapter?.command||((action,input)=>workspaceCommand(action,input as Record<string,unknown>)),isCurrent:current}),[member.uid,member.workspaceId,adapter,current]);
 const [snapshot,setSnapshot]=useState<{client:RecordCreationClient;states:Record<RecordKind,State>}>(()=>({client,states:Object.fromEntries(kinds.map(k=>[k,{pending:null,busy:false,error:'',outcome:null}])) as Record<RecordKind,State>}));
 const empty=useMemo(()=>Object.fromEntries(kinds.map(k=>[k,{pending:null,busy:false,error:'',outcome:null}])) as Record<RecordKind,State>,[]);
 const states=snapshot.client===client?snapshot.states:empty;
 const refresh=useCallback(()=>{const fresh=Object.fromEntries(kinds.map(k=>{try{return[k,{pending:client.pending(k),busy:false,error:'',outcome:null}];}catch(e){return[k,{pending:null,busy:false,error:e instanceof Error?e.message:'Saved creation unavailable.',outcome:null}];}})) as Record<RecordKind,State>;setSnapshot({client,states:fresh});},[client]);
 useEffect(()=>{client.activate();let live=true;void Promise.resolve().then(()=>{if(live)refresh();});return()=>{live=false;client.dispose();};},[client,refresh]);
 const run=useCallback(async(kind:RecordKind,action:'start'|'retry'|'check'|'cancel',data?:Record<string,unknown>)=>{setSnapshot(previous=>({client,states:{...(previous.client===client?previous.states:empty),[kind]:{...(previous.client===client?previous.states[kind]:empty[kind]),busy:true,error:'',outcome:null}}}));
  let result:RecordCreateOutcome|null=null,error='';try{result=await(action==='start'?client.start({kind,data:data!}):client[action](kind));return result;}catch(e){error=e instanceof Error?e.message:'Unable to confirm creation.';throw e;}finally{let pending:RecordCreateInput|null=null;try{pending=client.pending(kind);}catch(e){error=e instanceof Error?e.message:error;}setSnapshot(previous=>previous.client!==client?previous:{client,states:{...previous.states,[kind]:{pending,busy:false,error,outcome:result}}});}},[client,empty]);
 return <Context.Provider value={{client,states,run}}>{children}</Context.Provider>;
}
export function useRecordCreation(kind:RecordKind){const store=useContext(Context);const run=store?.run;const start=useCallback((data:Record<string,unknown>)=>run!(kind,'start',data),[run,kind]),retry=useCallback(()=>run!(kind,'retry'),[run,kind]),check=useCallback(()=>run!(kind,'check'),[run,kind]),cancel=useCallback(()=>run!(kind,'cancel'),[run,kind]);if(!store)throw Error('Record creation must be inside the shared staff provider.');return{...store.states[kind],start,retry,check,cancel};}
