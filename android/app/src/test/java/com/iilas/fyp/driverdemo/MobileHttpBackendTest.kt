package com.iilas.fyp.driverdemo
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

@RunWith(RobolectricTestRunner::class)
@Config(manifest=Config.NONE)
class MobileHttpBackendTest {
 private val backend="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
 private class Reply(url:URL,val body:String,val status:Int=200):HttpURLConnection(url){
  val written=ByteArrayOutputStream()
  override fun connect(){};override fun disconnect(){};override fun usingProxy()=false
  override fun getOutputStream()=written
  override fun getInputStream()=ByteArrayInputStream(body.toByteArray())
  override fun getErrorStream()=inputStream
  override fun getResponseCode()=status
  override fun getHeaderField(name:String):String?=when(name.lowercase()){"x-iilas-protocol"->"iilas-msi-api-1.0";"x-iilas-backend"->"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";"content-type"->"application/json";else->null}
 }
 @Test fun commandUsesFreshBearerAndPreservesInput(){
  var reply:Reply?=null;var refreshes=0
  val http=MobileHttpBackend("https://iilas-fixture.invalid",backend,{refreshes++;"fixture-token"},{true}){url->Reply(url,"{\"data\":{\"uid\":\"staff\",\"version\":2}}").also{reply=it}}
  val result=http.command("mobileCommand",mapOf("operationId" to "original"));assertEquals(2,result["version"])
  assertEquals(1,refreshes);assertEquals("Bearer fixture-token",reply!!.getRequestProperty("Authorization"));assertTrue(reply!!.written.toString().contains("original"));assertFalse(reply!!.instanceFollowRedirects)
 }
 @Test fun changedAccountAndConflictNeverBecomeSuccess(){
  var current=true;val http=MobileHttpBackend("https://iilas-fixture.invalid",backend,{current=false;"fixture"},{current}){url->Reply(url,"{\"data\":{}}")}
  try{http.command("mobileCommand",emptyMap());fail()}catch(e:MobileFailure){assertEquals(MobileFailureKind.Authentication,e.kind)}
  assertEquals(MobileFailureKind.Conflict,MobileHttpPolicy.failure(409,"failed-precondition",false))
  assertEquals(MobileFailureKind.Transient,MobileHttpPolicy.failure(503,"unavailable",false))
  assertEquals(MobileFailureKind.Authentication,MobileHttpPolicy.failure(401,"unauthenticated",false))
 }
 @Test fun runtimeDestinationKeepsOldPartitionAndSeparatesBackend(){
  val id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";val local=MobileContext("scope","staff",id)
  assertEquals(mobileSha("fyp-inventory-and-logistics:scope:staff:$id".toByteArray()),local.partition)
  val one=MobileContext("scope","staff",id,"spark-msi:fyp-inventory-and-logistics:$backend:"+"a".repeat(64))
  val two=MobileContext("scope","staff",id,"spark-msi:fyp-inventory-and-logistics:$backend:"+"b".repeat(64))
  assertNotEquals(local.partition,one.partition);assertNotEquals(one.partition,two.partition)
 }
 @Test fun legacyAccessCacheCannotAuthorizeANewBackend(){val a=MobileSparkDestination("https://one.invalid",backend);val b=MobileSparkDestination("https://two.invalid",backend);assertNotEquals("iilas-local-context",a.preferencesName);assertNotEquals(a.preferencesName,b.preferencesName)}
 @Test fun versionTwoQueueMigrationPreservesOriginalOperationAndPayload(){
  val context=androidx.test.core.app.ApplicationProvider.getApplicationContext<android.content.Context>();val name="spark-migration-"+java.util.UUID.randomUUID()+".db";val factory=androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory()
  val old=factory.create(androidx.sqlite.db.SupportSQLiteOpenHelper.Configuration.builder(context).name(name).callback(object:androidx.sqlite.db.SupportSQLiteOpenHelper.Callback(2){override fun onCreate(db:androidx.sqlite.db.SupportSQLiteDatabase){db.execSQL("CREATE TABLE mobile_queue(operationId TEXT PRIMARY KEY, partition TEXT, payloadJson TEXT)");db.execSQL("INSERT INTO mobile_queue VALUES(?,?,?)",arrayOf("original-operation","original-partition","{\"status\":\"In Transit\"}"))};override fun onUpgrade(db:androidx.sqlite.db.SupportSQLiteDatabase,a:Int,b:Int){error("Unexpected prior migration")}}).build());old.writableDatabase;old.close()
  val next=factory.create(androidx.sqlite.db.SupportSQLiteOpenHelper.Configuration.builder(context).name(name).callback(object:androidx.sqlite.db.SupportSQLiteOpenHelper.Callback(3){override fun onCreate(db:androidx.sqlite.db.SupportSQLiteDatabase){error("Existing data must be upgraded")};override fun onUpgrade(db:androidx.sqlite.db.SupportSQLiteDatabase,a:Int,b:Int){assertEquals(2,a);assertEquals(3,b);MobileDatabase.MIGRATION_2_3.migrate(db)}}).build())
  next.writableDatabase.query("SELECT operationId,partition,payloadJson,destination FROM mobile_queue").use{rows->assertTrue(rows.moveToFirst());assertEquals("original-operation",rows.getString(0));assertEquals("original-partition",rows.getString(1));assertEquals("{\"status\":\"In Transit\"}",rows.getString(2));assertEquals("legacy",rows.getString(3));assertFalse(rows.moveToNext())};next.close()
 }
}
