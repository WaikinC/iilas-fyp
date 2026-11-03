package com.iilas.fyp.driverdemo
import android.os.SystemClock
import org.json.JSONObject
import java.util.UUID

class MobileTrackingController(private val runtime:MobileRuntime) {
 private val repo=runtime.repository
 private fun raw(context:MobileContext):JSONObject=runtime.database.dao().tracking(context.partition)?.let{JSONObject(it.json)}?:JSONObject().put("phase","Stopped").put("reason",JSONObject.NULL)
 private fun save(context:MobileContext,value:JSONObject){repo.requireOwner(context);runtime.database.dao().saveTracking(MobileTrackingRow(context.partition,value.toString()))}
 fun read():Map<String,Any?> {
  val context=runtime.context();repo.requireOwner(context);val value=raw(context);val notice=runtime.trackingNotice?.takeIf{it.partition==context.partition && it.startOperationId==value.optString("startOperationId")};val phase=notice?.phase?:value.optString("phase","Stopped")
  val interrupted=phase=="Tracking"&&runtime.stopTrackingHook==null
  return mapOf("phase" to if(interrupted)"Stopped" else phase,"reason" to if(interrupted)"App restarted; deliberate Start is required" else notice?.reason?:value.opt("reason").takeUnless{it==JSONObject.NULL},"shipmentId" to value.opt("shipmentId").takeUnless{it==JSONObject.NULL},"sessionId" to value.opt("sessionId").takeUnless{it==JSONObject.NULL},"lastCapturedAtMs" to value.opt("lastCapturedAtMs").takeUnless{it==JSONObject.NULL},"accuracy" to value.opt("accuracy").takeUnless{it==JSONObject.NULL},"sequence" to value.optLong("sequence",0),"leaseUntilMs" to value.opt("leaseUntilMs").takeUnless{it==JSONObject.NULL})
 }
 fun stop(reason:String="Stopped by user"):Map<String,Any?> {
  runtime.stopTrackingImmediately(null,reason)
  val context=runtime.context();val value=raw(context);value.put("phase","Stopped").put("reason",reason);save(context,value)
  queueStop(context,value);return read()
 }
 private fun queueStop(context:MobileContext,value:JSONObject){
  runtime.database.runInTransaction {
  val fresh=raw(context)
  val startId=value.optString("startOperationId","");if(startId.isEmpty())return@runInTransaction
  val start=runtime.database.dao().operation(startId)?:return@runInTransaction
  if(start.partition!=context.partition)return@runInTransaction
  if(start.state=="Queued"&&!start.sentOnce){repo.discardUnsent(context,startId);return@runInTransaction}
  if(start.state!="Synced")return@runInTransaction
  val result=JSONObject(requireNotNull(start.resultJson));MobileWire.validate(context,start,result);val session=result.getJSONObject("data").getString("sessionId")
  val stopId=mobileDerivedUUID("tracking.stop:${context.partition}:$startId")
  val request=MobileRequest(stopId,"tracking.stop",JSONObject().put("sessionId",session).toString())
  repo.queue(context,start.shipmentId,request,emptyList());value.put("stopOperationId",stopId).put("sessionId",session);if(fresh.optString("startOperationId")==startId){fresh.put("stopOperationId",stopId).put("sessionId",session);save(context,fresh)}
  }
  runtime.coordinator.requestDrain(context)
 }
 fun stopRemote(context:MobileContext,originalStartId:String){queueStop(context,JSONObject().put("startOperationId",originalStartId))}
 fun start(shipmentId:String,visible:()->Boolean,launch:(String,Long)->Unit):Map<String,Any?> {
  require(visible()){ "Open the app before starting tracking" };val admissionTicket=runtime.trackingAdmission.ticket()
  val context=runtime.context();repo.requireOwner(context);check(!repo.hasQueuedTerminal(context,shipmentId)){"Delivery is closing"}
  val access=runtime.identity.command("getMobileAccessContext",emptyMap(),context.uid)
  require(access["uid"]==context.uid && access["scope"]==context.scope && access["mode"]=="Driver" && access["role"]=="Driver")
  var value=raw(context)
  check(runtime.stopTrackingHook==null){"Stop the active tracking session first"}
  if(value.optString("phase")=="Starting" && value.optString("shipmentId")==shipmentId){
   // An explicit second press can recover the original pending admission;
   // it never silently allocates another Start identity.
  }else{
   if(value.has("startOperationId")){queueStop(context,value);drain(context);val stop=value.optString("stopOperationId","");if(stop.isNotEmpty()){val row=runtime.database.dao().operation(stop);check(row?.state=="Synced" || row?.resultJson?.let{JSONObject(it).optString("reason") in setOf("assignment_changed","delivery_closed")}==true){"Synchronise the previous stop first"}}else{val old=runtime.database.dao().operation(value.optString("startOperationId"));check(old?.state in setOf("Discarded","Needs review")){"Reconcile the previous tracking request first"}}}
   val request=MobileRequest(UUID.randomUUID().toString(),"tracking.start",JSONObject().put("shipmentId",shipmentId).put("installationId",context.installationId).toString())
   repo.queue(context,shipmentId,request,emptyList());value=JSONObject().put("phase","Starting").put("reason",JSONObject.NULL).put("shipmentId",shipmentId).put("startOperationId",request.operationId).put("requestStartedElapsed",SystemClock.elapsedRealtime());save(context,value)
  }
  value.put("admissionGeneration",admissionTicket);save(context,value)
  drain(context)
  val row=requireNotNull(runtime.database.dao().operation(value.getString("startOperationId")))
  if(row.state!="Synced"){
   if(row.state=="Needs review")value.put("phase","Needs review").put("reason",row.lastError?:"Tracking admission refused")
   save(context,value);runtime.coordinator.requestDrain(context);return read()
  }
  val result=JSONObject(requireNotNull(row.resultJson));MobileWire.validate(context,row,result);val data=result.getJSONObject("data");val started=value.getLong("requestStartedElapsed")
  try{TrackingLease.accept(data.getLong("serverNowMs"),data.getLong("leaseUntilMs"),data.getLong("absoluteUntilMs"),SystemClock.elapsedRealtime(),started,System.currentTimeMillis())}catch(_:IllegalArgumentException){value.put("phase","Needs review").put("reason","Tracking admission expired; synchronise Stop and start again");save(context,value);queueStop(context,value);return read()}
  if(!visible()||runtime.trackingAdmission.ticket()!=admissionTicket){value.put("phase","Stopped").put("reason","Return to the app and deliberately Start");save(context,value);queueStop(context,value);return read()}
  repo.requireOwner(context);launch(row.operationId,started);return read()
 }
 private fun drain(context:MobileContext){MobileSyncEngine(repo,runtime.transport,authorityLost={runtime.authorityLost(it)}).drain(context)}
}
