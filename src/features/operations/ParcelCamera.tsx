import {useEffect, useRef, useState} from 'react';
import {CameraSession, captureDimensions} from './parcelCapture';

function cameraError(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was denied. Allow camera access in your browser or choose a photo file.';
  if (name === 'NotFoundError') return 'No camera was found. Connect a camera or choose a photo file.';
  if (name === 'NotReadableError') return 'The camera could not start. Close other apps using it and try again, or choose a photo file.';
  return error instanceof Error ? error.message : 'Unable to start the camera. Choose a photo file instead.';
}

export default function ParcelCamera({onCapture, onClose}: {onCapture: (file: File, capturedAtClient: string) => void; onClose: () => void}) {
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<CameraSession | null>(null);
  const capturing = useRef(false);
  const [status, setStatus] = useState('Starting camera…');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const owner = new CameraSession();
    session.current = owner;
    const element = video.current;
    let active = true;
    const stop = () => {
      owner.stop();
      if (element) element.srcObject = null;
    };
    const interrupted = () => {
      stop();
      if (active) {
        setReady(false);
        setBusy(false);
        setStatus('Camera stopped. Close this preview and start again when ready.');
      }
    };
    const visibility = () => { if (document.hidden) interrupted(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', interrupted);
    void (async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access needs a supported browser on HTTPS or localhost. You can still choose a photo file.');
        }
        const stream = await owner.start(() => navigator.mediaDevices.getUserMedia({
          audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}},
        }));
        if (!stream || !active || !element) return;
        stream.getTracks().forEach(track => track.addEventListener('ended', interrupted, {once: true}));
        element.srcObject = stream;
        await element.play();
        if (!active || !owner.isCurrent(stream)) return;
        setReady(true);
        setStatus('Camera preview only. Capture a photo when the parcel is in view.');
      } catch (cause) {
        stop();
        if (active) {
          setError(cameraError(cause));
          setStatus('Camera unavailable.');
        }
      }
    })();
    return () => {
      active = false;
      stop();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', interrupted);
    };
  }, []);

  async function capture() {
    const element = video.current, owner = session.current;
    const stream = element?.srcObject as MediaStream | null;
    if (!ready || capturing.current || !element || !owner || !stream || !owner.isCurrent(stream)) return;
    capturing.current = true;
    setBusy(true);
    setError('');
    try {
      const {width, height} = captureDimensions(element.videoWidth, element.videoHeight);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to capture this frame. Choose a photo file instead.');
      const capturedAtClient = new Date().toISOString();
      context.drawImage(element, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        value => value ? resolve(value) : reject(new Error('Unable to encode this photo. Try again.')), 'image/jpeg', 0.92,
      ));
      if (!owner.isCurrent(stream)) return;
      owner.stop();
      element.srcObject = null;
      onCapture(new File([blob], `parcel-camera-${Date.now()}.jpg`, {type: 'image/jpeg'}), capturedAtClient);
    } catch (cause) {
      if (owner.isCurrent(stream)) setError(cameraError(cause));
    } finally {
      capturing.current = false;
      if (owner.isCurrent(stream)) setBusy(false);
    }
  }

  return <section className="parcel-camera" aria-label="Parcel camera">
    <p role="status">{status}</p>
    <video ref={video} muted playsInline aria-label="Parcel camera preview" />
    {error && <p role="alert" className="error">{error}</p>}
    <div className="evidence-actions">
      <button type="button" className="primary navy" disabled={!ready || busy} onClick={capture}>{busy ? 'Capturing…' : 'Capture photo'}</button>
      <button type="button" onClick={onClose}>Close camera</button>
    </div>
  </section>;
}
