package com.iilas.fyp.driverdemo
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.ColumnInfo
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID

fun mobileSha(bytes:ByteArray):String=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
fun mobileDerivedUUID(value:String):String {val bytes=MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8));bytes[6]=((bytes[6].toInt() and 15) or 64).toByte();bytes[8]=((bytes[8].toInt() and 63) or 128).toByte();val buffer=java.nio.ByteBuffer.wrap(bytes);return UUID(buffer.long,buffer.long).toString()}
data class MobileContext(val scope:String,val uid:String,val installationId:String,val destination:String?=null) {
 init { require(scope.matches(Regex("[A-Za-z0-9_-]{1,128}")) && uid.matches(Regex("[A-Za-z0-9_-]{1,128}")) && UUID.fromString(installationId).toString()==installationId) }
 init {if(destination!=null)require(destination.matches(Regex("spark-msi:fyp-inventory-and-logistics:[a-f0-9-]{36}:[a-f0-9]{64}")))}
 val partition:String get()=mobileSha(("fyp-inventory-and-logistics:$scope:$uid:$installationId"+(destination?.let{":$it"}?:"")).toByteArray(Charsets.UTF_8))
}
data class MobileRequest(val operationId:String,val action:String,val payloadJson:String) {
 init { require(UUID.fromString(operationId).toString()==operationId && operationId[14]=='4');require(action in setOf("tracking.start","tracking.renew","tracking.stop","tracking.points","delivery.update","evidence.prepare","evidence.finalise"));require(payloadJson.length in 2..32768 && payloadJson.toByteArray().size<=60000);JSONObject(payloadJson) }
 val requestSha256:String get()=mobileSha(payloadJson.toByteArray(Charsets.UTF_8))
 fun wire():Map<String,Any?> = mapOf("protocol" to "mobile-command-1.0","operationId" to operationId,"action" to action,"payloadJson" to payloadJson)
}
@Entity(tableName="mobile_cache",primaryKeys=["partition","shipmentId"])
data class MobileCache(val partition:String,val shipmentId:String,val json:String,val verifiedAtMs:Long)
@Entity(tableName="mobile_queue")
data class MobileQueueRow(@PrimaryKey val operationId:String,val partition:String,val shipmentId:String,val sequence:Long,val action:String,val payloadJson:String,val requestSha256:String,val dependenciesJson:String,val state:String,val createdAtMs:Long,val attempts:Int=0,val sentOnce:Boolean=false,val resultJson:String?=null,val fileId:String?=null,val claimOwner:String?=null,val lastError:String?=null,@ColumnInfo(defaultValue="0") val pointCount:Int=0,@ColumnInfo(defaultValue="'legacy'") val destination:String="legacy")
@Entity(tableName="mobile_files")
data class MobileFileRow(@PrimaryKey val fileId:String,val partition:String,val relativePath:String,val name:String,val contentType:String,val bytes:Long,val sha256:String,val state:String)
@Entity(tableName="mobile_sync")
data class MobileSyncLease(@PrimaryKey val partition:String,val processId:String,val owner:String,val untilElapsed:Long)
@Entity(tableName="mobile_tracking")
data class MobileTrackingRow(@PrimaryKey val partition:String,val json:String)
object MobileQuotaPolicy {fun requireFits(current:Long,added:Long){check(current>=0 && added>=0 && current<=125829120L && added<=125829120L-current){"Local storage full; no pending data was removed"}}}
