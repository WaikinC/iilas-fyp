import {useEffect, useRef, useState} from 'react';
import {getApp} from 'firebase/app';
import {getStorage, connectStorageEmulator, ref, uploadBytes, getBlob} from 'firebase/storage';
import {auth} from '../../../lib/firebase';
import {getActiveWorkspace, workspaceCommand} from '../../../lib/workspace';
import type {DataRecord} from './Operations';
import type {Membership} from '../workspace/WorkspaceGate';
import {canUploadEvidence, evidenceTypesForStage, validateEvidenceCapture} from '../../../lib/parcelEvidence';
import type {EvidenceStage} from '../../../lib/parcelEvidence';
import ParcelCamera from './ParcelCamera';
import ParcelAnalysis from './ParcelAnalysis';
import ParcelLiveCamera from './ParcelLiveCamera';
import {captureDeclaration, evidenceComposerKey, evidenceProvenance, validateEvidenceFile} from './parcelCapture';
import './parcelCapture.css';
let storage:ReturnType<typeof getStorage>|undefined;
function evidenceStorage(){if(!storage){storage=getStorage(getApp());if(['localhost','127.0.0.1'].includes(location.hostname))connectStorageEmulator(storage,'127.0.0.1',9199);}return storage;}
export default function EvidenceUpload({shipment,member,stage,evidence}:{shipment:DataRecord;member:Membership;stage:EvidenceStage;evidence:DataRecord[]}){
  return <EvidenceContext key={evidenceComposerKey(member,shipment,stage)} shipment={shipment} member={member} stage={stage} evidence={evidence}/>;
}
type MediaMode='idle'|'manual-camera'|'selection'|'upload'|'live';
function EvidenceContext({shipment,member,stage,evidence}:{shipment:DataRecord;member:Membership;stage:EvidenceStage;evidence:DataRecord[]}){
  const [error,setError]=useState(''),[mediaMode,setMediaMode]=useState<MediaMode>('idle'),[type,setType]=useState<string>(stage==='Delivery'?'Proof of Delivery':evidenceTypesForStage(stage)[0]);
  const allowed=member.active&&member.status==='Approved'&&canUploadEvidence({role:member.role,shipmentStatus:String(shipment.status??''),stage,actorUid:member.uid,assignedDriverUid:String(shipment.driverUid??'')});
  async function open(e:DataRecord){try{const blob=await getBlob(ref(evidenceStorage(),String(e.path)));const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=String(e.name);a.click();URL.revokeObjectURL(url);}catch(e){setError(String(e));}}
  return <div>{allowed ? <EvidenceComposer shipment={shipment} member={member} stage={stage} type={type} onTypeChange={setType} mediaMode={mediaMode} onMediaChange={setMediaMode}/> : <p>Your current role or shipment status allows viewing evidence only.</p>}
    {allowed&&type!=='Parcel Image'&&<p>Choose Parcel Image to open live camera analysis. Recorded live sessions remain available below.</p>}
    <ParcelLiveCamera member={member} shipment={shipment} stage={stage} active={mediaMode==='live'} acquisitionDisabled={type!=='Parcel Image'||!['idle','live'].includes(mediaMode)} onOpen={()=>{if(allowed&&type==='Parcel Image'&&mediaMode==='idle')setMediaMode('live');}} onClose={()=>setMediaMode(mode=>mode==='live'?'idle':mode)}/>
    {error&&<p role="alert" className="error">{error}</p>}
    <div className="evidence-list">{evidence.map(e=>{
      const provenance=evidenceProvenance(e);
      return <article key={e.id}><button onClick={()=>open(e)}>{String(e.name)} · {String(e.type)}</button>
        <dl className="parcel-evidence-details"><div><dt>Stage</dt><dd>{provenance.stage}</dd></div><div><dt>Source</dt><dd>{provenance.source}</dd></div>
          <div><dt>Registered</dt><dd>{registeredTime(e.createdAt)}</dd></div>
          {provenance.capturedAtClient&&<div><dt>Client capture time</dt><dd>{new Date(provenance.capturedAtClient).toLocaleString()} (unverified device clock)</dd></div>}
        </dl><code>SHA-256: {String(e.sha256)}</code><small>{String(e.bytes)} bytes</small>
        <ParcelAnalysis member={member} shipment={shipment} evidence={e}/></article>;
    })}</div>
  </div>;
}

function registeredTime(value:unknown){
  return value&&typeof value==='object'&&'seconds' in value?new Date(Number(value.seconds)*1000).toLocaleString():'Time not recorded';
}

type Selection = {file: File; url: string; ready: boolean; captureSource:'file'|'camera'; capturedAtClient:string|null};

