package com.iilas.fyp.driverdemo
import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities=[MobileCache::class,MobileQueueRow::class,MobileFileRow::class,MobileSyncLease::class,MobileTrackingRow::class],version=3,exportSchema=true)
abstract class MobileDatabase:RoomDatabase() {
 abstract fun dao():MobileDao
 companion object {
  val MIGRATION_1_2=object:Migration(1,2){override fun migrate(db:SupportSQLiteDatabase){
   db.execSQL("ALTER TABLE mobile_queue ADD COLUMN lastError TEXT")
   db.execSQL("ALTER TABLE mobile_queue ADD COLUMN pointCount INTEGER NOT NULL DEFAULT 0")
   db.query("SELECT operationId,payloadJson FROM mobile_queue WHERE action='tracking.points'").use { rows->while(rows.moveToNext()){val count=org.json.JSONObject(rows.getString(1)).getJSONArray("points").length();check(count in 1..25);db.execSQL("UPDATE mobile_queue SET pointCount=? WHERE operationId=?",arrayOf<Any>(count,rows.getString(0)))}}
  }}
  val MIGRATION_2_3=object:Migration(2,3){override fun migrate(db:SupportSQLiteDatabase){db.execSQL("ALTER TABLE mobile_queue ADD COLUMN destination TEXT NOT NULL DEFAULT 'legacy'")}}
  fun open(context:Context,name:String="iilas-mobile.db"):MobileDatabase=Room.databaseBuilder(context.applicationContext,MobileDatabase::class.java,name).addMigrations(MIGRATION_1_2,MIGRATION_2_3).build()
 }
}
