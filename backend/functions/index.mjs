import {initializeApp} from 'firebase-admin/app';
import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';

initializeApp();
const researchToken=defineSecret('RESEARCH_API_TOKEN');
export const command = onCall({region:'asia-southeast1', timeoutSeconds:60, memory:'256MiB', maxInstances:10,secrets:process.env.FUNCTIONS_EMULATOR==='true'?[]:[researchToken]}, async request => {
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
