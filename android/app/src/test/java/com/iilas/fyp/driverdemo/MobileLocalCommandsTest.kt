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
class MobileLocalCommandsTest {
 private val app:Context=ApplicationProvider.getApplicationContext()
 private val owner=MobileContext("scope","driver",UUID.randomUUID().toString())
 private val snapshot="""{"id":"s","reference":"S1","recipient":"Demo","address":"Demo address","expectedDelivery":"2026-10-26","shipmentVersion":2,"deliveryVersion":0,"status":"Dispatched","assignmentVersion":1,"proofs":[]}"""
 @Test fun queuedTransitionsKeepTheOriginalBasisAndConfirmedCache() = mobileOnWorker {
  val db=MobileDatabase.open(app,"c.db");val repo=MobileRepository(db,{"driver"},"process");repo.cacheAssignments(owner,listOf(snapshot),1000);val commands=MobileLocalCommands(repo,MobileFiles(app,repo));val first=commands.enqueueStatus(owner,"s","In Transit","On route",null);val second=commands.enqueueStatus(owner,"s","Attempt Failed","No answer",null)
  assertEquals(0,JSONObject(first.payloadJson).getInt("expectedVersion"));assertEquals(1,JSONObject(second.payloadJson).getInt("expectedVersion"));assertEquals(2,JSONObject(second.payloadJson).getInt("expectedShipmentVersion"));assertEquals(1,JSONObject(second.payloadJson).getInt("expectedAssignmentVersion"));assertTrue(second.dependenciesJson.contains(first.operationId));assertEquals(snapshot,repo.readAssignments(owner).single().json);db.close()
 }
 @Test fun deliveredWaitsForTheOriginalProofFinalisation() = mobileOnWorker {
  val db=MobileDatabase.open(app,"p.db");val repo=MobileRepository(db,{"driver"},"process");repo.cacheAssignments(owner,listOf(snapshot),1000);val files=MobileFiles(app,repo);val commands=MobileLocalCommands(repo,files);commands.enqueueStatus(owner,"s","In Transit","On route",null)
  val file=files.copy(owner,java.io.ByteArrayInputStream("%PDF-1.4 ordinary proof".toByteArray()),"p.pdf","application/pdf");val proof=commands.enqueueProof(owner,"s",file.fileId);val delivered=commands.enqueueStatus(owner,"s","Delivered","Received by recipient",file.fileId);assertTrue(delivered.dependenciesJson.contains(proof.finaliseOperationId));assertEquals(file.fileId,JSONObject(delivered.payloadJson).getString("proofId"));assertEquals(23,JSONObject(requireNotNull(db.dao().operation(proof.prepareOperationId)).payloadJson).getInt("bytes"));db.close()
 }
 @Test fun definitiveRefusalCanBeDismissedButUncertainWorkCannot() = mobileOnWorker {
  val db=MobileDatabase.open(app,"r.db");val repo=MobileRepository(db,{"driver"},"process");repo.cacheAssignments(owner,listOf(snapshot),1000);val commands=MobileLocalCommands(repo,MobileFiles(app,repo));val input=commands.enqueueStatus(owner,"s","In Transit","On route",null);val claim=repo.claimNext(owner,"worker")!!
  try{commands.discard(owner,input.operationId);fail("Uncertain work discarded")}catch(_:IllegalStateException){}
  val cancelled=JSONObject().put("protocol","mobile-command-1.0").put("operationId",input.operationId).put("action",input.action).put("requestSha256",input.requestSha256).put("state","Cancelled").put("recordId",JSONObject.NULL).put("version",JSONObject.NULL).put("reason",JSONObject.NULL).put("replayed",false).put("data",JSONObject.NULL).toString();repo.markResult(owner,input.operationId,claim.claimOwner!!,cancelled);commands.discard(owner,input.operationId);assertEquals("Discarded",repo.readQueue(owner).single().state);assertEquals(cancelled,repo.readQueue(owner).single().resultJson);db.close()
 }
 @Test fun queueProjectionAndExplicitOutcomeChecksKeepOriginalBytes() = mobileOnWorker {
  val db=MobileDatabase.open(app,"v.db");val repo=MobileRepository(db,{"driver"},"process");repo.cacheAssignments(owner,listOf(snapshot),1000);val commands=MobileLocalCommands(repo,MobileFiles(app,repo));val input=commands.enqueueStatus(owner,"s","In Transit","On route",null)
  val page=MobilePresentation(repo).queue(owner,0);assertEquals(1,page["pending"]);assertFalse(page.toString().contains("payloadJson"));val claim=repo.claimNext(owner,"worker")!!;repo.markAwaiting(owner,input.operationId,"worker","Transient",true)
  val check=repo.claimOutcome(owner,input.operationId,"resolve")!!;assertEquals(input.payloadJson,check.payloadJson);assertEquals("resolve",check.claimOwner);assertNull(repo.claimOutcome(owner,input.operationId,"other"));db.close()
 }

