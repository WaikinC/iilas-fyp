import {useEffect,useState} from 'react';
import type {MobileClient} from '../../../lib/mobilePlatformClient.js';
import MobileDriverShell from './MobileDriverShell';
import './mobile.css';
export default function MobileBootstrap(){
 const [client,setClient]=useState<MobileClient|null>(null);const [error,setError]=useState('');
 useEffect(()=>{let active=true;void import('./mobilePlatform').then(({createAndroidClient})=>{const value=createAndroidClient();if(active)setClient(value);}).catch(()=>{if(active)setError('Open this build in the local IILAS Android app. Staff and customers can use the existing web application.');});return()=>{active=false;};},[]);
 if(client)return <MobileDriverShell client={client}/>;
 return <main className="mobile-driver mobile-gate"><h1>IILAS Driver</h1><p role={error?'alert':'status'}>{error||'Checking the local Android connection…'}</p></main>;
}
