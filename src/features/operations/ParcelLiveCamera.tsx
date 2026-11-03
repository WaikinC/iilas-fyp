import {sessionRecoveryStorage} from '../../../lib/firebaseRuntime';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {collection,doc,endAt,endBefore,limit,limitToLast,onSnapshot,orderBy,query,startAfter,startAt,where} from 'firebase/firestore';
import type {DocumentData,QueryConstraint,QueryDocumentSnapshot} from 'firebase/firestore';
import {getBlob,getMetadata,ref} from 'firebase/storage';
import {storage as configuredStorage} from '../../../lib/firebaseRuntime';
import {auth,db} from '../../../lib/firebase';
import {getActiveWorkspace,workspaceCommand} from '../../../lib/workspace';
import {canReadParcelLive,canStartParcelLive,parcelLiveFrameKey,parcelLiveReasonMessage,toPublicParcelLiveFrame,toPublicParcelLiveSession} from '../../../lib/parcelLive';
import type {ParcelLiveFramePublic,ParcelLiveReviewDecision,ParcelLiveReviewInput,ParcelLiveSessionPublic} from '../../../lib/parcelLive';
import {createParcelLiveClient} from '../../../lib/parcelLiveClient';
import type {ParcelLiveClient,ParcelLiveClientCapture,ParcelLiveClientSnapshot,ParcelLiveCommand} from '../../../lib/parcelLiveClient';
import {createParcelLiveSession} from '../../../lib/parcelLiveSession';
import type {ParcelLiveReason,ParcelLiveSession,ParcelLiveSnapshot} from '../../../lib/parcelLiveSession';
import type {EvidenceStage} from '../../../lib/parcelEvidence';
import type {Membership} from '../workspace/WorkspaceGate';
import type {DataRecord} from './Operations';
import {CameraSession,evidenceComposerKey} from './parcelCapture';
import {captureParcelLiveFrame} from './parcelLiveCapture';
import './parcelCapture.css';

export interface ParcelLiveCameraProps {
  member:Membership;shipment:DataRecord;stage:EvidenceStage;
  /** Parent controls mutual exclusion with manual photo/file acquisition. */
  active:boolean;onOpen:()=>void;onClose:()=>void;
  /** Disable acquisition during manual photo/file/upload work; history stays readable. */
  acquisitionDisabled?:boolean;
}
const idle:ParcelLiveSnapshot={state:'Idle',sessionId:null,attempted:0,completed:0,dropped:0,lastResult:null,reason:null,current:false,resultAgeMs:null};
function retainedStorage(){
  if(!configuredStorage)throw Error('The configured evidence service is unavailable.');return configuredStorage;
}
function localReason(reason:ParcelLiveReason|null){
  if(reason==='unavailable')return 'Live analysis is unavailable. Review recorded evidence manually.';
  if(reason==='hidden'||reason==='pagehide')return 'Live camera stopped when this page left the foreground.';
  if(reason==='track-ended')return 'The camera stream ended. Open the camera explicitly when ready.';
  if(reason==='context-changed')return 'Live analysis stopped because account or shipment context changed.';
  if(reason==='frame-limit'||reason==='lifetime-limit')return 'The live session reached its sample or time limit.';
  if(reason==='user-stop'||reason==='disposed')return 'Live analysis stopped. Already transmitted samples may remain retained.';
  return reason?'The live session stopped. Check any saved session before starting again.':'';
}
const recorded=(time:number|null)=>time===null?'Not recorded':new Date(time).toLocaleString();
type SessionCursor=QueryDocumentSnapshot<DocumentData>;
type SessionPage={direction:'latest'}|{direction:'older'|'newer';cursor:SessionCursor;inclusive?:boolean};
type SessionBounds={first:SessionCursor|null;last:SessionCursor|null;mayHaveOlder:boolean;mayHaveNewer:boolean;empty:boolean};

