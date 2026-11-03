package com.iilas.fyp.driverdemo
import org.json.JSONObject

object MobileWire {
 private fun exact(value:JSONObject,keys:Set<String>){require(value.keys().asSequence().toSet()==keys){"Unexpected mobile reply fields"}}
 private fun integer(value:Any,min:Long=0):Long {require(value is Number && value.toDouble().isFinite() && value.toDouble()==value.toLong().toDouble() && value.toLong()>=min);return value.toLong()}
 fun validate(context:MobileContext,row:MobileQueueRow,result:JSONObject,file:MobileFileRow?=null){
  require(row.destination==(context.destination?:"legacy") && row.partition==context.partition)
  require(result.toString().toByteArray().size<=65536)
  exact(result,setOf("protocol","operationId","action","requestSha256","state","recordId","version","reason","replayed","data"))
  require(result.get("protocol")=="mobile-command-1.0" && result.get("operationId")==row.operationId && result.get("action")==row.action && result.get("requestSha256")==row.requestSha256 && result.get("replayed") is Boolean)
  val state=result.getString("state");val p=JSONObject(row.payloadJson)
  if(state in setOf("Cancelled","Rejected")){
   require(result.isNull("recordId") && result.isNull("version") && result.isNull("data"));if(state=="Cancelled")require(result.isNull("reason")) else require(result.getString("reason") in setOf("stale_version","assignment_changed","delivery_closed","invalid_clock","expired_capture","evidence_conflict","authority_changed"));return
  }
  require(state=="Committed" || state=="Pending" && row.action=="evidence.prepare");require(result.isNull("reason"));val version=integer(result.get("version"),1);val data=result.getJSONObject("data");val record=result.getString("recordId");require(record.matches(Regex("[A-Za-z0-9_-]{1,128}")))
  when(row.action){
   "delivery.update"->{exact(data,setOf("shipmentId","status","eventId"));require(record==row.shipmentId && data.getString("shipmentId")==row.shipmentId && data.get("status")==p.get("status") && data.getString("eventId").matches(Regex("[A-Za-z0-9_-]{1,128}")) && version==integer(p.get("expectedVersion"))+1)}
   "tracking.start","tracking.renew"->{exact(data,setOf("sessionId","serverNowMs","leaseUntilMs","absoluteUntilMs","intervalMs"));val now=integer(data.get("serverNowMs"));val lease=integer(data.get("leaseUntilMs"));val end=integer(data.get("absoluteUntilMs"));require(record==data.getString("sessionId") && lease in now..(now+1800000) && lease<=end && end<=now+14400000 && integer(data.get("intervalMs"))==20000L)}
   "tracking.stop"->{exact(data,setOf("sessionId","stopped"));require(record==p.getString("sessionId") && data.getString("sessionId")==record && data.get("stopped")==true)}
   "tracking.points"->{exact(data,setOf("accepted","latestChanged"));require(record==p.getString("sessionId") && integer(data.get("accepted"),1)==p.getJSONArray("points").length().toLong() && data.get("latestChanged") is Boolean)}
   "evidence.prepare"->{exact(data,setOf("evidenceId","path","metadata"));val id=p.getString("evidenceId");require(record==id && data.getString("evidenceId")==id && data.getString("path")=="evidence/${context.scope}/${row.shipmentId}/$id");val meta=data.getJSONObject("metadata");exact(meta,setOf("actor","stage","evidenceType","captureSource","capturedAtClient","mobilePrepareId","sha256"));require(meta.getString("actor")==context.uid && meta.getString("stage")=="Delivery" && meta.getString("evidenceType")=="Proof of Delivery" && meta.getString("captureSource")=="file" && meta.getString("capturedAtClient")=="" && meta.getString("mobilePrepareId")==row.operationId && meta.getString("sha256")==p.getString("sha256"))}
   "evidence.finalise"->{exact(data,setOf("evidenceId","sha256"));require(data.getString("evidenceId")==record && data.getString("sha256").matches(Regex("[a-f0-9]{64}")));if(file!=null)require(record==file.fileId && data.getString("sha256")==file.sha256)}
   else->throw IllegalArgumentException("Unknown mobile reply action")
  }
 }
}
