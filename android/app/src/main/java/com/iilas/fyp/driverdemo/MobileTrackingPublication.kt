package com.iilas.fyp.driverdemo
data class MobileTrackingNotice(val partition:String,val startOperationId:String,val phase:String,val reason:String?)
object MobileTrackingPublication {
 fun observed(state:TrackingState,observe:()->Unit,persist:()->Unit,stop:(String)->Unit,drain:()->Unit){
  try {
   observe()
   if(state.phase!="Tracking"){stop(state.reason?:"Tracking stopped");try{persist()}catch(_:Exception){};return}
   try{persist()}catch(_:Exception){state.refuse("Local tracking state could not be stored");stop(state.reason!!);return}
   try{drain()}catch(_:Exception){state.refuse("Local synchronisation could not be scheduled");stop(state.reason!!)}
  }catch(_:Exception){state.refuse("Local tracking storage failed");stop(state.reason!!)}
 }
}