/** Historical shared reads stay outside the acquisition permission branch. */
export default function ParcelLiveCamera(props:ParcelLiveCameraProps){
  const {member,shipment,stage,active,onClose}=props;
  const identity=evidenceComposerKey(member,shipment,stage),[openedFor,setOpenedFor]=useState<string|null>(null);
  const readable=canReadParcelLive({account:member,scopeId:member.workspaceId,ownerId:member.workspaceId});
  useLayoutEffect(()=>{if(active&&(!readable||openedFor!==identity))onClose();},[active,onClose,readable,openedFor,identity]);
  if(!readable)return null;
  return <LiveContext key={identity} {...props} active={props.active&&openedFor===identity} onOpen={()=>{setOpenedFor(identity);props.onOpen();}}/>;
}

function LiveContext({member,shipment,stage,active,onOpen,onClose,acquisitionDisabled=false}:ParcelLiveCameraProps){
  const allowed=canStartParcelLive({account:member,scopeId:member.workspaceId,ownerId:member.workspaceId,role:member.role,shipmentStatus:String(shipment.status??''),stage,actorUid:member.uid,assignedDriverUid:String(shipment.driverUid??'')});
  const video=useRef<HTMLVideoElement>(null),camera=useRef<CameraSession|null>(null),controller=useRef<ParcelLiveSession|null>(null),client=useRef<ParcelLiveClient|null>(null),mounted=useRef(false),operation=useRef(false),mediaGeneration=useRef(0);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[storageFailure,setStorageFailure]=useState(false);
  const [saved,setSaved]=useState<ParcelLiveClientSnapshot|null>(null),[live,setLive]=useState<ParcelLiveSnapshot>(idle),[sessions,setSessions]=useState<ParcelLiveSessionPublic[]>([]),[frames,setFrames]=useState<ParcelLiveFramePublic[]>([]),[selected,setSelected]=useState<string|null>(null),[loading,setLoading]=useState(!!db);
  const [sessionPage,setSessionPage]=useState<SessionPage>({direction:'latest'}),[sessionBounds,setSessionBounds]=useState<SessionBounds>({first:null,last:null,mayHaveOlder:false,mayHaveNewer:false,empty:false}),[historyError,setHistoryError]=useState(''),[historyNotice,setHistoryNotice]=useState('');
  const historyGeneration=useRef(0),watchGeneration=useRef(0);
  const identity=evidenceComposerKey(member,shipment,stage);
  function stillCurrent(){
    const current=getActiveWorkspace();
    return mounted.current&&auth?.currentUser?.uid===member.uid&&!!current&&evidenceComposerKey(current,shipment,stage)===identity;
  }
  function refresh(){
    if(!mounted.current||!client.current)return;
    try{setSaved(client.current.snapshot());setStorageFailure(false);}catch{setStorageFailure(true);}
  }
  function releaseMedia(){
    mediaGeneration.current++;camera.current?.stop();camera.current=null;
    if(video.current)video.current.srcObject=null;
    if(mounted.current)setReady(false);
  }
  function stop(reason:ParcelLiveReason='user-stop'){
    controller.current?.stop(reason);releaseMedia();
    if(mounted.current){setLive(controller.current?.snapshot()??idle);onClose();}
  }
  useLayoutEffect(()=>{
    mounted.current=true;
    try{
      const adapter=createParcelLiveClient({storage:sessionRecoveryStorage,context:{scopeId:member.workspaceId,actorUid:member.uid,shipmentId:shipment.id,stage},command:workspaceCommand as ParcelLiveCommand,onChange:()=>{if(mounted.current)refresh();}});
      client.current=adapter;refresh();
    }catch{queueMicrotask(()=>{if(mounted.current)setStorageFailure(true);});}
    return()=>{
      mounted.current=false;controller.current?.dispose();controller.current=null;releaseMedia();client.current?.dispose();client.current=null;
    };
    // This entire owner remounts on the full authority/shipment identity above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useLayoutEffect(()=>{
    if(!active||!allowed||acquisitionDisabled){controller.current?.stop(active?'context-changed':'user-stop');releaseMedia();if(active)onClose();return;}
    const owner=new CameraSession();camera.current=owner;const generation=++mediaGeneration.current;const element=video.current;
    let alive=true;
    const isCurrent=()=>alive&&stillCurrent()&&generation===mediaGeneration.current&&camera.current===owner;
    const interrupt=(reason:ParcelLiveReason)=>{if(isCurrent())stop(reason);};
    const hidden=()=>{if(document.hidden)interrupt('hidden');},pagehide=()=>interrupt('pagehide'),ended=()=>interrupt('track-ended');
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',pagehide);
    void (async()=>{
      try{
        if(document.hidden||!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error();
        const stream=await owner.start(()=>navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}}));
        if(!stream||!isCurrent()||!element){owner.stop();return;}
        stream.getTracks().forEach(track=>track.addEventListener('ended',ended,{once:true}));element.srcObject=stream;
        await element.play();
        if(!isCurrent()||!owner.isCurrent(stream)){owner.stop();return;}
        setReady(true);setError('');
      }catch{owner.stop();if(isCurrent()){setReady(false);setError('The live camera could not start. Close it and check browser permission or choose a manual photo.');}}
    })();
    return()=>{alive=false;owner.stop();if(element)element.srcObject=null;document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',pagehide);};
    // Camera lifetime is controlled by active plus the immutable context owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[active,allowed,acquisitionDisabled]);
  useEffect(()=>{
    const timer=window.setInterval(()=>{if(mounted.current&&controller.current)setLive(controller.current.snapshot());},1000);
    return()=>window.clearInterval(timer);
  },[]);
  useEffect(()=>{
    if(!db)return;let alive=true;const generation=++historyGeneration.current;
    const constraints:QueryConstraint[]=[where('ownerId','==',member.workspaceId),where('shipmentId','==',shipment.id),orderBy('createdAt','desc')];
    if(sessionPage.direction==='latest')constraints.push(limit(20));
    else if(sessionPage.direction==='older')constraints.push(sessionPage.inclusive?startAt(sessionPage.cursor):startAfter(sessionPage.cursor),limit(20));
    else constraints.push(sessionPage.inclusive?endAt(sessionPage.cursor):endBefore(sessionPage.cursor),limitToLast(20));
    const unsubscribe=onSnapshot(query(collection(db,'parcelLiveSessions'),...constraints),snapshot=>{
      if(!alive||generation!==historyGeneration.current||!mounted.current)return;const records:ParcelLiveSessionPublic[]=[];let invalid=false;
      for(const document of snapshot.docs){
        try{
          const value=toPublicParcelLiveSession(document.data());if(value.sessionId!==document.id||value.ownerId!==member.workspaceId||value.shipmentId!==shipment.id)throw new Error();records.push(value);
          const running=controller.current?.snapshot();
          if(value.state!=='Open'&&running?.sessionId===value.sessionId&&['Starting','Running'].includes(running.state)&&stillCurrent())stop(value.state==='Expired'?'expired':'context-changed');
        }catch{invalid=true;if(controller.current?.snapshot().sessionId===document.id&&stillCurrent())stop('invalid-result');}
      }
      setSessions(records);setLoading(false);setHistoryError(invalid?'A saved live session could not be verified. Check saved records before relying on them.':'');
      if(snapshot.docs.length){
        setSessionBounds({first:snapshot.docs[0],last:snapshot.docs[snapshot.docs.length-1],mayHaveOlder:sessionPage.direction==='newer'||snapshot.docs.length===20,mayHaveNewer:sessionPage.direction!=='latest',empty:false});setHistoryNotice('');
      }else if(sessionPage.direction==='latest'){
        setSessionBounds({first:null,last:null,mayHaveOlder:false,mayHaveNewer:false,empty:true});setHistoryNotice('No recorded live sessions for this shipment.');
      }else{
        // A boundary query can be empty without retaining a growing page stack.
        // Its one anchor permits an inclusive return to the preceding page.
        setSessionBounds({first:sessionPage.cursor,last:sessionPage.cursor,mayHaveOlder:sessionPage.direction==='newer',mayHaveNewer:sessionPage.direction==='older',empty:true});setHistoryNotice(sessionPage.direction==='older'?'No older sessions. Select Newer or Latest to return.':'No newer sessions. Select Older or Latest to return.');
      }
    },()=>{if(alive&&generation===historyGeneration.current&&mounted.current){setLoading(false);setHistoryError('This history page could not be loaded. Any previous page and selected frame remain available. Select Latest or try a page again.');}});
    return()=>{alive=false;unsubscribe();};
    // The containing owner is keyed by every authority/shipment version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[member.workspaceId,shipment.id,sessionPage]);
  useEffect(()=>{
    if(!db||live.state!=='Running'||!live.sessionId)return;
    let alive=true;const generation=++watchGeneration.current,sessionId=live.sessionId,owner=controller.current;
    const current=()=>alive&&generation===watchGeneration.current&&controller.current===owner&&owner?.snapshot().sessionId===sessionId&&owner.snapshot().state==='Running'&&stillCurrent();
    // Paging historical records must not remove the foreground stop fence.
    // This bounded single-document observer validates transiently, retaining no
    // additional historical session DTO or page history.
    const unsubscribe=onSnapshot(doc(db,'parcelLiveSessions',sessionId),snapshot=>{
      if(!current())return;
      try{
        if(!snapshot.exists())throw new Error();const value=toPublicParcelLiveSession(snapshot.data());
        if(snapshot.id!==sessionId||value.sessionId!==sessionId||value.ownerId!==member.workspaceId||value.actorUid!==member.uid||value.shipmentId!==shipment.id||value.stage!==stage)throw new Error();
        if(value.state!=='Open')stop(value.state==='Expired'?'expired':'context-changed');
      }catch{if(current())stop('invalid-result');}
    },()=>{if(current())stop('invalid-result');});
    return()=>{alive=false;unsubscribe();};
    // The keyed owner supplies immutable authority bindings for this watcher.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[live.sessionId,live.state,member.workspaceId,member.uid,shipment.id,stage]);
  useEffect(()=>{
    if(!db||!selected)return;let alive=true,revision=0;
    const unsubscribe=onSnapshot(query(collection(db,'parcelLiveFrames'),where('ownerId','==',member.workspaceId),where('sessionId','==',selected),orderBy('sequence','asc'),limit(12)),snapshot=>{
      const currentRevision=++revision;
      void (async()=>{
        const records:ParcelLiveFramePublic[]=[];let invalid=false;
        for(const document of snapshot.docs){try{const value=toPublicParcelLiveFrame(document.data());const key=await parcelLiveFrameKey(value.ownerId,value.sessionId,value.frameId);if(!alive||revision!==currentRevision)return;if(document.id!==key||value.ownerId!==member.workspaceId||value.shipmentId!==shipment.id||value.sessionId!==selected)throw new Error();records.push(value);}catch{invalid=true;}}
        if(!alive||revision!==currentRevision)return;setFrames(records);if(invalid)setError('A saved live frame could not be verified. Its result is unavailable.');
      })();
    },()=>{if(alive){setFrames([]);setError('Saved live frames could not be loaded. Check connection and account access.');}});
    return()=>{alive=false;revision++;unsubscribe();};
  },[member.workspaceId,shipment.id,selected]);
  async function start(){
    const adapter=client.current,element=video.current,owner=camera.current,stream=element?.srcObject as MediaStream|null;
    if(!adapter||!element||!owner||!stream||!owner.isCurrent(stream)||!allowed||acquisitionDisabled||!ready||operation.current||!stillCurrent())return;
    try{const snapshot=adapter.snapshot();if(snapshot.pending||snapshot.busy||storageFailure)return;}catch{setStorageFailure(true);return;}
    operation.current=true;setBusy(true);setError('');setNotice('');controller.current?.dispose();
    const generation=mediaGeneration.current;
    const isCurrent=()=>stillCurrent()&&generation===mediaGeneration.current&&camera.current===owner&&owner.isCurrent(stream)&&!document.hidden;
    const running=createParcelLiveSession({
      open:input=>adapter.open(input),
      capture:input=>adapter.capture(input,()=>captureParcelLiveFrame(element,{signal:input.signal,isCurrent})),
      submit:input=>adapter.submit({...input,...{payload:input.payload as ParcelLiveClientCapture['payload']}}),
      close:input=>adapter.close(input),
      onEvent:event=>{
        if(!stillCurrent()||controller.current!==running)return;
        setLive(running.snapshot());refresh();
        if(event.type==='state'&&['Stopped','Unavailable'].includes(event.state)){releaseMedia();onClose();}
        if(event.type==='closed'&&!event.acknowledged)setNotice('Stop was not confirmed. Check or stop the saved session before starting again.');
      },
    });
    controller.current=running;
    try{await running.start();if(stillCurrent()&&running.snapshot().state==='Stopped')setError('The live session could not be confirmed. Check the saved session before starting again.');}
    catch{if(stillCurrent())setError('The live session could not be confirmed. Check the saved session before starting again.');}
    finally{operation.current=false;if(mounted.current){setBusy(false);refresh();}}
  }
  async function recover(stopSaved=false){
    if(!client.current||operation.current||!stillCurrent())return;
    operation.current=true;setBusy(true);setError('');setNotice('');
    controller.current?.stop('user-stop');releaseMedia();onClose();
    try{await (stopSaved?client.current.stopSaved():client.current.recover());if(stillCurrent())setNotice('Saved session checked. Recorded frames are historical; starting again is explicit.');}
    catch{if(stillCurrent())setError('The saved live session could not be confirmed. Its original IDs remain available for another explicit check.');}
    finally{operation.current=false;if(mounted.current){setBusy(false);refresh();}}
  }
  async function closeInterrupted(record:ParcelLiveSessionPublic){
    if(!client.current||operation.current||!stillCurrent()||['Starting','Running'].includes(live.state)&&live.sessionId===record.sessionId)return;
    operation.current=true;setBusy(true);setError('');setNotice('');releaseMedia();onClose();
    try{const ack=await client.current.cleanup(record);if(!stillCurrent())return;if(!ack.released)throw new Error();setNotice('Interrupted request closed. Starting another live session requires an explicit request.');}
    catch{if(stillCurrent())setError('This interrupted session could not be closed. Its saved identity remains available for another explicit check.');}
    finally{operation.current=false;if(mounted.current){setBusy(false);refresh();}}
  }
  function pageSessions(direction:'older'|'newer'|'latest'){
    if(loading||!stillCurrent())return;
    const cursor=direction==='older'?sessionBounds.last:sessionBounds.first;
    if(direction!=='latest'&&!cursor)return;
    // Invalidate old callbacks synchronously, before React subscribes the new
    // page. Keep the one selected frame query/review stable across navigation.
    historyGeneration.current++;setLoading(true);setHistoryError('');setHistoryNotice('');
    setSessionPage(direction==='latest'?{direction}:{direction,cursor:cursor!,inclusive:sessionBounds.empty});
  }
  const frameMap=new Map(frames.map(record=>[record.frameId,record]));
  if(saved?.frame&&saved.frame.shipmentId===shipment.id){const old=frameMap.get(saved.frame.frameId);if(!old||saved.frame.version>=old.version)frameMap.set(saved.frame.frameId,saved.frame);}
  const pending=saved?.pending,blocked=saved?.blocked,canReview=member.active&&member.status==='Approved'&&['Admin','Manager'].includes(member.role);
  return <section className="parcel-live" aria-label="Live parcel camera analysis">
    <h4>Live parcel camera</h4>
    <p>Only visible parcel faces can be assessed. No evaluated live model is currently accepted. Every inference needs human review.</p>
    {!allowed&&<p>Your current role, assignment or shipment stage allows viewing recorded live sessions only.</p>}
    {storageFailure&&<p role="alert" className="error">Saved live sessions cannot be verified. Enable session storage and reconcile saved sessions before starting again.</p>}
    {allowed&&!active&&<div className="evidence-actions"><button type="button" disabled={acquisitionDisabled||busy||!!pending||!!saved?.busy||storageFailure} onClick={()=>{if(acquisitionDisabled)return;setError('');onOpen();}}>Open live camera</button></div>}
    {active&&allowed&&<div className="parcel-camera">
      <p role="status">{ready?'Preview only. No images leave this device until Start live analysis.':'Starting live camera preview…'}</p>
      <video ref={video} muted playsInline aria-label="Live parcel camera preview"/>
      <p className="parcel-analysis-notice">Start live analysis sends sampled JPEG images from this device: at most 12 samples over 120 seconds, each up to 1 MiB and 960 pixels on its longest side. Samples are retained with this shipment and readable by all Approved shared staff. No continuous video or audio is recorded. Samples are not automatically training data. These limits do not promise frame rate, latency or accuracy.</p>
      <div className="evidence-actions">
        <button type="button" aria-label="Start live analysis" className="primary navy" disabled={acquisitionDisabled||!ready||busy||!!pending||!!saved?.busy||storageFailure||live.state==='Running'||live.state==='Starting'} onClick={()=>void start()}>Start live analysis</button>
        {['Starting','Running'].includes(live.state)&&<button type="button" onClick={()=>stop()}>Stop live analysis</button>}
        <button type="button" onClick={()=>stop()}>Close live camera</button>
      </div>
    </div>}
    {live.state!=='Idle'&&<div className="parcel-live-status" role="status"><b>{live.state}</b><p>{localReason(live.reason)}</p><p>Attempted: {live.attempted} · Completed: {live.completed} · Dropped cadence slots: {live.dropped}</p><p>Dropped slots are not parcel observations.</p>{live.sessionId&&<p>Session: <code>{live.sessionId}</code></p>}{live.lastResult&&<p>Frame: <code>{live.lastResult.frameId}</code> · Sequence {live.lastResult.sequence}. Result age: {live.resultAgeMs===null?'not available':`${(live.resultAgeMs/1000).toFixed(1)} seconds (monotonic)`}.</p>}</div>}
    {pending&&<div className="parcel-live-recovery"><p role="status">A saved live session needs reconciliation. Keep its original IDs. Checking never starts replacement inference.</p><dl className="parcel-evidence-details"><div><dt>Original shipment / stage</dt><dd>{pending.shipmentId} / {pending.stage}</dd></div><div><dt>Operation</dt><dd>{pending.operationId}</dd></div><div><dt>Session / blocker</dt><dd>{pending.sessionId??pending.blockedSessionId??'Not yet confirmed'}</dd></div>{pending.frameId&&<div><dt>Frame</dt><dd>{pending.frameId}</dd></div>}</dl><div className="evidence-actions"><button type="button" disabled={busy} onClick={()=>void recover()}>Check saved session</button><button type="button" disabled={busy} onClick={()=>void recover(true)}>Stop saved session</button></div></div>}
    {blocked&&<p role="status">{parcelLiveReasonMessage(blocked.reasonCode)} Blocking session: {blocked.sessionId}.</p>}
    {saved?.session&&saved.session.shipmentId!==shipment.id&&<p>Blocking session binding: <span>{saved.session.shipmentId}</span> / {saved.session.stage} / {saved.session.state}. This session belongs to its recorded shipment.</p>}
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <h5>Recorded live sessions</h5>{loading&&<p role="status">Loading saved live sessions…</p>}{historyError&&<p role="alert" className="error">{historyError}</p>}{historyNotice&&<p role="status">{historyNotice}</p>}
    <nav className="evidence-actions" aria-label="Live session history pages"><button type="button" disabled={loading||!sessionBounds.mayHaveOlder} onClick={()=>pageSessions('older')}>Older sessions</button><button type="button" disabled={loading||!sessionBounds.mayHaveNewer} onClick={()=>pageSessions('newer')}>Newer sessions</button><button type="button" disabled={loading||sessionPage.direction==='latest'&&!historyError} onClick={()=>pageSessions('latest')}>Latest sessions</button></nav>
    {sessions.map(record=><article className="parcel-live-record" key={record.sessionId}>
      {record.model?.evaluationKind==='local-experimental'&&<p className="parcel-review-required">Local experimental session · No operational acceptance.</p>}
      <h5>{record.state}</h5>{record.reasonCode&&<p>{parcelLiveReasonMessage(record.reasonCode)}</p>}<dl className="parcel-evidence-details"><div><dt>Session</dt><dd>{record.sessionId}</dd></div><div><dt>Shipment / recorded stage</dt><dd>{record.shipmentId} / {record.stage}</dd></div><div><dt>Recorded</dt><dd>{recorded(record.createdAt)}</dd></div><div><dt>Reserved / completed</dt><dd>{record.reservedCount} / {record.completedCount}</dd></div></dl>
      <button type="button" onClick={()=>{if(selected===record.sessionId)return;setFrames([]);setSelected(record.sessionId);}}>View saved session</button>
      {(record.actorUid===member.uid||canReview)&&(record.state==='Open'||pending&&['Expired','Stale'].includes(record.state))&&<button type="button" disabled={busy||['Starting','Running'].includes(live.state)&&live.sessionId===record.sessionId} onClick={()=>void closeInterrupted(record)}>Close interrupted request</button>}
    </article>)}
    {[...frameMap.values()].filter(record=>record.sessionId===selected||record.frameId===saved?.frame?.frameId).map(record=><LiveFrame key={`${record.sessionId}:${record.frameId}:${record.version}`} record={record} current={live.current&&live.lastResult?.sessionId===record.sessionId&&live.lastResult?.frameId===record.frameId} canReview={canReview} stillCurrent={stillCurrent} reviewFrame={(frame,input)=>{const adapter=client.current;if(!adapter)return Promise.reject(new Error());return adapter.review(frame,input);}} onReviewed={()=>refresh()}/>)}
  </section>;
}

function LiveFrame({record,current,canReview,stillCurrent,reviewFrame,onReviewed}:{record:ParcelLiveFramePublic;current:boolean;canReview:boolean;stillCurrent:()=>boolean;reviewFrame:(frame:ParcelLiveFramePublic,input:Omit<ParcelLiveReviewInput,'sessionId'|'frameId'|'version'>)=>Promise<ParcelLiveFramePublic>;onReviewed:()=>void}){
  const [url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notes,setNotes]=useState(''),[decision,setDecision]=useState<ParcelLiveReviewDecision>(record.state==='Abstained'?'Reviewed':'Accepted'),[reviewed,setReviewed]=useState<ParcelLiveFramePublic|null>(null);
  const active=useRef(true),objectUrl=useRef(''),pending=useRef(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);};},[]);
  const value=reviewed??record;
  const valid=()=>active.current&&stillCurrent();
  async function view(){
    if(!valid()||pending.current||record.retention!=='Verified'||!record.image)return;
    pending.current=true;setBusy(true);setError('');
    try{
      const object=ref(retainedStorage(),`parcel-live/${record.ownerId}/${record.sessionId}/${record.frameId}`);
      const matchesMetadata=(metadata:Awaited<ReturnType<typeof getMetadata>>)=>metadata.generation===record.image!.generation&&metadata.metageneration===record.image!.metageneration&&metadata.size===record.bytes&&metadata.contentType==='image/jpeg';
      const before=await getMetadata(object);if(!valid())return;if(!matchesMetadata(before))throw new Error();
      const blob=await getBlob(object,record.bytes);
      if(!valid())return;if(blob.type!=='image/jpeg'||blob.size!==record.bytes)throw new Error();
      const buffer=await blob.arrayBuffer();if(!valid())return;
      const digest=await crypto.subtle.digest('SHA-256',buffer);if(!valid())return;
      const sha256=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');if(sha256!==record.sha256)throw new Error();
      const after=await getMetadata(object);if(!valid())return;if(!matchesMetadata(after))throw new Error();
      if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);const next=URL.createObjectURL(blob);if(!valid()){URL.revokeObjectURL(next);return;}objectUrl.current=next;setUrl(next);
    }catch{if(valid())setError('The retained frame could not be opened. Check connection and shared staff access.');}
    finally{pending.current=false;if(active.current)setBusy(false);}
  }
  async function review(){
    if(!canReview||!valid()||pending.current||notes.trim().length<3||notes.length>240||value.retention!=='Verified')return;
    pending.current=true;setBusy(true);setError('');
    try{const result=await reviewFrame(value,{decision,notes});if(valid()){setReviewed(result);onReviewed();}}
    catch{if(valid())setError('Review was not confirmed. Check the saved frame version before trying again.');}
    finally{pending.current=false;if(active.current)setBusy(false);}
  }
  return <article className="parcel-analysis-outcome parcel-live-frame" aria-label="Recorded live frame">
    <h5>{value.state}{value.label!==null?`: ${value.label}`:''}</h5><b className="parcel-live-freshness">{current?'Current':'Historical'}</b><p>{current?'A fresh result from this foreground session.':'Recorded frame only; freshness is not reconstructed after reload or stop.'}</p>
    {value.model.evaluationKind==='local-experimental'&&<p className="parcel-review-required">Local experimental observation · No operational acceptance. Human review cannot approve this model or trigger operational decisions.</p>}
    {value.reasonCode&&<p>{parcelLiveReasonMessage(value.reasonCode)}</p>}
    <dl className="parcel-evidence-details"><div><dt>Session / frame</dt><dd>{value.sessionId} / {value.frameId}</dd></div><div><dt>Shipment / stage / sequence</dt><dd>{value.shipmentId} / {value.stage} / {value.sequence}</dd></div><div><dt>Completed</dt><dd>{recorded(value.completedAt)}</dd></div><div><dt>Retention</dt><dd>{value.retention}</dd></div><div><dt>Client capture declaration</dt><dd>{recorded(Date.parse(value.capturedAtClient))} (unverified device clock)</dd></div></dl>
    {value.retention==='Verified'?<><button type="button" disabled={busy} onClick={()=>void view()}>View retained frame</button>{url&&<div className="parcel-live-image"><img src={url} alt="Retained sampled parcel frame"/><button type="button" onClick={()=>{if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);objectUrl.current='';setUrl('');}}>Close retained frame</button></div>}</>:<p>{value.retention==='Unknown'?'A sample may have been retained, but its exact object identity could not be confirmed.':'No verified retained image identity is available.'} This cannot support human acceptance.</p>}
    <details><summary>Model and frame provenance</summary><p>{value.model.model} · {value.model.preprocessing} · Contrast: {value.model.contrast}</p><dl className="parcel-evidence-details"><div><dt>Image SHA-256</dt><dd>{value.sha256}</dd></div><div><dt>Model version</dt><dd>{value.model.modelVersion}</dd></div><div><dt>Selection SHA-256</dt><dd>{value.model.selectionSha256}</dd></div><div><dt>Evaluation SHA-256</dt><dd>{value.model.evaluationSha256}</dd></div><div><dt>Acceptance SHA-256</dt><dd>{value.model.acceptanceSha256??'No operational acceptance'}</dd></div>{value.model.evaluationKind==='local-experimental'&&<div><dt>Local evaluation manifest SHA-256</dt><dd>{value.model.evaluationManifestSha256}</dd></div>}</dl>{value.probabilities&&<p>Normal score {(value.probabilities[0]*100).toFixed(1)}%; Damaged score {(value.probabilities[1]*100).toFixed(1)}%. Confidence is uncalibrated, not a measured probability of correctness.</p>}</details>
    {value.humanReviewRequired&&<p className="parcel-review-required">Human review required</p>}<p>Review: {value.reviewStatus}</p>{value.reviewNotes&&<p>{value.reviewNotes}</p>}
    {canReview&&value.retention==='Verified'&&value.reviewStatus==='Pending'&&<form className="parcel-analysis-review" onSubmit={event=>{event.preventDefault();void review();}}><label>Review decision<select aria-label="Live frame review decision" value={decision} onChange={event=>setDecision(event.target.value as ParcelLiveReviewDecision)}>{value.state==='Abstained'?<option value="Reviewed">Reviewed</option>:<><option value="Accepted">Accepted</option><option value="Rejected">Rejected</option></>}</select></label><label>Review notes<textarea aria-label="Live frame review notes" minLength={3} maxLength={240} required value={notes} onChange={event=>setNotes(event.target.value)}/></label><button type="submit" disabled={busy||notes.trim().length<3}>Record live frame review</button></form>}
    {error&&<p role="alert" className="error">{error}</p>}
  </article>;
}
