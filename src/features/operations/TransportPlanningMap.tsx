import {useEffect} from 'react';
import {MapContainer,Marker,Polyline,Popup,TileLayer,useMap} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type {PlanningInputs} from '../../../lib/transportPlanning';
function Bounds({inputs}:{inputs:PlanningInputs}){const map=useMap();useEffect(()=>{map.fitBounds([[inputs.origin.latitude,inputs.origin.longitude],[inputs.destination.latitude,inputs.destination.longitude]],{padding:[20,20],maxZoom:12,animate:false});},[map,inputs]);return null;}
export default function TransportPlanningMap({inputs}:{inputs:PlanningInputs}){
 const a:[number,number]=[inputs.origin.latitude,inputs.origin.longitude],b:[number,number]=[inputs.destination.latitude,inputs.destination.longitude];
 return <MapContainer center={a} zoom={10} className="transport-planning-map" scrollWheelZoom={false} zoomAnimation={false} fadeAnimation={false} markerZoomAnimation={false}><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><Bounds inputs={inputs}/><Marker position={a} icon={L.divIcon({className:'location-marker',html:'O',iconSize:[24,24]})}><Popup>Entered origin</Popup></Marker><Marker position={b} icon={L.divIcon({className:'location-marker',html:'D',iconSize:[24,24]})}><Popup>Entered destination</Popup></Marker><Polyline positions={[a,b]} pathOptions={{color:'#6d28d9',dashArray:'6 6'}}/></MapContainer>;
}
