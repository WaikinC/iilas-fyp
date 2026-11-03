import {FormEvent,ReactNode,useEffect,useMemo,useState} from 'react';
import {User,sendEmailVerification,signOut} from 'firebase/auth';
import {doc,onSnapshot} from 'firebase/firestore';
import {Box, Clock, ShieldCheck} from 'lucide-react';
import {auth,db} from '../../../lib/firebase';
import {setActiveWorkspace,workspaceCommand} from '../../../lib/workspace';
import {STAFF_ROLES} from '../../../lib/accountRoles';
import CustomerPortal from '../customer/CustomerPortal';
import {RoleRouteBoundary} from '../navigation/AppNavigation';

// workspaceId is an internal compatibility field for preserved legacy record IDs.
// Users belong to one fixed system; no organisation selection or invitations exist.
export type Membership={uid:string;email:string;emailVerified:boolean;displayName:string;role:string;status:string;active:boolean;version:number;workspaceId:string};
type Profile=Omit<Membership,'workspaceId'>;
export default function AccountGate(props:{user:User;children:(member:Membership)=>ReactNode}){return <AccountGateBody key={props.user.uid} {...props}/>;}
function AccountGateBody({user,children}:{user:User;children:(member:Membership)=>ReactNode}){
  const [profile,setProfile]=useState<Profile|null>(null),[scope,setScope]=useState(''),[error,setError]=useState(''),[ready,setReady]=useState(false),[name,setName]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{
    if(!db)return;let live=true;
    const stop=onSnapshot(doc(db,'users',user.uid),snapshot=>{if(!live)return;const data=snapshot.exists()?snapshot.data() as Profile:null;setProfile(data?.uid===user.uid?data:null);setName(current=>current||data?.displayName||'');},e=>{if(live)setError(e.message);});
    void workspaceCommand('registerAccount').then(()=>{if(live)setReady(true);}).catch(e=>{if(live){setError(e.message);setReady(true);}});
    return()=>{live=false;stop();setActiveWorkspace(null);};
  },[user.uid]);
  const approved=profile?.status==='Approved'&&profile.active;
  const staffApproved=approved&&profile&&STAFF_ROLES.includes(profile.role);
  useEffect(()=>{if(!db||!staffApproved)return;return onSnapshot(doc(db,'system','config'),s=>setScope(String(s.data()?.dataScopeId||'')),e=>setError(e.message));},[staffApproved]);
  const member=useMemo(()=>staffApproved&&scope&&profile?{...profile,workspaceId:scope}:null,[staffApproved,scope,profile]);
  useEffect(()=>{setActiveWorkspace(member);},[member]);
  async function saveName(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await workspaceCommand('registerAccount',{displayName:name});setNotice('Display name saved.');}catch(e){setError(e instanceof Error?e.message:'Unable to save.');}finally{setBusy(false);}}
  async function verify(){setError('');try{await sendEmailVerification(user);setNotice('Verification email sent. Follow the link, then refresh your verification.');}catch(e){setError(String(e));}}
  async function refresh(){setBusy(true);try{await user.reload();await user.getIdToken(true);await workspaceCommand('registerAccount');setNotice('Account refreshed.');setError('');}catch(e){setError(String(e));}finally{setBusy(false);}}
  if(!ready)return <main className="setup-notice" role="status">Checking your account access…</main>;
  if(approved&&profile?.role==='Customer')return <RoleRouteBoundary role="Customer"><CustomerPortal profile={profile}/></RoleRouteBoundary>;
  if(member)return <RoleRouteBoundary role={member.role}>{children(member)}</RoleRouteBoundary>;
  const status=profile?.status||'Pending';
  return <main className="account-access"><div className="brand"><span className="brand-icon"><Box size={23}/></span><span><b>IILAS</b><small>Inventory & logistics</small></span></div><h1>{status==='Disabled'?'Account access disabled':status==='Rejected'?'Access request declined':approved?'Loading shared access…':'Waiting for administrator approval'}</h1><p>Signed in as <b>{user.email}</b>.</p>{!approved&&<div className="access-status"><Clock size={18}/>{status==='Pending'?'Your request is pending. An Admin must approve and assign your staff or Customer role.':'Contact your Admin to review this account’s access.'}</div>}{status==='Pending'&&<ol className="access-steps"><li>Create your account — done.</li><li>{user.emailVerified?'Email verified.':'Verify your email using the link we send.'}</li><li>Your Admin approves access and assigns a role.</li></ol>}{error&&<p role="alert" className="error">{error}</p>}{notice&&<div role="status" className="success-notice">{notice}</div>}<form onSubmit={saveName}><label className="field">Your display name<input aria-label="Your display name" value={name} onChange={e=>setName(e.target.value)} placeholder="Name your team will recognise" required maxLength={80}/></label><button className="primary" disabled={busy}>Save display name</button></form><div className="access-actions">{!user.emailVerified&&<button onClick={verify}>Send email verification</button>}<button disabled={busy} onClick={refresh}>Refresh account access</button><button onClick={()=>auth&&signOut(auth)}>Sign out</button></div><p><ShieldCheck size={14}/> Approved staff share the same inventory and shipment records. {status==='Disabled'||status==='Rejected'?'Refreshing does not restore disabled or declined access.':'This page updates when your Admin approves your account.'}</p></main>;
}
