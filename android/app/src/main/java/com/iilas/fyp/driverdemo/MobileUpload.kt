package com.iilas.fyp.driverdemo
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.firebase.storage.StorageException
import com.google.firebase.storage.StorageMetadata
import com.google.firebase.storage.UploadTask
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class MobileStorageObject(val path:String,val bytes:Long,val contentType:String,val generation:String,val metadata:Map<String,String>)
object MobileUploadPolicy {
 fun verifyExisting(expected:MobileStorageObject,actual:MobileStorageObject){require(actual.path==expected.path && actual.bytes==expected.bytes && actual.contentType==expected.contentType && actual.generation.isNotEmpty() && expected.metadata.all{actual.metadata[it.key]==it.value}){"Existing proof differs; no overwrite permitted"}}
}
class MobileUpload(private val identity:MobileIdentity,private val repository:MobileRepository,private val files:MobileFiles) {
 @Volatile private var activeTask:UploadTask?=null
 fun cancel(){activeTask?.cancel()}
 fun ensure(context:MobileContext,row:MobileQueueRow){
  repository.requireOwner(context);val file=repository.file(context,requireNotNull(row.fileId));val payload=JSONObject(row.payloadJson)
  val preparation=requireNotNull(repository.database.dao().operation(payload.getString("prepareOperationId")));require(preparation.partition==context.partition && preparation.action=="evidence.prepare" && preparation.state=="Synced")
  val prepared=JSONObject(requireNotNull(preparation.resultJson));MobileWire.validate(context,preparation,prepared,file)
  val data=prepared.getJSONObject("data");val meta=data.getJSONObject("metadata");val metadata=meta.keys().asSequence().associateWith{meta.getString(it)}
  val expected=MobileStorageObject(data.getString("path"),file.bytes,file.contentType,"reserved",metadata)
  if(identity.environment.spark!=null){val copy=files.verify(context,file.fileId);val result=identity.withHttp(context.uid){it.upload("mobile",payload.getString("prepareOperationId"),copy,file.contentType)};repository.requireOwner(context);MobileUploadPolicy.verifyExisting(expected,result);return}
  val target=requireNotNull(identity.environment.storage).reference.child(expected.path)
  fun existing():StorageMetadata?=try{Tasks.await(target.metadata,10,TimeUnit.SECONDS)}catch(error:Exception){var c:Throwable=error;while(c.cause!=null && c !is StorageException)c=c.cause!!;if(c is StorageException && c.errorCode==StorageException.ERROR_OBJECT_NOT_FOUND)null else throw error}
  fun check(value:StorageMetadata){MobileUploadPolicy.verifyExisting(expected,MobileStorageObject(expected.path,value.sizeBytes,value.contentType?:"",value.generation?:"",value.customMetadataKeys.associateWith{value.getCustomMetadata(it)?:""}))}
  existing()?.let{check(it);return}
  val copy=files.verify(context,file.fileId);identity.requireUid(context.uid)
  val builder=StorageMetadata.Builder().setContentType(file.contentType);metadata.forEach{(k,v)->builder.setCustomMetadata(k,v)}
  val upload=target.putFile(Uri.fromFile(copy),builder.build());activeTask=upload
  try{Tasks.await(upload,45,TimeUnit.SECONDS);repository.requireOwner(context);check(requireNotNull(existing()))}catch(error:Exception){upload.cancel();throw error}finally{activeTask=null}
 }
 fun acknowledge(context:MobileContext,row:MobileQueueRow,result:JSONObject){files.acknowledge(context,requireNotNull(row.fileId),result.getJSONObject("data").getString("sha256"))}
}
