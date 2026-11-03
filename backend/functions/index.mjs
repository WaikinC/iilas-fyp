import {initializeApp} from 'firebase-admin/app';
import {onCall,onRequest, HttpsError} from 'firebase-functions/v2/https';
import {customerEvidenceHandler} from './customerEvidence.mjs';
import {defineSecret} from 'firebase-functions/params';

initializeApp();
export const customerEvidence=onRequest({region:process.env.IILAS_FUNCTIONS_REGION||'asia-southeast1',...(process.env.IILAS_DEMO_MODE==='cloud-demo'?{serviceAccount:process.env.IILAS_PROOF_SERVICE_ACCOUNT}:{}),timeoutSeconds:30,memory:'256MiB',maxInstances:2,concurrency:1,minInstances:0,cors:false},customerEvidenceHandler);
const researchToken=defineSecret('RESEARCH_API_TOKEN');
const gatewaySecret=defineSecret('IILAS_GATEWAY_SECRET');
export const command = onCall({region:process.env.IILAS_FUNCTIONS_REGION||'asia-southeast1',...(process.env.IILAS_DEMO_MODE==='cloud-demo'?{serviceAccount:process.env.IILAS_RUNTIME_SERVICE_ACCOUNT}:{}), timeoutSeconds:60, memory:'256MiB', maxInstances:process.env.IILAS_DEMO_MODE==='cloud-demo'?2:10,concurrency:1,minInstances:0,secrets:process.env.FUNCTIONS_EMULATOR==='true'?[]:process.env.IILAS_DEMO_MODE==='cloud-demo'?[gatewaySecret]:[researchToken]}, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  try { const {executeCommand}=await import('./service.mjs'); return await executeCommand(request.auth, request.data); }
  catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error.code === 'permission-denied') throw new HttpsError('permission-denied', error.message);
    if (error.code === 'not-found') throw new HttpsError('not-found', error.message);
    if (error.code === 'unavailable') throw new HttpsError('unavailable', error.message);
    throw new HttpsError('failed-precondition', error.message || 'The operation could not be completed.', error.stockRequestNotApplied?{stockRequestNotApplied:true}:undefined);
  }
});
