import {getFunctions, httpsCallable, connectFunctionsEmulator} from 'firebase/functions';
import {getApp} from 'firebase/app';

let activeWorkspace=null;
let functions;
export function setActiveWorkspace(workspace){activeWorkspace=workspace;}
export function getActiveWorkspace(){return activeWorkspace;}
export function workspaceCommand(action,input={}){
  if(!functions){
    functions=getFunctions(getApp(),'asia-southeast1');
    if(typeof window!=='undefined'&&['localhost','127.0.0.1'].includes(window.location.hostname))connectFunctionsEmulator(functions,'127.0.0.1',5001);
  }
  return httpsCallable(functions,'command')({action,input}).then(result=>result.data);
}
