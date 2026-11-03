import {httpsCallable} from 'firebase/functions';
import {functions,sparkTransport,auth} from './firebaseRuntime.js';

let activeWorkspace=null;
export function setActiveWorkspace(workspace){activeWorkspace=workspace;}
export function getActiveWorkspace(){return activeWorkspace;}
export function workspaceCommand(action,input={}){
  if(sparkTransport){if(activeWorkspace&&activeWorkspace.uid!==auth?.currentUser?.uid)throw Error('The active account changed. Keep pending work for its original account.');return sparkTransport.command(action,input);}
  if(!functions)throw new Error('Configure the explicit IILAS demo environment before signing in.');
  return httpsCallable(functions,'command')({action,input}).then(result=>result.data);
}
