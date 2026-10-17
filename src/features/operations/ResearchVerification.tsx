import {FormEvent,useEffect,useState} from 'react';
import {collection,onSnapshot,query,where} from 'firebase/firestore';
import {BrowserProvider,Contract,Eip1193Provider} from 'ethers';
import {db} from '../../../lib/firebase';
import {workspaceCommand} from '../../../lib/workspace';
import type {DataRecord} from './Operations';
import type {Membership} from '../workspace/WorkspaceGate';
declare global {interface Window {ethereum?:Eip1193Provider}}
type Prepared={id:string;kind:string;referenceHash:string;digest:string;canonical:string;contract:string|null;chainId:number};
const value=(r:DataRecord,k:string)=>String(r[k]??'');
export default function ResearchVerification({member,products,shipments,evidence}:{member:Membership;products:DataRecord[];shipments:DataRecord[];evidence:DataRecord[]}){
  const [predictions,setPredictions]=useState<DataRecord[]>([]),[movements,setMovements]=useState<DataRecord[]>([]),[verifications,setVerifications]=useState<DataRecord[]>([]);
  const [kind,setKind]=useState('inventory'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{if(!db)return;return onSnapshot(query(collection(db,'predictions'),where('ownerId','==',member.workspaceId)),s=>setPredictions(s.docs.map(d=>({id:d.id,...d.data()} as DataRecord))),e=>setError(e.message));},[member.workspaceId]);
  useEffect(()=>{if(!db)return;return onSnapshot(query(collection(db,'stockMovements'),where('ownerId','==',member.workspaceId)),s=>setMovements(s.docs.map(d=>({id:d.id,...d.data()} as DataRecord))),e=>setError(e.message));},[member.workspaceId]);
  useEffect(()=>{if(!db)return;return onSnapshot(query(collection(db,'verificationRecords'),where('ownerId','==',member.workspaceId)),s=>setVerifications(s.docs.map(d=>({id:d.id,...d.data()} as DataRecord))),e=>setError(e.message));},[member.workspaceId]);
  const canReview=['Admin','Manager'].includes(member.role);
  async function run(work:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Operation failed.');}finally{setBusy(false);}}
  async function predict(e:FormEvent<HTMLFormElement>){e.preventDefault();const input=Object.fromEntries(new FormData(e.currentTarget));await run(async()=>{await workspaceCommand('predict',input);setNotice('Prediction stored for human review.');});}
  async function register(e:FormEvent<HTMLFormElement>,send:boolean){e.preventDefault();const input=Object.fromEntries(new FormData(e.currentTarget));await run(async()=>{
    const prepared=await workspaceCommand('prepareVerification',input) as Prepared;
    if(!prepared.contract)throw new Error('The integrity registry is not configured. Start Hardhat and configure its deployed address in the backend.');
    if(!window.ethereum)throw new Error('Connect a compatible Ethereum wallet to the configured network.');
    const provider=new BrowserProvider(window.ethereum),network=await provider.getNetwork();if(network.chainId!==BigInt(prepared.chainId))throw new Error(`Switch your wallet to chain ${prepared.chainId}.`);
    const abi=['function register(bytes32,bytes32)','function lookup(bytes32) view returns(bytes32)'];
    const contract=new Contract(prepared.contract,abi,send?await provider.getSigner():provider);
    if(send){const transaction=await contract.register(`0x${prepared.referenceHash}`,`0x${prepared.digest}`);await transaction.wait();await workspaceCommand('registerVerification',{...input,transactionHash:transaction.hash});setNotice('Confirmed on-chain hash recorded.');}
    else{const stored=await contract.lookup(`0x${prepared.referenceHash}`);setNotice(stored==='0x'+'0'.repeat(64)?'Not Registered/Pending':stored===`0x${prepared.digest}`?'Verified: current record matches the registered blockchain hash.':'Unmatched: changed data requires human review.');}
  });}
  const candidates=kind==='inventory'?products:kind==='delivery'?shipments.filter(s=>s.status==='Dispatched'):evidence.filter(e=>e.type==='Parcel Image');
  return <>
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="success-notice" role="status">{notice}</p>}
    <section className="module-card operations-card"><h2>Research inference & human review</h2><p>Random Forest supports stock and delivery risk; MobileNetV2 supports parcel-condition review. Inference requires labelled training data and evaluated model files. Predictions never approve orders or change delivery status.</p>
      {['Admin','Manager','Inventory','Logistics','Driver'].includes(member.role)&&<form className="operations-form" onSubmit={predict}><label>Analysis<select name="kind" aria-label="Research analysis" value={kind} onChange={e=>setKind(e.target.value)}><option value="inventory">Inventory stock risk</option><option value="delivery">Delivery risk</option><option value="parcel">Parcel condition</option></select></label><label>Research record<select name="id" aria-label="Research record" required key={kind}><option value="">Select record…</option>{candidates.map(r=><option value={r.id} key={r.id}>{value(r,'name')||value(r,'reference')}</option>)}</select></label><button disabled={busy} className="primary navy">Request analysis</button></form>}
      {predictions.map(p=><article className="operations-row" key={p.id}><div><b>{value(p,'kind')}: {value(p,'label')} · {(Number(p.confidence)*100).toFixed(1)}%</b><p>{value(p,'model')} · Version {value(p,'modelVersion')} · {value(p,'reviewStatus')}</p><small>Global feature importance describes the model overall; it does not explain a specific prediction.</small></div>{canReview&&p.reviewStatus==='Pending'&&<form className="operations-form" onSubmit={e=>{e.preventDefault();const input=Object.fromEntries(new FormData(e.currentTarget));void run(async()=>{await workspaceCommand('reviewPrediction',{...input,id:p.id,version:p.version});setNotice('Human review recorded.');});}}><label>Review notes<input name="notes" required minLength={3} maxLength={500}/></label><select aria-label="Prediction review decision" name="decision"><option>Accept</option><option>Reject</option></select><button disabled={busy}>Record review</button></form>}</article>)}
    </section>
    <section className="module-card operations-card"><h2>SHA-256 blockchain verification</h2><p>Only opaque references and digests are registered. Full records, recipient details, and files remain in Firebase. A mismatch requires review; it does not prove fraud.</p>
      {canReview&&['inventory','delivery'].map(workflow=><form className="operations-form" key={workflow} onSubmit={e=>register(e,(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='register')}><input type="hidden" name="kind" value={workflow}/><label>{workflow==='inventory'?'Inventory movement':'Delivery evidence'}<select name="id" required aria-label={`${workflow} verification record`}><option value="">Select record…</option>{(workflow==='inventory'?movements:evidence).map(r=><option key={r.id} value={r.id}>{workflow==='inventory'?`${value(r,'type')} · ${value(r,'productName')} · ${value(r,'reference')}`:`${value(r,'name')} · ${value(r,'type')}`}</option>)}</select></label><button disabled={busy} value="verify">Check hash</button><button disabled={busy} value="register" className="primary navy">Register hash</button></form>)}
      {verifications.map(v=><article key={v.id}><b>{value(v,'kind')} · {value(v,'status')}</b><code className="invitation-code">{value(v,'digest')}</code><small>Chain {value(v,'chainId')} · Transaction {value(v,'transactionHash')}</small></article>)}
      <label className="field">Compare a local evidence file<input type="file" aria-label="Compare evidence file" onChange={e=>{const file=e.target.files?.[0];if(file)void run(async()=>{if(file.size>10*1024*1024)throw new Error('Choose evidence up to 10 MB.');const bytes=await crypto.subtle.digest('SHA-256',await file.arrayBuffer()),digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join(''),matched=evidence.find(e=>e.sha256===digest);setNotice(matched?`Verified file bytes: ${value(matched,'name')}`:'Unmatched: this file does not match any registered evidence in the shared system.');});}}/></label>
    </section>
  </>;
}
