export type EvidenceStage = 'Pre-dispatch' | 'Delivery';
export type EvidenceType = 'Parcel Image' | 'Proof of Delivery';
export type EvidenceCaptureSource = 'file' | 'camera';
export interface EvidenceCapture {
  stage: EvidenceStage;
  type: EvidenceType;
  captureSource: EvidenceCaptureSource;
  capturedAtClient: string | null;
}
export function evidenceTypesForStage(stage: string): EvidenceType[];
export function canUploadEvidence(input: {role?: string | null; shipmentStatus?: string; stage: string; actorUid?: string; assignedDriverUid?: string | null}): boolean;
export function validateEvidenceCapture(input: {stage: string; type: string; captureSource: string; capturedAtClient?: string | null}, nowMs?: number): EvidenceCapture;