 @Test fun sevenDayRetentionNeverRemovesPendingDependenciesOrOriginalFiles() = mobileOnWorker {
  val db=MobileDatabase.open(app,"h.db");var now=1000L;val repo=MobileRepository(db,{"driver"},"process",{now});repo.cacheAssignments(owner,listOf(snapshot),1000);val commands=MobileLocalCommands(repo,MobileFiles(app,repo));val first=commands.enqueueStatus(owner,"s","In Transit","On route",null);commands.enqueueStatus(owner,"s","Attempt Failed","No answer",null)
  val claim=repo.claimNext(owner,"worker")!!;val result=JSONObject().put("protocol","mobile-command-1.0").put("operationId",first.operationId).put("action",first.action).put("requestSha256",first.requestSha256).put("state","Committed").put("recordId","s").put("version",1).put("reason",JSONObject.NULL).put("replayed",false).put("data",JSONObject().put("shipmentId","s").put("status","In Transit").put("eventId","e")).toString();repo.markResult(owner,first.operationId,claim.claimOwner!!,result);now=700000000L;repo.pruneHistory(owner);assertEquals(2,repo.readQueue(owner).size);db.close()
 }
 @Test fun closedShipmentProjectionRefusesProtectedAndMalformedFields(){val value=JSONObject(snapshot);MobileProjection.shipment(value);try{MobileProjection.shipment(JSONObject(snapshot).put("ownerId","foreign"));fail("Protected data admitted")}catch(_:IllegalArgumentException){};try{MobileProjection.shipment(JSONObject(snapshot).put("shipmentVersion",1.5));fail("Fractional version admitted")}catch(_:IllegalArgumentException){}}

 @Test fun terminalEnqueueStopsItsMatchingServiceAndBlocksAnotherAdmission() = mobileOnWorker {
  val db=MobileDatabase.open(app,"t.db");val repo=MobileRepository(db,{"driver"},"process");repo.cacheAssignments(owner,listOf(snapshot),1000);val stopped=mutableListOf<String>();val commands=MobileLocalCommands(repo,MobileFiles(app,repo)){id->stopped.add(id)};commands.enqueueStatus(owner,"s","In Transit","On route",null);commands.enqueueStatus(owner,"s","Returned","Returned to sender",null);assertEquals(listOf("s"),stopped);assertTrue(repo.hasQueuedTerminal(owner,"s"));db.close()
 }
 @Test fun syncedReceiptBecomesConfirmedInsteadOfRemainingQueued() = mobileOnWorker {
  val db=MobileDatabase.open(app,"z.db");val repo=MobileRepository(db,{"driver"},"process");repo.cacheAssignments(owner,listOf(snapshot),1000);val row=MobileLocalCommands(repo,MobileFiles(app,repo)).enqueueStatus(owner,"s","In Transit","On route",null);repo.claimNext(owner,"worker")
  val result=JSONObject().put("protocol","mobile-command-1.0").put("operationId",row.operationId).put("action",row.action).put("requestSha256",row.requestSha256).put("state","Committed").put("recordId","s").put("version",1).put("reason",JSONObject.NULL).put("replayed",false).put("data",JSONObject().put("shipmentId","s").put("status","In Transit").put("eventId","e")).toString();repo.markResult(owner,row.operationId,"worker",result)
  val detail=MobilePresentation(repo).detail(owner,"s");assertNull(detail["queuedStatus"]);assertEquals("In Transit",(detail["shipment"] as Map<*,*>)["status"]);assertEquals(snapshot,repo.readAssignments(owner).single().json);db.close()
 }

}
