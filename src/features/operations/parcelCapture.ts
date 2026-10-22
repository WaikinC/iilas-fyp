/** Owns one camera stream and invalidates late permission responses on stop. */
export class CameraSession {
  private generation = 0;
  private stream: MediaStream | null = null;

  async start(acquire: () => Promise<MediaStream>): Promise<MediaStream | null> {
    this.stop();
    const generation = this.generation;
    let stream: MediaStream;
    try {
      stream = await acquire();
    } catch (error) {
      if (generation !== this.generation) return null;
      throw error;
    }
    if (generation !== this.generation) {
      stream.getTracks().forEach(track => track.stop());
      return null;
    }
    this.stream = stream;
    return stream;
  }

  isCurrent(stream: MediaStream) {
    return this.stream === stream;
  }

  stop() {
    this.generation++;
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach(track => track.stop());
  }
}

export function validateEvidenceFile(file: Pick<File, 'type' | 'size'>, type: string) {
  if (file.size === 0) throw new Error('The selected file is empty.');
  if (file.size > 10 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
    throw new Error('Choose a JPG, PNG, WebP, or PDF up to 10 MB.');
  }
  if (type === 'Parcel Image' && !file.type.startsWith('image/')) {
    throw new Error('Parcel evidence must be an image.');
  }
}

export function captureDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('The camera is not ready. Wait for the preview and try again.');
  }
  const scale = Math.min(1, 1920 / Math.max(width, height));
  return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}

export function captureDeclaration(source: 'file' | 'camera', capturedAtClient?: string) {
  if (source === 'file') return {captureSource: source, capturedAtClient: null};
  if (!capturedAtClient || !Number.isFinite(Date.parse(capturedAtClient))) throw new Error('A camera capture time is required.');
  return {captureSource: source, capturedAtClient};
}

type ComposerMember = {uid: string; workspaceId: string; role: string; status: string; active: boolean; version: number};
type ComposerShipment = {id: string; status?: unknown; version: number; driverUid?: unknown};

/** Changing any authority or shipment context remounts the composer and releases its camera/preview. */
export function evidenceComposerKey(member: ComposerMember, shipment: ComposerShipment, stage: string) {
  return JSON.stringify([member.uid, member.workspaceId, member.role, member.status, member.active, member.version,
    shipment.id, shipment.status, shipment.version, shipment.driverUid, stage]);
}

export function evidenceProvenance(evidence: Record<string, unknown>) {
  return {
    stage: ['Pre-dispatch', 'Delivery'].includes(String(evidence.stage)) ? String(evidence.stage) : 'Stage not recorded',
    source: evidence.captureSource === 'camera' ? 'Camera (declared)' : evidence.captureSource === 'file' ? 'File selection (declared)' : 'Source not recorded',
    capturedAtClient: evidence.captureSource === 'camera' && typeof evidence.capturedAtClient === 'string' && Number.isFinite(Date.parse(evidence.capturedAtClient)) ? evidence.capturedAtClient : null,
  };
}
