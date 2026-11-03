package com.iilas.fyp.driverdemo
import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class LocationTrackingService:Service() {
 private val handler=Handler(Looper.getMainLooper())
 private var runtime:MobileRuntime?=null
 private var owner:MobileContext?=null
 private var source:LocationSource?=null
 private var state:TrackingState?=null
 private var hook:((String?,String)->Unit)?=null
 @Volatile private var active=false
 @Volatile private var epoch=0L
 private var serviceStartId=0
 private var startOperationId=""
 private var pendingRenew:String?=null
 private var renewStartedElapsed=0L
 private var lastMaintenance=0L
 override fun onBind(intent:Intent?):IBinder?=null
 private fun notification(text:String):Notification {
  val manager=getSystemService(NOTIFICATION_SERVICE) as NotificationManager
  if(android.os.Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(NotificationChannel(CHANNEL,"IILAS delivery tracking",NotificationManager.IMPORTANCE_LOW))
  val stop=PendingIntent.getService(this,71,Intent(this,LocationTrackingService::class.java).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  return NotificationCompat.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_tracking).setContentTitle("IILAS driver tracking").setContentText(text.take(180)).setOngoing(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).addAction(0,"Stop",stop).build()
 }
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
  serviceStartId=startId
  if(intent?.action==STOP){val app=runtime;app?.stopTrackingImmediately(null,"Stopped by user");stopLocal("Stopped by user");if(app!=null)app.executor.execute{try{MobileTrackingController(app).stop()}catch(_:Exception){}};return START_NOT_STICKY}
  if(intent?.action!=START || !BuildConfig.DEBUG){stopSelf(startId);return START_NOT_STICKY}
  if(active)return START_NOT_STICKY
  val operation=intent.getStringExtra("operationId")?:run{stopSelf(startId);return START_NOT_STICKY}
  val started=intent.getLongExtra("requestStartedElapsed",-1)
  try{require(UUID.fromString(operation).toString()==operation && started>=0);ServiceCompat.startForeground(this,NOTIFICATION,notification("Authorising delivery tracking"),if(android.os.Build.VERSION.SDK_INT>=29)ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0)}catch(_:Exception){stopSelf(startId);return START_NOT_STICKY}
  active=true;epoch++;val generation=epoch;startOperationId=operation
  val app=MobileRuntime.get(this);runtime=app
  app.executor.execute {
   try{
    val context=app.context();owner=context;val row=requireNotNull(app.database.dao().operation(operation));require(row.partition==context.partition && row.action=="tracking.start" && row.state=="Synced")
    val result=JSONObject(requireNotNull(row.resultJson));MobileWire.validate(context,row,result);val data=result.getJSONObject("data")
    val lease=TrackingLease.accept(data.getLong("serverNowMs"),data.getLong("leaseUntilMs"),data.getLong("absoluteUntilMs"),SystemClock.elapsedRealtime(),started,System.currentTimeMillis())
    check(!app.repository.hasQueuedTerminal(context,row.shipmentId)){"Delivery is closing"}
    val admission=JSONObject(requireNotNull(app.database.dao().tracking(context.partition)).json)
    check(admission.optString("startOperationId")==operation && admission.optString("phase")=="Starting"){"Start was stopped or superseded"}
    val admissionTicket=admission.getLong("admissionGeneration")
    val tracker=TrackingState { point->
     app.repository.requireOwner(context)
     val payload=JSONObject().put("sessionId",data.getString("sessionId")).put("points",JSONArray().put(point.json())).toString()
     app.repository.queue(context,row.shipmentId,MobileRequest(UUID.randomUUID().toString(),"tracking.points",payload),emptyList())
    }
    tracker.start(row.shipmentId,data.getString("sessionId"),lease);state=tracker
    if(!active||epoch!=generation)return@execute
    val installed=app.trackingAdmission.install(admissionTicket){
     check(active && epoch==generation){"Start was cancelled"}
     val stopper:(String?,String)->Unit={affected,reason->if(affected==null||affected==row.shipmentId)stopLocal(reason)};hook=stopper;app.stopTrackingHook=stopper
     val locations=LocationSource(this);source=locations
     locations.start({fix->app.executor.execute{if(active&&epoch==generation){MobileTrackingPublication.observed(tracker,{tracker.observe(fix,SystemClock.elapsedRealtime(),System.currentTimeMillis())},{persist()},{stopLocal(it,preservePhase=true)},{app.coordinator.requestDrain(context)})}}},{stopLocal("Permission or location service removed")})
    }
    check(installed){"Start was stopped before service installation"}
    persist();(getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIFICATION,notification("Tracking ${row.shipmentId} - Stop to end"));handler.post(tick)
   }catch(_:Exception){state?.refuse("Tracking could not start");stopLocal("Tracking could not start",preservePhase=true)}
  }
  return START_NOT_STICKY
 }
 private val tick=object:Runnable {override fun run(){
  if(!active)return
  val tracker=state;val app=runtime;val context=owner
  if(tracker==null||app==null||context==null){handler.postDelayed(this,1000);return}
  if(app.identity.uid()!=context.uid){stopLocal("Signed out");return}
  if(source?.permitted()!=true){stopLocal("Permission removed");return}
  if(tracker.lease?.expired(SystemClock.elapsedRealtime())!=false){tracker.refuse("Lease expired",true);stopLocal("Lease expired",preservePhase=true);return}
  if(SystemClock.elapsedRealtime()-lastMaintenance>=60000){lastMaintenance=SystemClock.elapsedRealtime();val generation=epoch;app.executor.execute{if(active&&epoch==generation)maintenance(app,context,tracker)}}
  handler.postDelayed(this,1000)
 }}
 private fun maintenance(app:MobileRuntime,context:MobileContext,tracker:TrackingState){
  try{
   val pending=pendingRenew
   if(pending!=null){val row=requireNotNull(app.database.dao().operation(pending));if(row.state=="Synced"){
    val result=JSONObject(requireNotNull(row.resultJson));MobileWire.validate(context,row,result);val data=result.getJSONObject("data");val next=requireNotNull(tracker.lease).renew(data.getLong("serverNowMs"),data.getLong("leaseUntilMs"),data.getLong("absoluteUntilMs"),SystemClock.elapsedRealtime(),renewStartedElapsed,System.currentTimeMillis());tracker.renew(next);pendingRenew=null;persist()
   }else if(row.state=="Needs review"){stopLocal("Tracking renewal refused");return}}
   if(pendingRenew==null && tracker.lease?.needsRenew(SystemClock.elapsedRealtime())==true){
    val request=MobileRequest(UUID.randomUUID().toString(),"tracking.renew",JSONObject().put("sessionId",tracker.sessionId).toString());app.repository.queue(context,requireNotNull(tracker.shipmentId),request,emptyList());renewStartedElapsed=SystemClock.elapsedRealtime();pendingRenew=request.operationId;app.coordinator.requestDrain(context)
   }
   MobileSyncEngine(app.repository,app.transport,authorityLost={app.authorityLost(it)}){active}.drain(context)
  }catch(_:Exception){if(tracker.lease?.expired(SystemClock.elapsedRealtime())!=false)stopLocal("Lease expired")}
 }
 private fun persist(){
  val app=runtime?:return;val context=owner?:return;val tracker=state?:return
  val previous=app.database.dao().tracking(context.partition)?.let{JSONObject(it.json)}?:JSONObject()
  previous.put("phase",tracker.phase).put("reason",tracker.reason?:JSONObject.NULL).put("shipmentId",tracker.shipmentId).put("sessionId",tracker.sessionId).put("sequence",tracker.sequence).put("lastCapturedAtMs",tracker.lastCapturedAtMs?:JSONObject.NULL).put("startOperationId",startOperationId).put("leaseUntilMs",tracker.lease?.leaseUntilMs?:JSONObject.NULL)
  app.repository.publishTracking(context,startOperationId,previous.toString())
 }
 private fun stopLocal(reason:String,preservePhase:Boolean=false){
  if(!active){stopForeground(STOP_FOREGROUND_REMOVE);stopSelf(serviceStartId);return}
  active=false;epoch++;handler.removeCallbacks(tick);source?.stop();source=null
  if(!preservePhase)state?.stop(reason)
  val app=runtime;val context=owner
  if(app!=null && context!=null)app.trackingNotice=MobileTrackingNotice(context.partition,startOperationId,state?.phase?:"Stopped",state?.reason?:reason)
  if(app!=null&&app.stopTrackingHook===hook)app.stopTrackingHook=null
  stopForeground(STOP_FOREGROUND_REMOVE);stopSelf(serviceStartId)
  val originalStart=startOperationId
  if(app!=null&&context!=null)app.executor.execute{try{persist()}catch(_:Exception){};try{if(app.identity.uid()==context.uid)MobileTrackingController(app).stopRemote(context,originalStart)}catch(_:Exception){}}
 }
 override fun onDestroy(){stopLocal("App stopped");super.onDestroy()}
 companion object {const val START="com.iilas.fyp.driverdemo.START_TRACKING";const val STOP="com.iilas.fyp.driverdemo.STOP_TRACKING";private const val CHANNEL="iilas-delivery-tracking";private const val NOTIFICATION=701}
}
