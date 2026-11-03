package com.iilas.fyp.driverdemo
import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import androidx.core.content.ContextCompat

class LocationSource(private val context:Context) {
 private val manager=context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
 private var listener:LocationListener?=null
 fun permitted():Boolean=ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED || ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED
 @android.annotation.SuppressLint("MissingPermission") fun start(onFix:(TrackingFix)->Unit,onUnavailable:()->Unit){
  check(listener==null);check(permitted())
  val observer=object:LocationListener {
   override fun onLocationChanged(location:Location){if(!permitted()){onUnavailable();return};if(location.hasAccuracy())onFix(TrackingFix(location.time,location.latitude,location.longitude,location.accuracy.toDouble()))}
   override fun onProviderDisabled(provider:String){if(!permitted()||manager.getProviders(true).none{it in listOf(LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER)})onUnavailable()}
   override fun onProviderEnabled(provider:String){}
   @Deprecated("Deprecated in Java") override fun onStatusChanged(provider:String?,status:Int,extras:Bundle?){}
  }
  listener=observer;var providers=0
  try{for(provider in listOf(LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER)){
   if(provider==LocationManager.GPS_PROVIDER && ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)continue
   if(manager.allProviders.contains(provider)&&manager.isProviderEnabled(provider)){manager.requestLocationUpdates(provider,20000L,0f,observer,Looper.getMainLooper());providers++}
  };check(providers>0){"Enable Android location services"}}catch(error:Exception){stop();throw error}
 }
 fun stop(){val observer=listener;listener=null;if(observer!=null)try{manager.removeUpdates(observer)}catch(_:SecurityException){}}
}
