package com.iilas.fyp.driverdemo
import androidx.room.*

@Dao interface MobileDao {
 @Query("SELECT * FROM mobile_cache WHERE partition=:partition ORDER BY shipmentId") fun cache(partition:String):List<MobileCache>
 @Insert(onConflict=OnConflictStrategy.REPLACE) fun saveCache(row:MobileCache)
 @Query("SELECT * FROM mobile_queue WHERE partition=:partition ORDER BY sequence,operationId") fun queue(partition:String):List<MobileQueueRow>
 @Query("SELECT * FROM mobile_queue WHERE operationId=:id") fun operation(id:String):MobileQueueRow?
 @Query("SELECT COALESCE(MAX(sequence),0) FROM mobile_queue WHERE partition=:partition") fun lastSequence(partition:String):Long
 @Query("SELECT COUNT(*) FROM mobile_queue WHERE action!='tracking.points' AND state NOT IN ('Synced','Discarded')") fun pendingActions():Int
 @Query("SELECT COALESCE(SUM(pointCount),0) FROM mobile_queue WHERE action='tracking.points' AND state NOT IN ('Synced','Discarded')") fun pendingPoints():Int
 @Insert(onConflict=OnConflictStrategy.ABORT) fun insert(row:MobileQueueRow)
 @Query("UPDATE mobile_queue SET state=:state,attempts=:attempts,sentOnce=:sentOnce,resultJson=:result,claimOwner=:claimOwner,lastError=:reason WHERE operationId=:id AND partition=:partition") fun mark(id:String,partition:String,state:String,attempts:Int,sentOnce:Boolean,result:String?,claimOwner:String?,reason:String?)
 @Query("UPDATE mobile_queue SET state='Awaiting confirmation',claimOwner=NULL WHERE state='Sending' AND partition=:partition") fun recoverSending(partition:String)
 @Query("SELECT * FROM mobile_sync WHERE partition=:partition") fun lease(partition:String):MobileSyncLease?
 @Insert(onConflict=OnConflictStrategy.REPLACE) fun saveLease(row:MobileSyncLease)
 @Query("DELETE FROM mobile_sync WHERE partition=:partition AND owner=:owner") fun releaseLease(partition:String,owner:String)
 @Query("SELECT * FROM mobile_files WHERE partition=:partition") fun files(partition:String):List<MobileFileRow>
 @Query("SELECT COUNT(*) FROM mobile_files") fun fileCount():Int
 @Query("SELECT COALESCE(SUM(bytes+256),0) FROM mobile_files") fun fileStorage():Long
 @Query("SELECT COALESCE(SUM(LENGTH(CAST(payloadJson AS BLOB))+COALESCE(LENGTH(CAST(resultJson AS BLOB)),0)+512),0) FROM mobile_queue") fun queueStorage():Long
 @Query("SELECT COALESCE(SUM(LENGTH(CAST(json AS BLOB))+128),0) FROM mobile_cache") fun cacheStorage():Long
 @Query("SELECT * FROM mobile_files WHERE fileId=:id AND partition=:partition") fun file(partition:String,id:String):MobileFileRow?
 @Insert(onConflict=OnConflictStrategy.ABORT) fun insertFile(row:MobileFileRow)
 @Query("UPDATE mobile_files SET bytes=:bytes,sha256=:sha256,state=:state WHERE fileId=:id AND partition=:partition") fun markFile(partition:String,id:String,bytes:Long,sha256:String,state:String)
 @Query("DELETE FROM mobile_files WHERE fileId=:id AND partition=:partition AND state='Draft'") fun deleteDraft(partition:String,id:String)
 @Query("DELETE FROM mobile_files WHERE fileId=:id AND partition=:partition AND sha256=:sha AND state='Registered'") fun deleteAcknowledgedFile(partition:String,id:String,sha:String)
 @Query("DELETE FROM mobile_queue WHERE partition=:partition AND operationId=:id AND state IN ('Synced','Discarded')") fun deleteHistory(partition:String,id:String)
 @Query("SELECT * FROM mobile_tracking WHERE partition=:partition") fun tracking(partition:String):MobileTrackingRow?
 @Insert(onConflict=OnConflictStrategy.REPLACE) fun saveTracking(row:MobileTrackingRow)
}
