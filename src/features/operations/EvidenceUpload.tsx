import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {ref, uploadBytes, getBlob} from 'firebase/storage';
import {auth,demoEnvironment} from '../../../lib/firebase';
import {storage as configuredStorage,sparkTransport} from '../../../lib/firebaseRuntime';
import {createEvidenceTransport} from '../../../lib/evidenceTransport';
import {sparkRecoveryKey} from '../../../lib/sparkRuntime';
import {getActiveWorkspace, workspaceCommand} from '../../../lib/workspace';
import {STAFF_ROLES} from '../../../lib/accountRoles';
import SavedProofImage, {isProofImage, maxProofBytes} from '../../components/SavedProofImage';
import type {DataRecord} from './Operations';
import type {Membership} from '../workspace/WorkspaceGate';
import {canUploadEvidence, evidenceTypesForStage, validateEvidenceCapture} from '../../../lib/parcelEvidence';
import type {EvidenceStage} from '../../../lib/parcelEvidence';
import ParcelCamera from './ParcelCamera';
import ParcelAnalysis from './ParcelAnalysis';
import ParcelLiveCamera from './ParcelLiveCamera';
import {captureDeclaration, evidenceComposerKey, evidenceProvenance, validateEvidenceFile} from './parcelCapture';
import './parcelCapture.css';
import type {EvidenceActivity} from './delivery/deliveryActivity';
import {deliveryWorkspaceKey} from './delivery/deliveryPresentation';
type ActivityReporter=(contextKey:string,activity:EvidenceActivity|null)=>void;
type ComposerActivity={busy:boolean;hasSelection:boolean;hasPending:boolean};
function evidenceStorage(){if(!configuredStorage)throw Error('The configured evidence service is unavailable.');return configuredStorage;}
function evidenceClient(downloadLimit?: number) {
  return createEvidenceTransport({
    profile: demoEnvironment, auth, command: workspaceCommand, transport: sparkTransport, storage: window.sessionStorage,
    legacy: {
      upload: (path, file, metadata) => uploadBytes(ref(evidenceStorage(), path), file, {contentType: file.type, customMetadata: metadata}),
      download: path => getBlob(ref(evidenceStorage(), path), downloadLimit),
    },
  });
}
type EvidenceProps = {
  shipment: DataRecord;
  member: Membership;
  stage: EvidenceStage;
  evidence: DataRecord[];
  onActivityChange?: ActivityReporter;
  showSavedProof?: boolean;
  recordedProofId?: string;
};

