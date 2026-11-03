package com.iilas.fyp.driverdemo
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.UUID

@RunWith(RobolectricTestRunner::class) @Config(sdk=[28],manifest=Config.NONE)
class MobileSyncWorkerTest {
 private val app:Context=ApplicationProvider.getApplicationContext()
 private val owner=MobileContext("scope","driver",UUID.randomUUID().toString())
 private fun intent(action:String="delivery.update",payload:String="""{"shipmentId":"s","expectedVersion":0,"status":"In Transit","notes":"On route","proofId":null}""")=MobileRequest(UUID.randomUUID().toString(),action,payload)
 private class Server(private val proof:MobileFileRow?=null,private val files:MobileFiles?=null):MobileTransport {
  val seen=mutableMapOf<String,JSONObject>();val sent=mutableListOf<Pair<String,String>>();var commits=0;var loseReply=true;var rejectAuth=false;var refreshes=0;var onSend:(()->Unit)?=null
  override fun send(context:MobileContext,row:MobileQueueRow):JSONObject {
   sent.add(row.operationId to row.payloadJson);if(rejectAuth)throw MobileFailure(MobileFailureKind.Authentication)
   val result=seen.getOrPut(row.operationId){if(row.action!="evidence.prepare")commits++;val p=JSONObject(row.payloadJson)
    val data=when(row.action){
     "tracking.points"->JSONObject().put("accepted",1).put("latestChanged",true)
     "evidence.prepare"->JSONObject().put("evidenceId",proof!!.fileId).put("path","evidence/${context.scope}/s/${proof.fileId}").put("metadata",JSONObject().put("actor",context.uid).put("stage","Delivery").put("evidenceType","Proof of Delivery").put("captureSource","file").put("capturedAtClient","").put("mobilePrepareId",row.operationId).put("sha256",proof.sha256))
     "evidence.finalise"->JSONObject().put("evidenceId",proof!!.fileId).put("sha256",proof.sha256)
     else->JSONObject().put("shipmentId","s").put("status",p.getString("status")).put("eventId","event1")
    }
    val record=when{row.action=="tracking.points"->p.getString("sessionId");row.action.startsWith("evidence.")->proof!!.fileId;else->"s"}
    JSONObject().put("protocol","mobile-command-1.0").put("operationId",row.operationId).put("action",row.action).put("requestSha256",row.requestSha256).put("state",if(row.action=="evidence.prepare")"Pending" else "Committed").put("recordId",record).put("version",1).put("reason",JSONObject.NULL).put("replayed",false).put("data",data)
   }
   onSend?.invoke();if(loseReply && row.action!="evidence.prepare"){loseReply=false;throw MobileFailure(MobileFailureKind.Transient)};return JSONObject(result.toString())
  }
  var objectWrites=0
  override fun upload(context:MobileContext,row:MobileQueueRow) {assertEquals(proof!!.bytes,files!!.verify(context,proof.fileId).length());objectWrites++}
  override fun refresh(context:MobileContext){refreshes++}
  override fun cancel() {}
  override fun acknowledge(context:MobileContext,row:MobileQueueRow,result:JSONObject){if(row.action=="evidence.finalise")files!!.acknowledge(context,proof!!.fileId,proof.sha256)}
 }
 @Test fun lostDeliveryReplyReplaysExactIntentOnce() = mobileOnWorker {
  val db=MobileDatabase.open(app,"d.db");val repo=MobileRepository(db,{"driver"},"process");val input=intent();repo.queue(owner,"s",input,emptyList());val server=Server();val engine=MobileSyncEngine(repo,server)
  assertEquals(MobileDrain.Retry,engine.drain(owner));assertEquals("Awaiting confirmation",repo.readQueue(owner).single().state)
  assertEquals(MobileDrain.Idle,engine.drain(owner));assertEquals("Synced",repo.readQueue(owner).single().state);assertEquals(1,server.commits);assertEquals(listOf(input.operationId to input.payloadJson,input.operationId to input.payloadJson),server.sent);db.close()
 }
 @Test fun lostGpsReplyRetainsBatchAndSampleIds() = mobileOnWorker {
  val db=MobileDatabase.open(app,"g.db");val repo=MobileRepository(db,{"driver"},"process");val payload="""{"sessionId":"00000000-0000-4000-8000-000000000001","points":[{"sampleId":"00000000-0000-4000-8000-000000000002","sequence":1,"capturedAtMs":1000,"latitude":3,"longitude":101,"accuracy":4}]}""";val input=intent("tracking.points",payload);repo.queue(owner,"s",input,emptyList());val server=Server();val engine=MobileSyncEngine(repo,server)
  engine.drain(owner);engine.drain(owner);assertEquals(1,server.commits);assertEquals(1,server.sent.map{it.second}.distinct().size);db.close()
 }
 @Test fun secondWorkerCannotTransmitWhileLeaseHeld() = mobileOnWorker {
  val db=MobileDatabase.open(app,"l.db");val repo=MobileRepository(db,{"driver"},"process");repo.queue(owner,"s",intent(),emptyList());repo.claimNext(owner,"first")!!;val server=Server();MobileSyncEngine(repo,server).drain(owner);assertEquals(0,server.sent.size);assertEquals("first",repo.readQueue(owner).single().claimOwner);db.close()
 }
 @Test fun authRefreshHappensOnceThenAutomaticRetriesStop() = mobileOnWorker {
  val db=MobileDatabase.open(app,"a.db");val repo=MobileRepository(db,{"driver"},"process");repo.queue(owner,"s",intent(),emptyList());val server=Server();server.rejectAuth=true;val engine=MobileSyncEngine(repo,server)
  engine.drain(owner);engine.drain(owner);assertEquals(2,server.sent.size);assertEquals(1,server.refreshes);assertEquals("Needs review",repo.readQueue(owner).single().state);db.close()
 }
 @Test fun lateReplyAfterLogoutCannotMarkAnotherSession() = mobileOnWorker {
  var uid:String?="driver";val db=MobileDatabase.open(app,"o.db");val repo=MobileRepository(db,{uid},"process");repo.queue(owner,"s",intent(),emptyList());val server=Server();server.loseReply=false;server.onSend={uid="other";repo.quarantineAccount(owner)}
  assertEquals(MobileDrain.Stopped,MobileSyncEngine(repo,server).drain(owner));uid="driver";assertEquals("Awaiting confirmation",repo.readQueue(owner).single().state);db.close()
 }
 @Test fun transientBudgetStopsAtEightWithoutChangingId() = mobileOnWorker {
  val db=MobileDatabase.open(app,"b.db");val repo=MobileRepository(db,{"driver"},"process");val input=intent();repo.queue(owner,"s",input,emptyList());var sends=0
  val transport=object:MobileTransport {override fun send(context:MobileContext,row:MobileQueueRow):JSONObject{sends++;throw MobileFailure(MobileFailureKind.Transient)};override fun upload(context:MobileContext,row:MobileQueueRow){};override fun refresh(context:MobileContext){};override fun cancel(){}}
  val engine=MobileSyncEngine(repo,transport);repeat(9){engine.drain(owner)};assertEquals(8,sends);assertEquals(input.operationId,repo.readQueue(owner).single().operationId);assertEquals("Needs review",repo.readQueue(owner).single().state);db.close()
 }
 @Test fun lostProofReplyRecoversBeforeDeletingLocalCopy() = mobileOnWorker {
  val db=MobileDatabase.open(app,"f.db");val repo=MobileRepository(db,{"driver"},"process");val files=MobileFiles(app,repo);val proof=files.copy(owner,java.io.ByteArrayInputStream("%PDF-1.4 ordinary proof".toByteArray()),"p.pdf","application/pdf")
  val prep=intent("evidence.prepare",JSONObject().put("shipmentId","s").put("evidenceId",proof.fileId).put("type","Proof of Delivery").put("stage","Delivery").put("name","p.pdf").put("contentType","application/pdf").put("bytes",proof.bytes).put("sha256",proof.sha256).put("captureSource","file").put("capturedAtClient",JSONObject.NULL).toString());repo.queue(owner,"s",prep,emptyList(),proof.fileId)
  val finish=intent("evidence.finalise",JSONObject().put("prepareOperationId",prep.operationId).toString());repo.queue(owner,"s",finish,listOf(prep.operationId),proof.fileId);val server=Server(proof,files);val engine=MobileSyncEngine(repo,server)
  assertEquals(MobileDrain.Retry,engine.drain(owner));assertTrue(files.verify(owner,proof.fileId).exists());assertEquals(MobileDrain.Idle,engine.drain(owner));assertEquals(1,server.objectWrites);assertEquals(1,server.commits);assertTrue(db.dao().files(owner.partition).isEmpty());assertFalse(java.io.File(app.filesDir,"mobile-proofs/${proof.relativePath}").exists());db.close()
 }
 @Test fun uncorrelatedResultCannotConfirmLocalState() = mobileOnWorker {
  val db=MobileDatabase.open(app,"v.db");val repo=MobileRepository(db,{"driver"},"process");repo.queue(owner,"s",intent(),emptyList());val server=Server();server.loseReply=false;server.onSend={server.seen.values.single().put("extra","unsafe")};MobileSyncEngine(repo,server).drain(owner);assertEquals("Needs review",repo.readQueue(owner).single().state);db.close()
 }
 @Test fun knownGlobalAccessLossSignalsTrackingToStop() = mobileOnWorker {
  val db=MobileDatabase.open(app,"s.db");val repo=MobileRepository(db,{"driver"},"process");repo.queue(owner,"s",intent(),emptyList());val server=Server();server.rejectAuth=true;val signals=mutableListOf<String?>();MobileSyncEngine(repo,server,authorityLost={signals.add(it)}).drain(owner);assertEquals(listOf<String?>(null),signals);db.close()
 }
}
