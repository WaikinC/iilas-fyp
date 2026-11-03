import {useEffect} from 'react';
import {MapContainer,Marker,Popup,TileLayer,useMap} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {recordedLocation,type DeliveryRow} from './deliveryPresentation';
function SizeOnReveal(){const map=useMap();useEffect(()=>{map.invalidateSize();},[map]);return null;}
export default function LatestLocationMap({location}:{location:DeliveryRow}){
 const point=recordedLocation(location);if(!point)return <p>No valid recorded location is available.</p>;
 const date=point.submittedAt&&typeof point.submittedAt==='object'&&'seconds' in point.submittedAt?new Date(Number(point.submittedAt.seconds)*1000).toLocaleString():'Time unavailable';
 return <><p>Latest submitted location: {date} · accuracy {point.accuracy===null?'unavailable':`${point.accuracy} m`}. This is a recorded point.</p><MapContainer key={`${point.latitude}-${point.longitude}`} center={[point.latitude,point.longitude]} zoom={14} className="delivery-map"><SizeOnReveal/><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><Marker position={[point.latitude,point.longitude]} icon={L.divIcon({className:'location-marker',html:'●',iconSize:[20,20]})}><Popup>Latest submitted location</Popup></Marker></MapContainer></>;
}