export default function EvidenceUpload(props: EvidenceProps) {
  return <EvidenceContext key={evidenceComposerKey(props.member,props.shipment,props.stage)} {...props}/>;
}
type MediaMode='idle'|'manual-camera'|'selection'|'upload'|'live';
function EvidenceContext({shipment,member,stage,evidence,onActivityChange,showSavedProof,recordedProofId}: EvidenceProps){
  const [error,setError]=useState(''),[mediaMode,setMediaMode]=useState<MediaMode>('idle'),[type,setType]=useState<string>(stage==='Delivery'?'Proof of Delivery':evidenceTypesForStage(stage)[0]);
  const [selectedProofId, setSelectedProofId] = useState<string>();
  const contextKey=evidenceComposerKey(member,shipment,stage);
  const [work,setWork]=useState<ComposerActivity>({busy:false,hasSelection:false,hasPending:false});
  const reportWork=useCallback((next:ComposerActivity)=>setWork(old=>old.busy===next.busy&&old.hasSelection===next.hasSelection&&old.hasPending===next.hasPending?old:next),[]);
  useLayoutEffect(()=>{onActivityChange?.(contextKey,{contextKey,shipmentId:shipment.id,stage,mode:mediaMode,...work});},[contextKey,shipment.id,stage,mediaMode,work,onActivityChange]);
  useLayoutEffect(()=>()=>onActivityChange?.(contextKey,null),[contextKey,onActivityChange]);
  const allowed=member.active&&member.status==='Approved'&&canUploadEvidence({role:member.role,shipmentStatus:String(shipment.status??''),stage,actorUid:member.uid,assignedDriverUid:String(shipment.driverUid??'')});
  const canPreview = showSavedProof && stage === 'Delivery' && shipment.status === 'Dispatched' &&
    member.active && member.status === 'Approved' && STAFF_ROLES.includes(member.role) &&
    (member.role !== 'Driver' || shipment.driverUid === member.uid);
  const proofId = selectedProofId ?? recordedProofId;
  const proof = canPreview && proofId ? evidence.find(record => record.id === proofId) : undefined;
  const image = proof && savedDeliveryImage(proof, shipment.id, member.workspaceId);
  async function open(e:DataRecord){try{const blob=await evidenceClient().download({id:e.id,path:String(e.path)});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=String(e.name);a.click();URL.revokeObjectURL(url);}catch(e){setError(String(e));}}
  return <div>{allowed ? <EvidenceComposer shipment={shipment} member={member} stage={stage} type={type} onTypeChange={setType} mediaMode={mediaMode} onMediaChange={setMediaMode} onActivityStateChange={onActivityChange?reportWork:undefined} onSaved={setSelectedProofId}/> : <p>Your current role or shipment status allows viewing evidence only.</p>}
    {canPreview&&selectedProofId&&!proof&&<p role="status">Loading the saved proof record…</p>}
    {image&&<StaffProofPhoto key={JSON.stringify([image.id,image.path,image.fileName,image.contentType,image.bytes])} member={member} image={image}/>}
    {demoEnvironment.mode==='local-emulator'&&allowed&&type!=='Parcel Image'&&<p>Choose Parcel Image to open live camera analysis. Recorded live sessions remain available below.</p>}
    {demoEnvironment.mode!=='local-emulator'?<p>Parcel AI and camera testing remain paused in this cloud demo. Manual evidence files can still be registered.</p>:<ParcelLiveCamera member={member} shipment={shipment} stage={stage} active={mediaMode==='live'} acquisitionDisabled={type!=='Parcel Image'||!['idle','live'].includes(mediaMode)} onOpen={()=>{if(allowed&&type==='Parcel Image'&&mediaMode==='idle')setMediaMode('live');}} onClose={()=>setMediaMode(mode=>mode==='live'?'idle':mode)}/>}
    {error&&<p role="alert" className="error">{error}</p>}
    <div className="evidence-list">{evidence.map(e=>{
      const provenance=evidenceProvenance(e);
      return <article key={e.id}><button onClick={()=>open(e)}>{String(e.name)} · {String(e.type)}</button>
        {canPreview&&image?.id!==e.id&&savedDeliveryImage(e,shipment.id,member.workspaceId)&&
          <button type="button" onClick={()=>setSelectedProofId(e.id)}>View saved image</button>}
        <dl className="parcel-evidence-details"><div><dt>Stage</dt><dd>{provenance.stage}</dd></div><div><dt>Source</dt><dd>{provenance.source}</dd></div>
          <div><dt>Registered</dt><dd>{registeredTime(e.createdAt)}</dd></div>
          {provenance.capturedAtClient&&<div><dt>Client capture time</dt><dd>{new Date(provenance.capturedAtClient).toLocaleString()} (unverified device clock)</dd></div>}
        </dl><code>SHA-256: {String(e.sha256)}</code><small>{String(e.bytes)} bytes</small>
        {demoEnvironment.mode==='local-emulator'&&<ParcelAnalysis member={member} shipment={shipment} evidence={e}/>}</article>;
    })}</div>
  </div>;
}

function savedDeliveryImage(record: DataRecord, shipmentId: string, scope: string) {
  const {id, path, contentType, bytes, name} = record;
  if (record.ownerId !== scope || record.shipmentId !== shipmentId ||
      record.stage !== 'Delivery' || record.type !== 'Proof of Delivery' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(id) || path !== `evidence/${scope}/${shipmentId}/${id}` ||
      !isProofImage(contentType) || typeof bytes !== 'number' || !Number.isSafeInteger(bytes) ||
      bytes < 1 || bytes > maxProofBytes) return null;
  return {id, path, contentType, bytes, fileName: typeof name === 'string' ? name : 'Proof of delivery'};
}

function StaffProofPhoto({member, image}: {member: Membership; image: NonNullable<ReturnType<typeof savedDeliveryImage>>}) {
  const workspaceKey = deliveryWorkspaceKey(member);
  const {uid} = member;
  const {id, path, contentType, bytes, fileName} = image;
  const load = useCallback(async (signal: AbortSignal) => {
    function checkAccess() {
      signal.throwIfAborted();
      const workspace = getActiveWorkspace();
      if (auth?.currentUser?.uid !== uid || !workspace || deliveryWorkspaceKey(workspace) !== workspaceKey) {
        throw Error('Proof access changed.');
      }
    }
    checkAccess();
    const blob = await evidenceClient(maxProofBytes).download({id,path},signal);
    checkAccess();
    return blob;
  }, [uid, workspaceKey, id, path]);
  return <SavedProofImage fileName={fileName} contentType={contentType} bytes={bytes} load={load}/>;
}

