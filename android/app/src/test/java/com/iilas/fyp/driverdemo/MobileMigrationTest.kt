package com.iilas.fyp.driverdemo
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.util.UUID

@RunWith(RobolectricTestRunner::class) @Config(sdk=[28],manifest=Config.NONE)
class MobileMigrationTest {
 @Test fun versionOnePendingBytesAndIdentitySurviveVersionTwoMigration() = mobileOnWorker {
  val context:Context=ApplicationProvider.getApplicationContext();val name="migration-${UUID.randomUUID()}.db";val file=context.getDatabasePath(name);file.parentFile!!.mkdirs()
  val schema=JSONObject(File("schemas/com.iilas.fyp.driverdemo.MobileDatabase/2.json").readText()).getJSONObject("database").getJSONArray("entities")
  SQLiteDatabase.openOrCreateDatabase(file,null).use { old->
   for(i in 0 until schema.length()){val entity=schema.getJSONObject(i);old.execSQL(entity.getString("createSql").replace("\${TABLE_NAME}",entity.getString("tableName")).replace(", `lastError` TEXT","").replace(", `pointCount` INTEGER NOT NULL DEFAULT 0",""))}
   old.execSQL("INSERT INTO mobile_queue(operationId,partition,shipmentId,sequence,action,payloadJson,requestSha256,dependenciesJson,state,createdAtMs,attempts,sentOnce) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",arrayOf<Any>("original-operation","original-partition","s",1,"delivery.update","{ \"notes\":\"original bytes\" }","original-hash","[]","Queued",1234,0,0));old.version=1
  }
  val migrated=MobileDatabase.open(context,name);val row=migrated.dao().operation("original-operation")!!;assertEquals("{ \"notes\":\"original bytes\" }",row.payloadJson);assertEquals("original-hash",row.requestSha256);assertEquals("Queued",row.state);assertNull(row.lastError);migrated.close();context.deleteDatabase(name)
 }
}
