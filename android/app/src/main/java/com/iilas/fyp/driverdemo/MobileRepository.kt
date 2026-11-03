package com.iilas.fyp.driverdemo
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class MobileRepository(val database:MobileDatabase,private val currentUid:()->String?,private val processId:String=UUID.randomUUID().toString(),private val clock:()->Long=System::currentTimeMillis,private val destination:()->String?={null}) {
 private val dao=database.dao()
 fun requireOwner(context:MobileContext){require(currentUid()==context.uid && context.destination==destination()){"Account or backend changed; original pending data remains quarantined"}}
 private fun rows(context:MobileContext):List<MobileQueueRow>{requireOwner(context);return dao.queue(context.partition)}
 private fun dependencies(row:MobileQueueRow):List<String>{val a=JSONArray(row.dependenciesJson);return (0 until a.length()).map { a.getString(it) }}
 private fun recover(context:MobileContext){val lease=dao.lease(context.partition);if(lease==null||lease.processId!=processId||lease.untilElapsed<=SystemClock.elapsedRealtime()){dao.recoverSending(context.partition);if(lease!=null)dao.releaseLease(context.partition,lease.owner)}}
 fun cacheAssignments(context:MobileContext,shipments:List<String>,verifiedAtMs:Long){requireOwner(context);require(shipments.size<=20 && verifiedAtMs>=0);database.runInTransaction{for(json in shipments){require(json.toByteArray().size<=16384);val id=JSONObject(json).getString("id");require(id.matches(Regex("[A-Za-z0-9_-]{1,128}")));MobileQuotaPolicy.requireFits(managedBytes(context),json.toByteArray().size.toLong());dao.saveCache(MobileCache(context.partition,id,json,verifiedAtMs))}}}
 fun readAssignments(context:MobileContext):List<MobileCache>{requireOwner(context);return dao.cache(context.partition)}
 fun managedBytes(context:MobileContext):Long {requireOwner(context);return dao.queueStorage()+dao.cacheStorage()+dao.fileStorage()}
 fun queue(context:MobileContext,shipmentId:String,request:MobileRequest,dependencies:List<String>,fileId:String?=null):MobileQueueRow {
  requireOwner(context);require(shipmentId.matches(Regex("[A-Za-z0-9_-]{1,128}")) && dependencies.size<=25 && dependencies.distinct().size==dependencies.size)
  return database.runInTransaction<MobileQueueRow>{
   requireOwner(context);val old=dao.operation(request.operationId)
   if(old!=null){require(old.partition==context.partition && old.shipmentId==shipmentId && old.action==request.action && old.payloadJson==request.payloadJson && old.dependenciesJson==JSONArray(dependencies).toString() && old.fileId==fileId){"An immutable request cannot change"};return@runInTransaction old}
   val pointCount=if(request.action=="tracking.points")JSONObject(request.payloadJson).getJSONArray("points").length() else 0
   if(request.action=="tracking.points"){require(pointCount in 1..25);check(dao.pendingPoints()+pointCount<=2000){"GPS queue full"}}
   else check(dao.pendingActions()<200){"Action queue full"}
   dependencies.forEach{dep->val row=dao.operation(dep);require(row?.partition==context.partition && row.shipmentId==shipmentId){"Missing original dependency"}}
   if(fileId!=null)require(dao.file(context.partition,fileId)!=null){"An original-account copied file is required"}
   MobileQuotaPolicy.requireFits(managedBytes(context),request.payloadJson.toByteArray().size.toLong()+512)
   val sequence=dao.lastSequence(context.partition)+1
   val row=MobileQueueRow(request.operationId,context.partition,shipmentId,sequence,request.action,request.payloadJson,request.requestSha256,JSONArray(dependencies).toString(),"Queued",clock(),fileId=fileId,pointCount=pointCount,destination=context.destination?:"legacy")
   dao.insert(row);row
  }
 }
 fun readQueue(context:MobileContext):List<MobileQueueRow>{requireOwner(context);return database.runInTransaction<List<MobileQueueRow>>{recover(context);rows(context)}}
 fun claimNext(context:MobileContext,worker:String):MobileQueueRow? {
  requireOwner(context);return database.runInTransaction<MobileQueueRow?>{
   recover(context);val lease=dao.lease(context.partition);if(lease!=null && lease.owner!=worker && lease.untilElapsed>SystemClock.elapsedRealtime())return@runInTransaction null
   val queue=rows(context);val candidate=queue.filter{it.state in setOf("Queued","Awaiting confirmation")}.firstOrNull { row->
    queue.none{it.shipmentId==row.shipmentId && it.sequence<row.sequence && it.state !in setOf("Synced","Discarded")} && dependencies(row).all { id->queue.any{it.operationId==id && it.state=="Synced"} }
   }?:return@runInTransaction null
   dao.saveLease(MobileSyncLease(context.partition,processId,worker,SystemClock.elapsedRealtime()+120000))
   dao.mark(candidate.operationId,context.partition,"Sending",candidate.attempts+1,true,candidate.resultJson,worker,null)
   candidate.copy(state="Sending",claimOwner=worker)
  }
 }
 fun hasQueuedTerminal(context:MobileContext,id:String):Boolean=rows(context).any{it.shipmentId==id && it.action=="delivery.update" && it.state!="Discarded" && JSONObject(it.payloadJson).optString("status") in setOf("Delivered","Returned")}
 fun pruneHistory(context:MobileContext){requireOwner(context);database.runInTransaction{
  val all=rows(context).toMutableList();val protected=dao.tracking(context.partition)?.let{JSONObject(it.json).optString("startOperationId")}
  for(row in all.toList().reversed())if(row.state in setOf("Synced","Discarded") && row.createdAtMs<clock()-604800000 && row.operationId!=protected && (row.fileId==null||dao.file(context.partition,row.fileId)==null) && all.none{row.operationId in dependencies(it)}){dao.deleteHistory(context.partition,row.operationId);all.remove(row)}
 }}
 fun claimOutcome(context:MobileContext,id:String,worker:String):MobileQueueRow?=database.runInTransaction<MobileQueueRow?>{
  requireOwner(context);recover(context);val row=requireNotNull(dao.operation(id));require(row.partition==context.partition)
  val lease=dao.lease(context.partition);if(lease!=null && lease.owner!=worker && lease.untilElapsed>SystemClock.elapsedRealtime())return@runInTransaction null
  check(row.sentOnce && row.state in setOf("Awaiting confirmation","Needs review")){"Only uncertain sent work can be checked"}
  dao.saveLease(MobileSyncLease(context.partition,processId,worker,SystemClock.elapsedRealtime()+120000));dao.mark(id,context.partition,"Sending",row.attempts,true,row.resultJson,worker,null);row.copy(state="Sending",claimOwner=worker)
 }
 fun markAwaiting(context:MobileContext,id:String,worker:String,reason:String?=null,review:Boolean=false){requireOwner(context);database.runInTransaction{val row=requireNotNull(dao.operation(id));require(row.partition==context.partition && row.claimOwner==worker);dao.mark(id,context.partition,if(review)"Needs review" else "Awaiting confirmation",row.attempts,true,row.resultJson,null,reason?.take(120));dao.releaseLease(context.partition,worker)}}
 fun markResult(context:MobileContext,id:String,worker:String,result:String){requireOwner(context);database.runInTransaction{
  val row=requireNotNull(dao.operation(id));require(row.partition==context.partition && row.claimOwner==worker)
  val p=JSONObject(result);require(p.getString("protocol")=="mobile-command-1.0" && p.getString("operationId")==id && p.getString("action")==row.action && p.getString("requestSha256")==row.requestSha256)
  val state=when(p.getString("state")){"Committed"->"Synced";"Pending"->{require(row.action=="evidence.prepare");"Synced"};"Cancelled","Rejected"->"Needs review";else->throw IllegalArgumentException("Invalid command result")}
  MobileQuotaPolicy.requireFits(managedBytes(context),result.toByteArray().size.toLong());dao.mark(id,context.partition,state,row.attempts,true,result,null,if(state=="Needs review")p.optString("reason","refused") else null);dao.releaseLease(context.partition,worker)
 }}
 fun retry(context:MobileContext,id:String){requireOwner(context);database.runInTransaction{val row=requireNotNull(dao.operation(id));require(row.partition==context.partition);check(row.state=="Needs review");if(row.resultJson!=null){check(JSONObject(row.resultJson).optString("state") !in setOf("Rejected","Cancelled")){"A refused immutable action cannot be rebased"}};dao.mark(id,context.partition,if(row.sentOnce)"Awaiting confirmation" else "Queued",0,row.sentOnce,row.resultJson,null,null)}}
 fun discardUnsent(context:MobileContext,id:String){requireOwner(context);database.runInTransaction{val row=requireNotNull(dao.operation(id));require(row.partition==context.partition);check(row.state=="Queued" && !row.sentOnce){"Reconcile uncertain work before discard"};check(rows(context).none{it.state !in setOf("Synced","Discarded") && id in dependencies(it)}){"Discard dependent work first"};dao.mark(id,context.partition,"Discarded",row.attempts,false,null,null,null)}}
 fun discardResolvedOrUnsent(context:MobileContext,id:String){requireOwner(context);database.runInTransaction{
  val row=requireNotNull(dao.operation(id));require(row.partition==context.partition)
  val definitive=row.resultJson?.let{JSONObject(it).optString("state") in setOf("Cancelled","Rejected")}?:false
  check((row.state=="Queued" && !row.sentOnce)||(row.state=="Needs review" && definitive)){"Check uncertain outcome before discard"}
  check(rows(context).none{it.state !in setOf("Synced","Discarded") && id in dependencies(it)}){"Discard dependent work first"}
  dao.mark(id,context.partition,"Discarded",row.attempts,row.sentOnce,row.resultJson,null,row.lastError)
  if(row.fileId!=null && rows(context).none{it.fileId==row.fileId && it.state!="Discarded"})dao.file(context.partition,row.fileId)?.let{file->dao.markFile(context.partition,file.fileId,file.bytes,file.sha256,"Draft")}
 }}
 fun quarantineAccount(context:MobileContext){database.runInTransaction{val lease=dao.lease(context.partition);if(lease!=null)dao.releaseLease(context.partition,lease.owner);dao.recoverSending(context.partition)}}
 fun reserveFile(context:MobileContext,id:String,name:String,mime:String,path:String):MobileFileRow {requireOwner(context);return database.runInTransaction<MobileFileRow>{check(dao.fileCount()<10){"File limit reached"};MobileQuotaPolicy.requireFits(managedBytes(context),10485760+256);val row=MobileFileRow(id,context.partition,path,name,mime,10485760,"","Draft");dao.insertFile(row);row}}
 fun completeFile(context:MobileContext,id:String,bytes:Long,sha:String){requireOwner(context);dao.markFile(context.partition,id,bytes,sha,"Draft")}
 fun file(context:MobileContext,id:String):MobileFileRow {requireOwner(context);return requireNotNull(dao.file(context.partition,id))}
 fun removeDraft(context:MobileContext,id:String){requireOwner(context);dao.deleteDraft(context.partition,id)}
 // Cleanup is owned by the in-progress copy that reserved this unique draft,
 // including when logout interrupted it. It cannot erase a queued file.
 fun abandonCopy(context:MobileContext,id:String){database.runInTransaction{val row=dao.file(context.partition,id);if(row?.state=="Draft" && dao.queue(context.partition).none{it.fileId==id})dao.deleteDraft(context.partition,id)}}
 fun noteCleanup(context:MobileContext,id:String){requireOwner(context);val row=requireNotNull(dao.operation(id));require(row.partition==context.partition && row.state=="Synced");dao.mark(id,context.partition,row.state,row.attempts,row.sentOnce,row.resultJson,null,"Local file cleanup needs attention")}
 fun deleteAcknowledgedFile(context:MobileContext,id:String,sha:String){requireOwner(context);dao.deleteAcknowledgedFile(context.partition,id,sha)}
 fun publishTracking(context:MobileContext,expectedStartId:String,json:String):Boolean=database.runInTransaction<Boolean>{
  val start=requireNotNull(dao.operation(expectedStartId));require(start.partition==context.partition && start.action=="tracking.start")
  val previous=dao.tracking(context.partition)?.let{JSONObject(it.json)}?:return@runInTransaction false
  if(previous.optString("startOperationId")!=expectedStartId)return@runInTransaction false
  val incoming=JSONObject(json);require(incoming.getString("startOperationId")==expectedStartId && incoming.getString("shipmentId")==start.shipmentId)
  dao.saveTracking(MobileTrackingRow(context.partition,json));true
 }
}
