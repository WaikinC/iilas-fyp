import {initializeApp,getApps} from 'firebase/app';
import {connectAuthEmulator,getAuth} from 'firebase/auth';
import {connectFirestoreEmulator,getFirestore} from 'firebase/firestore';
import config from '../firebase-config.json' with {type:'json'};
import {validateProduct,validateShipment,validateWarehouseStep} from './validation.js';
import {getActiveWorkspace,workspaceCommand} from './workspace.js';
import {createStockRetry} from './stockRetry.js';
export const configured=Boolean(config.apiKey&&config.projectId&&config.appId);
const app=configured?(getApps()[0]||initializeApp(config)):null;
export const auth=app?getAuth(app):null;
export const db=app?getFirestore(app):null;
export const projectId=config.projectId;
if(auth&&db&&typeof window!=='undefined'&&['localhost','127.0.0.1'].includes(window.location.hostname)){
  connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
  connectFirestoreEmulator(db,'127.0.0.1',8081);
}
export async function saveRecord(kind,input,existing){
  if(kind==='products')validateProduct(input);else validateShipment(input,100);
  return (await workspaceCommand('save',{kind,data:input,existing:existing?{id:existing.id,version:existing.version}:null})).id;
}
let stockRetryKey,stockRetryClient;
function stockRetry(){
  const member=getActiveWorkspace();
  if(!auth?.currentUser||!member||member.uid!==auth.currentUser.uid)throw new Error('Sign in to the shared system before recording stock.');
  const key=`iilas.stock.${projectId}.${member.workspaceId}.${member.uid}`;
  if(stockRetryKey!==key){stockRetryKey=key;stockRetryClient=createStockRetry(window.sessionStorage,key,workspaceCommand);}
  return stockRetryClient;
}
export const pendingStockMovement=()=>stockRetry().pending();
export const saveStockMovement=input=>stockRetry().submit(input);
export const resolveStockMovement=()=>stockRetry().resolve();
export function deleteRecord(kind,existing){return workspaceCommand('remove',{kind,existing:{id:existing.id,version:existing.version}});}
export function advanceWarehouse(shipmentId,input,expectedVersion=0){validateWarehouseStep(input);return workspaceCommand('warehouse',{shipmentId,data:input,version:expectedVersion});}
