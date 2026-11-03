import {auth,projectId,sessionRecoveryStorage,demoEnvironment} from './firebaseRuntime.js';
export {auth,db,projectId,configured,demoEnvironment} from './firebaseRuntime.js';
import {validateProduct,validateShipment,validateWarehouseStep} from './validation.js';
import {getActiveWorkspace,workspaceCommand} from './workspace.js';
import {createStockRetry} from './stockRetry.js';
export async function saveRecord(kind,input,existing){
  if(!existing?.id)throw Error('Use the new automatic-code creation form. Refresh this page.');
  if(kind==='products')validateProduct(input);else validateShipment(input,100);
  return (await workspaceCommand('save',{kind,data:input,existing:existing?{id:existing.id,version:existing.version}:null})).id;
}
let stockRetryKey,stockRetryClient;
function stockRetry(){
  const member=getActiveWorkspace();
  if(!auth?.currentUser||!member||member.uid!==auth.currentUser.uid)throw new Error('Sign in to the shared system before recording stock.');
  const key=`iilas.stock.${projectId}.${member.workspaceId}.${member.uid}`;
  if(stockRetryKey!==key){stockRetryKey=key;stockRetryClient=createStockRetry(['spark-msi','spark-loopback-test'].includes(demoEnvironment.mode)?sessionRecoveryStorage:window.sessionStorage,key,workspaceCommand);}
  return stockRetryClient;
}
export const pendingStockMovement=()=>stockRetry().pending();
export const saveStockMovement=input=>stockRetry().submit(input);
export const resolveStockMovement=()=>stockRetry().resolve();
export function deleteRecord(kind,existing){return workspaceCommand('remove',{kind,existing:{id:existing.id,version:existing.version}});}
export function advanceWarehouse(shipmentId,input,expectedVersion=0){validateWarehouseStep(input);return workspaceCommand('warehouse',{shipmentId,data:input,version:expectedVersion});}
