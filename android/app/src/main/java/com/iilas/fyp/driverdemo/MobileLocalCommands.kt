package com.iilas.fyp.driverdemo
import org.json.JSONObject
import java.util.UUID

data class MobileProofQueued(val prepareOperationId:String,val finaliseOperationId:String,val evidenceId:String,val name:String)
class MobileLocalCommands(private val repo:MobileRepository,private val files:MobileFiles,private val onTerminalQueued:(String)->Unit={}) {
 private fun cached(owner:MobileContext,id:String):JSONObject=JSONObject(requireNotNull(repo.readAssignments(owner).find{it.shipmentId==id}){"Refresh this assignment first"}.json)
 private fun active(owner:MobileContext,id:String)=repo.readQueue(owner).filter{it.shipmentId==id && it.state!="Discarded"}
 fun enqueueStatus(owner:MobileContext,id:String,status:String,notes:String,proofId:String?):MobileQueueRow {val result=repo.database.runInTransaction<MobileQueueRow>{
  repo.requireOwner(owner);require(notes.trim().length in 3..500 && !notes.contains(Regex("[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f]")))
  val snapshot=cached(owner,id);val updates=active(owner,id).filter{it.action=="delivery.update"};val version=snapshot.getInt("deliveryVersion")
  val later=updates.filter{JSONObject(it.payloadJson).getInt("expectedVersion")>=version}
  check(later.none{it.state=="Needs review"}){"Resolve refused work before recording another update"}
  val last=later.lastOrNull();val before=last?.let{JSONObject(it.payloadJson).getString("status")}?:snapshot.getString("status")
  val allowed=when(before){"Dispatched"->setOf("In Transit");"In Transit"->setOf("Attempt Failed","Delivered","Returned");"Attempt Failed"->setOf("In Transit","Returned");else->emptySet()};require(status in allowed)
  val deps=mutableListOf<String>();if(last!=null)deps.add(last.operationId)
  if(status=="Delivered"){
   require(proofId!=null);val proofs=snapshot.getJSONArray("proofs");val registered=(0 until proofs.length()).any{proofs.getJSONObject(it).getString("id")==proofId}
   if(!registered){val proof=requireNotNull(active(owner,id).find{it.action=="evidence.finalise" && it.fileId==proofId && it.state!="Needs review"}){"Queue an original proof first"};deps.add(proof.operationId)}
  } else require(proofId==null)
  val expected=last?.let{JSONObject(it.payloadJson).getInt("expectedVersion")+1}?:version
  val p=JSONObject().put("shipmentId",id).put("expectedVersion",expected).put("expectedShipmentVersion",snapshot.getInt("shipmentVersion")).put("expectedAssignmentVersion",snapshot.getInt("assignmentVersion")).put("status",status).put("notes",notes.trim()).put("proofId",proofId?:JSONObject.NULL)
  repo.queue(owner,id,MobileRequest(UUID.randomUUID().toString(),"delivery.update",p.toString()),deps.distinct())
 }
  if(status in setOf("Delivered","Returned"))onTerminalQueued(id)
  return result
 }
 fun enqueueProof(owner:MobileContext,id:String,fileId:String):MobileProofQueued=repo.database.runInTransaction<MobileProofQueued>{
  cached(owner,id);val file=repo.file(owner,fileId);check(file.state=="Draft");files.verify(owner,fileId)
  val prepare=UUID.randomUUID().toString();val finalise=UUID.randomUUID().toString()
  val p=JSONObject().put("shipmentId",id).put("evidenceId",fileId).put("type","Proof of Delivery").put("stage","Delivery").put("name",file.name).put("contentType",file.contentType).put("bytes",file.bytes).put("sha256",file.sha256).put("captureSource","file").put("capturedAtClient",JSONObject.NULL)
  repo.queue(owner,id,MobileRequest(prepare,"evidence.prepare",p.toString()),emptyList(),fileId)
  repo.queue(owner,id,MobileRequest(finalise,"evidence.finalise",JSONObject().put("prepareOperationId",prepare).toString()),listOf(prepare),fileId)
  repo.database.dao().markFile(owner.partition,fileId,file.bytes,file.sha256,"Queued");MobileProofQueued(prepare,finalise,fileId,file.name)
 }
 fun discard(owner:MobileContext,id:String)=repo.discardResolvedOrUnsent(owner,id)
}