function registeredTime(value:unknown){
  return value&&typeof value==='object'&&'seconds' in value?new Date(Number(value.seconds)*1000).toLocaleString():'Time not recorded';
}

type Selection = {file: File; url: string; ready: boolean; captureSource:'file'|'camera'; capturedAtClient:string|null};

function EvidenceComposer({shipment,member,stage,type,onTypeChange,mediaMode,onMediaChange,onActivityStateChange,onSaved}: {shipment: DataRecord;member:Membership;stage:EvidenceStage;type:string;onTypeChange:(type:string)=>void;mediaMode:MediaMode;onMediaChange:(mode:MediaMode)=>void;onActivityStateChange?:(state:ComposerActivity)=>void;onSaved:(id:string)=>void}) {
  const types=evidenceTypesForStage(stage);
  const [selection,setSelection]=useState<Selection|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const camera=mediaMode==='manual-camera',liveActive=mediaMode==='live';
  const previewUrl=useRef(''),input=useRef<HTMLInputElement>(null),uploading=useRef(false),active=useRef(true);
  const isSpark=demoEnvironment.mode==='spark-msi'||demoEnvironment.mode==='spark-loopback-test';
  const current=()=>{const workspace=getActiveWorkspace();return Boolean(active.current&&auth?.currentUser?.uid===member.uid&&workspace&&evidenceComposerKey(workspace,shipment,stage)===evidenceComposerKey(member,shipment,stage));};
  const recoveryContext=()=>({member,shipment:{id:shipment.id,version:Number(shipment.version)},declaration:{stage,type,captureSource:'file' as const,capturedAtClient:null},isCurrent:current});
  function readPending(){if(!isSpark)return false;try{return Boolean(evidenceClient().pending(recoveryContext()));}catch{return true;}}
  const [hasPending,setHasPending]=useState(()=>{if(demoEnvironment.mode!=='spark-msi'&&demoEnvironment.mode!=='spark-loopback-test')return false;try{return Boolean(window.sessionStorage.getItem(sparkRecoveryKey(demoEnvironment,member.uid,`proof.${member.workspaceId}.${shipment.id}.${stage}`)));}catch{return true;}});
  useLayoutEffect(()=>{onActivityStateChange?.({busy,hasSelection:selection!==null,hasPending});},[busy,selection,hasPending,onActivityStateChange]);
  function refreshPending(){setHasPending(readPending());}
  async function recover(){
    if(uploading.current)return;
    uploading.current=true;
    setBusy(true);
    setError('');
    try {
      const result=await evidenceClient().recover(recoveryContext()) as {state?:string;id?:unknown};
      if(active.current){
        clearSelection();
        if(stage==='Delivery'&&typeof result?.id==='string')onSaved(result.id);
        setMessage(result?.state==='Cancelled'?'The incomplete proof operation was cancelled. Select a file to start a new upload.':'The original proof registration was recovered.');
      }
    } catch(e) {
      if(active.current)setError(e instanceof Error?e.message:'Unable to recover the original proof.');
    } finally {
      uploading.current=false;
      if(active.current){setBusy(false);refreshPending();}
    }
  }
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
    const saved=await evidenceClient().uploadAndRegister({member,shipment:{id:shipment.id,version:Number(shipment.version)},declaration,file,isCurrent:()=>Boolean(stillCurrent())}) as {id?:unknown};
    if(!active.current)return;
    if(type==='Proof of Delivery'&&typeof saved?.id==='string')onSaved(saved.id);
    clearSelection();uploaded=true;setMessage('Evidence uploaded. No AI condition result has been generated.');
    }catch(cause){if(active.current)setError(cause instanceof Error?cause.message:'Unable to upload evidence.');}
    finally{uploading.current=false;if(active.current){setBusy(false);onMediaChange(uploaded?'idle':'selection');refreshPending();}}
  }
  return <div className="parcel-evidence">
    <p className="parcel-stage-label"><b>Evidence stage: {stage}</b>{stage==='Pre-dispatch'?' · Prepared shipment before dispatch':' · Dispatched shipment'}</p>
    {isSpark&&hasPending&&<p>A proof operation is saved for this shipment. <button type="button" disabled={busy} onClick={recover}>Recover saved proof</button> Recovery checks the original outcome and can cancel an expired or stale incomplete upload before you choose another file.</p>}
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
