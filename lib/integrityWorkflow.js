import {completionExact,completionUUID,completionIdentifier} from './completionWorkflow.js';
export const INTEGRITY_PROTOCOL='iilas-integrity-observation-1.0';
export function validateIntegrityInput(value,submitted=false){
 const input=completionExact(value,['operationId','kind','recordId',...(submitted?['transactionHash']:[])]);
 completionUUID(input.operationId);completionIdentifier(input.recordId);
 if(!['inventory','delivery'].includes(input.kind))throw Error('Choose inventory or delivery integrity.');
 if(submitted&&(typeof input.transactionHash!=='string'||!/^0x[0-9a-f]{64}$/.test(input.transactionHash)))throw Error('A canonical transaction hash is required.');
 return input;
}
export function validateIntegrityReview(value){
 const input=completionExact(value,['operationId','exceptionId','expectedReviewVersion','decision','notes']);completionUUID(input.operationId);completionIdentifier(input.exceptionId);
 if(!Number.isSafeInteger(input.expectedReviewVersion)||input.expectedReviewVersion<0||input.expectedReviewVersion>1000000)throw Error('A valid review version is required.');
 if(!['Acknowledge','NeedsFollowUp'].includes(input.decision)||typeof input.notes!=='string'||input.notes.trim().length<3||input.notes.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.notes))throw Error('Choose a review decision and notes of 3 to 500 characters.');
 return input;
}
