package com.iilas.fyp.driverdemo
import org.json.JSONObject
import java.util.UUID

data class TrackingFix(val capturedAtMs:Long,val latitude:Double,val longitude:Double,val accuracy:Double)
data class TrackingPoint(val sampleId:String,val sequence:Long,val capturedAtMs:Long,val latitude:Double,val longitude:Double,val accuracy:Double) {
 fun json():JSONObject=JSONObject().put("sampleId",sampleId).put("sequence",sequence).put("capturedAtMs",capturedAtMs).put("latitude",latitude).put("longitude",longitude).put("accuracy",accuracy)
}
class TrackingState(private val save:(TrackingPoint)->Unit) {
 @Volatile var phase="Stopped";private set
 @Volatile var reason:String?=null;private set
 var shipmentId:String?=null;private set
 var sessionId:String?=null;private set
 var sequence=0L;private set
 var lastCapturedAtMs:Long?=null;private set
 var lease:TrackingLease?=null;private set
 private var lastElapsed:Long?=null
 @Synchronized fun start(shipment:String,session:String,certificate:TrackingLease){
  check(phase!="Tracking");require(shipment.matches(Regex("[A-Za-z0-9_-]{1,128}")) && UUID.fromString(session).toString()==session)
  shipmentId=shipment;sessionId=session;lease=certificate;sequence=0;lastElapsed=null;lastCapturedAtMs=null;reason=null;phase="Tracking"
 }
 @Synchronized fun stop(why:String){reason=why;phase="Stopped"}
 @Synchronized fun refuse(why:String,expired:Boolean=false){reason=why;phase=if(expired)"Expired" else "Needs review"}
 @Synchronized fun renew(certificate:TrackingLease){check(phase=="Tracking");require(certificate.absoluteDeadlineElapsed<=requireNotNull(lease).absoluteDeadlineElapsed);lease=certificate}
 @Synchronized fun observe(fix:TrackingFix,elapsed:Long,wallNowMs:Long):TrackingPoint? {
  if(phase!="Tracking")return null
  val current=requireNotNull(lease)
  if(current.expired(elapsed)){refuse("Lease expired",true);return null}
  if(!current.clockValid(wallNowMs,elapsed)){refuse("Device clock changed");return null}
  if(!fix.latitude.isFinite()||fix.latitude !in -90.0..90.0||!fix.longitude.isFinite()||fix.longitude !in -180.0..180.0||!fix.accuracy.isFinite()||fix.accuracy !in 0.0..100000.0||fix.capturedAtMs<0)return null
  if(fix.capturedAtMs<current.serverNowMs-120000 || fix.capturedAtMs>wallNowMs+120000 || (lastCapturedAtMs!=null&&fix.capturedAtMs<=lastCapturedAtMs!!))return null
  if(fix.capturedAtMs>current.leaseUntilMs){refuse("Capture is outside its lease",true);return null}
  if(lastElapsed!=null&&elapsed-lastElapsed!!<20000)return null
  val point=TrackingPoint(UUID.randomUUID().toString(),sequence+1,fix.capturedAtMs,fix.latitude,fix.longitude,fix.accuracy)
  try{save(point)}catch(_:IllegalStateException){refuse("Storage full");return null}catch(_:Exception){refuse("Could not store the location");return null}
  sequence=point.sequence;lastCapturedAtMs=point.capturedAtMs;lastElapsed=elapsed;return point
 }
}
