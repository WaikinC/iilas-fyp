import {useState} from 'react';
import {getApp} from 'firebase/app';
import {getStorage, connectStorageEmulator, ref, uploadBytes, getBlob} from 'firebase/storage';
import {auth} from '../../../lib/firebase';
import {getActiveWorkspace, workspaceCommand} from '../../../lib/workspace';
import {DataRecord} from './Operations';
let storage:ReturnType<typeof getStorage>|undefined;
function evidenceStorage(){if(!storage){storage=getStorage(getApp());if(['localhost','127.0.0.1'].includes(location.hostname))connectStorageEmulator(storage,'127.0.0.1',9199);}return storage;}
export default function EvidenceUpload({shipment,allowed,evidence}:{shipment:DataRecord;allowed:boolean;evidence:DataRecord[]}){
  const [file,setFile]=useState<File|null>(null),[type,setType]=useState('Proof of Delivery'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function upload(){if(!file)return;setBusy(true);setError('');try{
    if(file.size>10*1024*1024||!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))throw new Error('Choose a JPG, PNG, WebP, or PDF up to 10 MB.');
    if(type==='Parcel Image'&&!file.type.startsWith('image/'))throw new Error('Parcel evidence must be an image.');
    const key=crypto.randomUUID(),scope=getActiveWorkspace()!.workspaceId,path=`evidence/${scope}/${shipment.id}/${key}`;
    await uploadBytes(ref(evidenceStorage(),path),file,{contentType:file.type,customMetadata:{actor:auth!.currentUser!.uid}});
    await workspaceCommand('registerEvidence',{id:key,shipmentId:shipment.id,path,name:file.name,type});setFile(null);
  }catch(e){setError(e instanceof Error?e.message:'Unable to upload evidence.');}finally{setBusy(false);}}
  async function open(e:DataRecord){try{const blob=await getBlob(ref(evidenceStorage(),String(e.path)));const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=String(e.name);a.click();URL.revokeObjectURL(url);}catch(e){setError(String(e));}}
  return <div>{allowed&&<div className="operations-form"><label>Evidence type<select aria-label="Evidence type" value={type} onChange={e=>setType(e.target.value)}><option>Proof of Delivery</option><option>Parcel Image</option></select></label><label>Evidence file<input aria-label="Evidence file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button type="button" className="primary navy" disabled={busy||!file} onClick={upload}>{busy?'Uploading…':'Upload evidence'}</button></div>}{error&&<p role="alert" className="error">{error}</p>}<div className="evidence-list">{evidence.map(e=><article key={e.id}><button onClick={()=>open(e)}>{String(e.name)} · {String(e.type)}</button><code>SHA-256: {String(e.sha256)}</code><small>{String(e.bytes)} bytes</small></article>)}</div></div>;
}
