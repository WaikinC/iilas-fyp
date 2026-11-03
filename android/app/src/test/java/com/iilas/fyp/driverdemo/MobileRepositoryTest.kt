package com.iilas.fyp.driverdemo
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.UUID
import org.json.JSONObject

@RunWith(RobolectricTestRunner::class) @Config(sdk=[28],manifest=Config.NONE)
class MobileRepositoryTest {
 private val context:Context=ApplicationProvider.getApplicationContext()
 private val owner=MobileContext("scope","driver",UUID.randomUUID().toString())
 private fun request(action:String="delivery.update",payload:String="""{"shipmentId":"s","expectedVersion":0,"status":"In Transit","notes":"On route","proofId":null}""")=MobileRequest(UUID.randomUUID().toString(),action,payload)
 @Test fun pendingBytesSurviveRestartAndSwitch() = mobileOnWorker {
  val name="mobile-test-${UUID.randomUUID()}.db";var uid:String?="driver";val db=MobileDatabase.open(context,name)
  val repo=MobileRepository(db,{uid},"process-one")
  val original=request();repo.queue(owner,"s",original,emptyList())
  val claimed=repo.claimNext(owner,"worker-one")!!;assertEquals(original.payloadJson,claimed.payloadJson);assertEquals("Sending",repo.readQueue(owner).single().state)
  db.close();val reopened=MobileDatabase.open(context,name);val restarted=MobileRepository(reopened,{uid},"process-two")
  assertEquals(original.operationId,restarted.readQueue(owner).single().operationId);assertEquals("Awaiting confirmation",restarted.readQueue(owner).single().state)
  uid="other";try { restarted.readQueue(owner);fail("Cross-account read") } catch (_:IllegalArgumentException) {}
  uid="driver";assertEquals(original.payloadJson,restarted.readQueue(owner).single().payloadJson);reopened.close();context.deleteDatabase(name)
 }
 @Test fun actionAndPointCapsRefuseNewWorkWithoutEviction() = mobileOnWorker {
  val db=MobileDatabase.open(context,"quota-${UUID.randomUUID()}.db");val repo=MobileRepository(db,{"driver"},"process")
  repeat(200){repo.queue(owner,"s",request(),emptyList())};try {repo.queue(owner,"s",request(),emptyList());fail("Action cap") } catch (_:IllegalStateException) {}
  var lastPayload=""
  repeat(2000){i->val payload=JSONObject().put("sessionId",UUID.randomUUID().toString()).put("points",org.json.JSONArray().put(JSONObject().put("sampleId",UUID.randomUUID().toString()).put("sequence",i+1).put("capturedAtMs",100000L+i).put("latitude",3.0).put("longitude",101.0).put("accuracy",5.0))).toString();lastPayload=payload;repo.queue(owner,"s",request("tracking.points",payload),emptyList())}
  try {repo.queue(owner,"s",request("tracking.points",lastPayload),emptyList());fail("Point cap") } catch (_:IllegalStateException) {}
  assertEquals(2200,repo.readQueue(owner).size);db.close()
 }
 @Test fun sameUuidCannotChangeInputAndDiscardCannotEraseUncertainWork() = mobileOnWorker {
  val db=MobileDatabase.open(context,"immutable-${UUID.randomUUID()}.db");val repo=MobileRepository(db,{"driver"},"process");val r=request();repo.queue(owner,"s",r,emptyList())
  try{repo.queue(owner,"s",r.copy(payloadJson=r.payloadJson+" "),emptyList());fail("Changed bytes") }catch(_:IllegalArgumentException){}
  val claimed=repo.claimNext(owner,"worker")!!;try{repo.discardUnsent(owner,claimed.operationId);fail("Uncertain discard") }catch(_:IllegalStateException){}
  assertEquals("Sending",repo.readQueue(owner).single().state);db.close()
 }
 @Test fun cacheStaysConfirmedAndDepsBlock() = mobileOnWorker {
  val db=MobileDatabase.open(context,"cache-${UUID.randomUUID()}.db");val repo=MobileRepository(db,{"driver"},"process")
  repo.cacheAssignments(owner,listOf("""{"id":"s","reference":"S1","status":"Dispatched","deliveryVersion":0}"""),1234)
  val first=request();repo.queue(owner,"s",first,emptyList());repo.queue(owner,"s",request(),listOf(first.operationId));assertTrue(repo.readAssignments(owner).single().json.contains("Dispatched"))
  assertEquals(first.operationId,repo.claimNext(owner,"worker")!!.operationId);assertNull(repo.claimNext(owner,"another-worker"));db.close()
 }
 @Test fun switchedAccountsCannotBypassActionCap() = mobileOnWorker {
  val db=MobileDatabase.open(context,"q.db");var uid:String?="driver";val repo=MobileRepository(db,{uid},"process");repeat(200){repo.queue(owner,"s",request(),emptyList())};uid="other"
  try{repo.queue(MobileContext("scope","other",owner.installationId),"s",request(),emptyList());fail("Global action cap bypass")}catch(_:IllegalStateException){};db.close()
 }
 @Test fun switchedAccountsCannotBypassPointCap() = mobileOnWorker {
  val db=MobileDatabase.open(context,"p.db");var uid:String?="driver";val repo=MobileRepository(db,{uid},"process")
  val points=org.json.JSONArray();repeat(25){i->points.put(JSONObject().put("sampleId",UUID.randomUUID().toString()).put("sequence",i+1).put("capturedAtMs",10000+i).put("latitude",3).put("longitude",101).put("accuracy",1))}
  val payload=JSONObject().put("sessionId",UUID.randomUUID().toString()).put("points",points).toString();repeat(80){repo.queue(owner,"s",request("tracking.points",payload),emptyList())};uid="other"
  try{repo.queue(MobileContext("scope","other",owner.installationId),"s",request("tracking.points",payload),emptyList());fail("Global point cap bypass")}catch(_:IllegalStateException){};db.close()
 }
 @Test fun oldServiceCannotPublishOverANewerStart() = mobileOnWorker {
  val db=MobileDatabase.open(context,"t.db");val repo=MobileRepository(db,{"driver"},"process");val old=request("tracking.start",JSONObject().put("shipmentId","s").put("installationId",owner.installationId).toString());repo.queue(owner,"s",old,emptyList())
  val fresh=request("tracking.start",JSONObject().put("shipmentId","s").put("installationId",owner.installationId).toString());repo.queue(owner,"s",fresh,emptyList());val current=JSONObject().put("startOperationId",fresh.operationId).put("shipmentId","s").put("phase","Starting").toString();db.dao().saveTracking(MobileTrackingRow(owner.partition,current))
  assertFalse(repo.publishTracking(owner,old.operationId,JSONObject().put("startOperationId",old.operationId).put("shipmentId","s").put("phase","Stopped").toString()));assertEquals(current,db.dao().tracking(owner.partition)!!.json);db.close()
 }
}