function EvidenceComposer({shipment,member,stage,type,onTypeChange,mediaMode,onMediaChange}: {shipment: DataRecord;member:Membership;stage:EvidenceStage;type:string;onTypeChange:(type:string)=>void;mediaMode:MediaMode;onMediaChange:(mode:MediaMode)=>void}) {
  const types=evidenceTypesForStage(stage);
  const [selection,setSelection]=useState<Selection|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const camera=mediaMode==='manual-camera',liveActive=mediaMode==='live';
  const previewUrl=useRef(''),input=useRef<HTMLInputElement>(null),uploading=useRef(false),active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);};},[]);
  function clearSelection(){
    if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);
    previewUrl.current='';
    setSelection(null);
    if(!uploading.current)onMediaChange('idle');
    if(input.current)input.current.value='';
  }
  function choose(file:File|null,source:'file'|'camera'='file',capturedAtClient?:string){
    if(!active.current||liveActive||uploading.current)return;
    clearSelection();setError('');setMessage('');
    if(!file)return;
    try{
      validateEvidenceFile(file,type);
      const url=file.type.startsWith('image/')?URL.createObjectURL(file):'';
      previewUrl.current=url;
      setSelection({file,url,ready:!url,...captureDeclaration(source,capturedAtClient)});
      onMediaChange('selection');
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to use this file.');}
  }
  async function upload(){
    if(!active.current||!selection?.ready||uploading.current||liveActive||camera)return;
    const file=selection.file;
    uploading.current=true;setBusy(true);onMediaChange('upload');setError('');setMessage('');let uploaded=false;
    try{
    const stillCurrent=()=>{
      const current=getActiveWorkspace();
      return active.current&&auth?.currentUser?.uid===member.uid&&current&&evidenceComposerKey(current,shipment,stage)===evidenceComposerKey(member,shipment,stage);
    };
    if(!stillCurrent())throw new Error('Your account access changed. Select the evidence again.');
    validateEvidenceFile(file,type);
    const declaration=validateEvidenceCapture({stage,type,captureSource:selection.captureSource,capturedAtClient:selection.capturedAtClient});
    const key=crypto.randomUUID(),path=`evidence/${member.workspaceId}/${shipment.id}/${key}`;
    await uploadBytes(ref(evidenceStorage(),path),file,{contentType:file.type,customMetadata:{actor:member.uid,stage,evidenceType:type,captureSource:declaration.captureSource,capturedAtClient:declaration.capturedAtClient??''}});
    if(!stillCurrent())return;
    await workspaceCommand('registerEvidence',{id:key,shipmentId:shipment.id,path,name:file.name,...declaration});
    if(!active.current)return;
    clearSelection();uploaded=true;setMessage('Evidence uploaded. No AI condition result has been generated.');
    }catch(cause){if(active.current)setError(cause instanceof Error?cause.message:'Unable to upload evidence.');}
    finally{uploading.current=false;if(active.current){setBusy(false);onMediaChange(uploaded?'idle':'selection');}}
  }
  return <div className="parcel-evidence">
    <p className="parcel-stage-label"><b>Evidence stage: {stage}</b>{stage==='Pre-dispatch'?' · Prepared shipment before dispatch':' · Dispatched shipment'}</p>
    <div className="operations-form">
      <label>Evidence type<select aria-label="Evidence type" value={type} disabled={busy||liveActive||types.length===1} onChange={event=>{clearSelection();setError('');setMessage('');onTypeChange(event.target.value);}}>{types.map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Evidence file<input ref={input} aria-label="Evidence file" type="file" disabled={busy||camera||liveActive} accept={type==='Parcel Image'?'image/jpeg,image/png,image/webp':'image/jpeg,image/png,image/webp,application/pdf'} onChange={event=>choose(event.target.files?.[0]||null)}/></label>
    </div>
    {type==='Parcel Image' && <p className="parcel-analysis-notice">AI condition analysis is unavailable. Capture or choose a photo for manual review. A photo only shows the visible faces of the parcel.</p>}
    {camera ? <ParcelCamera onClose={()=>onMediaChange('idle')} onCapture={(file,capturedAtClient)=>{choose(file,'camera',capturedAtClient);}}/> :
      <div className="evidence-actions">{type==='Parcel Image'&&<button type="button" disabled={busy||liveActive} onClick={()=>{if(liveActive)return;clearSelection();setError('');setMessage('');onMediaChange('manual-camera');}}>Start camera</button>}</div>}
    {selection&&<div className="parcel-photo-review">
      <p><b>Review selected evidence</b> · {selection.file.name} · {(selection.file.size/1024).toFixed(0)} KB</p>
      {selection.url&&<img key={selection.url} src={selection.url} alt="Selected parcel evidence preview" onLoad={event=>{
        const image=event.currentTarget;
        if(image.naturalWidth*image.naturalHeight>24_000_000){clearSelection();setError('Choose an image with no more than 24 megapixels.');return;}
        setSelection(current=>current?.url===selection.url?{...current,ready:true}:current);
      }} onError={()=>{clearSelection();setError('This image could not be opened. Choose a valid JPG, PNG, or WebP.');}}/>}
      <p>Source: {selection.captureSource==='camera'?'Camera (declared)':'File selection (declared)'}.{selection.capturedAtClient&&<> Client capture time: {new Date(selection.capturedAtClient).toLocaleString()} (unverified device clock).</>}</p>
      <p>The file stays on this device until you select Upload evidence. Registration time is recorded by the server.</p>
      <div className="evidence-actions">
        <button type="button" className="primary navy" disabled={busy||!selection.ready||camera||liveActive} onClick={upload}>{busy?'Uploading…':'Upload evidence'}</button>
        <button type="button" disabled={busy} onClick={()=>{clearSelection();setError('');}}>Discard selection</button>
      </div>
    </div>}
    {error&&<p role="alert" className="error">{error}</p>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
