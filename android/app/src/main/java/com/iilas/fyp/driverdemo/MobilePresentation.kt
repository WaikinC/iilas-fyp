package com.iilas.fyp.driverdemo
import org.json.JSONObject

fun mobileMap(value:JSONObject):Map<String,Any?> = value.keys().asSequence().associateWith{key->mobileValue(value.get(key))}
private fun mobileValue(value:Any?):Any?=when(value){JSONObject.NULL->null;is JSONObject->mobileMap(value);is org.json.JSONArray->(0 until value.length()).map{mobileValue(value.get(it))};else->value}
object MobileProjection {
 private fun exact(v:JSONObject,k:Set<String>){require(v.keys().asSequence().toSet()==k)}
 private fun id(v:String){require(v.matches(Regex("[A-Za-z0-9_-]{1,128}")))}
 fun shipment(v:JSONObject):JSONObject {
  exact(v,setOf("id","reference","recipient","address","expectedDelivery","shipmentVersion","deliveryVersion","status","assignmentVersion","proofs"));id(v.getString("id"))
  for((k,max) in mapOf("reference" to 120,"recipient" to 180,"address" to 1000)){val text=v.getString(k);require(text.trim().length in 1..max && !text.any{it.code<32})}
  require(v.getString("expectedDelivery").matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")))
  for(k in listOf("shipmentVersion","assignmentVersion","deliveryVersion")){val n=v.get(k);require(n is Number && n.toDouble()==n.toLong().toDouble() && n.toLong()>=(if(k=="deliveryVersion")0 else 1))}
  require(v.getString("status") in setOf("Dispatched","In Transit","Attempt Failed","Delivered","Returned"));val proofs=v.getJSONArray("proofs");require(proofs.length()<=20)
  for(i in 0 until proofs.length()){val p=proofs.getJSONObject(i);exact(p,setOf("id","name"));id(p.getString("id"));require(p.getString("name").length in 1..180)};return v
 }
 fun page(v:JSONObject):JSONObject {exact(v,setOf("items","cursor","verifiedAtMs"));val items=v.getJSONArray("items");require(items.length()<=20);for(i in 0 until items.length())shipment(items.getJSONObject(i));if(!v.isNull("cursor"))id(v.getString("cursor"));val t=v.get("verifiedAtMs");require(t is Number && t.toDouble()==t.toLong().toDouble() && t.toLong()>=0);return v}
}
class MobilePresentation(private val repo:MobileRepository) {
 private fun confirmed(owner:MobileContext,row:MobileCache,queue:List<MobileQueueRow>):JSONObject {
  val shipment=MobileProjection.shipment(JSONObject(row.json))
  for(update in queue.filter{it.shipmentId==row.shipmentId && it.action=="delivery.update" && it.state=="Synced"}){
   val input=JSONObject(update.payloadJson)
   if(input.getInt("expectedVersion")!=shipment.getInt("deliveryVersion")||input.getInt("expectedShipmentVersion")!=shipment.getInt("shipmentVersion")||input.getInt("expectedAssignmentVersion")!=shipment.getInt("assignmentVersion"))continue
   val result=JSONObject(requireNotNull(update.resultJson));MobileWire.validate(owner,update,result)
   shipment.put("deliveryVersion",result.getLong("version")).put("status",result.getJSONObject("data").getString("status"))
  }
  return shipment
 }
 fun draft(file:MobileFileRow):Map<String,Any?> = mapOf("fileId" to file.fileId,"name" to file.name,"contentType" to file.contentType,"bytes" to file.bytes)
 fun page(owner:MobileContext,cursor:String?):Map<String,Any?> {val rows=repo.readAssignments(owner).filter{cursor==null||it.shipmentId>cursor};val selected=rows.take(20);val queue=repo.readQueue(owner);return mapOf("items" to selected.map{mobileMap(confirmed(owner,it,queue))},"cursor" to if(rows.size>20)selected.last().shipmentId else null,"verifiedAtMs" to (selected.minOfOrNull{it.verifiedAtMs}?:0),"cached" to true)}
 fun detail(owner:MobileContext,id:String,cached:Boolean=true):Map<String,Any?> {
  val row=requireNotNull(repo.readAssignments(owner).find{it.shipmentId==id});val queue=repo.readQueue(owner).filter{it.shipmentId==id && it.state!="Discarded"};val shipment=confirmed(owner,row,queue)
  val status=queue.lastOrNull{it.action=="delivery.update" && JSONObject(it.payloadJson).getInt("expectedVersion")>=shipment.getInt("deliveryVersion") && it.state in setOf("Queued","Sending","Awaiting confirmation")}?.let{JSONObject(it.payloadJson).getString("status")}
  val proofs=queue.filter{it.action=="evidence.finalise"}.takeLast(10).map{finalise->val prepare=queue.find{it.operationId==JSONObject(finalise.payloadJson).getString("prepareOperationId")};val p=JSONObject(requireNotNull(prepare).payloadJson);mapOf("evidenceId" to p.getString("evidenceId"),"name" to p.getString("name"),"operationId" to finalise.operationId,"state" to finalise.state)}
  return mapOf("shipment" to mobileMap(shipment),"verifiedAtMs" to row.verifiedAtMs,"cached" to cached,"pendingProofs" to proofs,"queuedStatus" to status)
 }
 fun queue(owner:MobileContext,cursor:Int):Map<String,Any?> {
  require(cursor in 0..100000);val all=repo.readQueue(owner);val rows=all.reversed();val selected=rows.drop(cursor).take(20)
  val items=selected.map {r->val terminal=r.resultJson?.let{JSONObject(it).optString("state") in setOf("Rejected","Cancelled")}?:false;val dependent=all.any{it.state !in setOf("Synced","Discarded") && org.json.JSONArray(it.dependenciesJson).let{a->(0 until a.length()).any{i->a.getString(i)==r.operationId}}}
   mapOf("operationId" to r.operationId,"shipmentId" to r.shipmentId,"action" to r.action,"label" to when(r.action){"delivery.update"->"Record "+JSONObject(r.payloadJson).getString("status");"evidence.prepare"->"Prepare delivery proof";"evidence.finalise"->"Register delivery proof";"tracking.points"->"Synchronise saved locations";else->r.action.replace('.',' ')},"state" to r.state,"reason" to r.lastError,"createdAtMs" to r.createdAtMs,"attempts" to r.attempts,"canRetry" to (r.state=="Needs review"&&!terminal),"canDiscard" to (!dependent&&((r.state=="Queued"&&!r.sentOnce)||(r.state=="Needs review"&&terminal))),"canCheck" to (r.sentOnce && !terminal && r.state in setOf("Needs review","Awaiting confirmation"))) }
  return mapOf("items" to items,"cursor" to if(cursor+20<rows.size)cursor+20 else null,"pending" to all.count{it.state !in setOf("Synced","Discarded")},"needsReview" to all.count{it.state=="Needs review"},"drafts" to repo.database.dao().files(owner.partition).filter{it.state=="Draft" && it.sha256.isNotEmpty()}.map{draft(it)})
 }
}
