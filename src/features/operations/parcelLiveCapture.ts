import {PARCEL_LIVE_LIMITS} from '../../../lib/parcelLiveSession.js';

export interface ParcelLiveFrameCapture {
  payload: {blob: Blob; width: number; height: number};
  bytes: number;
  /** Unverified device-clock declaration, never a trusted server timestamp. */
  capturedAtClient: string;
}

export function liveFrameDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('Live frame capture failed.');
  }
  const scale = Math.min(1, PARCEL_LIVE_LIMITS.maxLongEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Captures one in-memory frame only; does not save, upload, or own media tracks.
 * The UI must own CameraSession, stop tracks on lifecycle/context changes, and
 * provide a generation/stream predicate. The controller owns single-flight and
 * deadlines. In particular, abort during toBlob must WAIT for its callback so
 * the controller cannot forget an outstanding encoder and start another one.
 */
export async function captureParcelLiveFrame(
  video: HTMLVideoElement,
  {signal, isCurrent}: {signal: AbortSignal; isCurrent: () => boolean},
): Promise<ParcelLiveFrameCapture> {
  let canvas: HTMLCanvasElement | undefined;
  const assertCurrent = () => {
    if (signal.aborted) throw new Error('Live frame capture failed.');
    const current = isCurrent();
    // An external predicate may itself stop or replace the session.
    if (signal.aborted || !current) throw new Error('Live frame capture failed.');
  };
  try {
    assertCurrent();
    if (!(video.readyState >= 2)) throw new Error('Live frame capture failed.');
    const {width, height} = liveFrameDimensions(video.videoWidth, video.videoHeight);
    const capturedAtClient = new Date().toISOString();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(capturedAtClient)) {
      throw new Error('Live frame capture failed.');
    }
    canvas = document.createElement('canvas');
    assertCurrent();
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    assertCurrent();
    if (!context) throw new Error('Live frame capture failed.');
    context.drawImage(video, 0, 0, width, height);
    assertCurrent();
    const encodingCanvas = canvas;
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      try {
        encodingCanvas.toBlob(resolve, 'image/jpeg', 0.8);
      } catch {
        reject(new Error('Live frame capture failed.'));
      }
    });
    assertCurrent();
    if (!(blob instanceof Blob) || blob.type !== 'image/jpeg' || blob.size < 1 || blob.size > PARCEL_LIVE_LIMITS.maxBytes) {
      throw new Error('Live frame capture failed.');
    }
    return {payload: {blob, width, height}, bytes: blob.size, capturedAtClient};
  } catch {
    // Raw browser/predicate exceptions can contain device or contextual details.
    throw new Error('Live frame capture failed.');
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
