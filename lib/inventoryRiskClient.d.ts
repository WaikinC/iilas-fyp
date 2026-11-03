import type {CaptureInput,CaptureResult,ReviewInput,ReviewResult} from './inventoryRisk';
export function createInventoryRiskClient(options:{storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>;context:{uid:string;scope:string};isCurrent:()=>boolean;command:(action:string,input:CaptureInput|ReviewInput)=>Promise<unknown>}):{
pendingCapture:()=>CaptureInput|null;capture:(input:Omit<CaptureInput,'operationId'>)=>Promise<CaptureResult>;resolveCapture:()=>Promise<CaptureResult>;
pendingReview:()=>ReviewInput|null;review:(input:Omit<ReviewInput,'operationId'>)=>Promise<ReviewResult>;retryReview:()=>Promise<ReviewResult>;resolveReview:()=>Promise<ReviewResult>;
};
