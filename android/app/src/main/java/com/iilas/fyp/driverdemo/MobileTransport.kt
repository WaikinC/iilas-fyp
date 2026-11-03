package com.iilas.fyp.driverdemo
import com.google.firebase.functions.FirebaseFunctionsException
import com.google.firebase.storage.StorageException
import com.google.android.gms.tasks.Tasks
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

enum class MobileFailureKind {Transient,Authentication,Forbidden,Conflict,MissingProof,Stopped}
class MobileFailure(val kind:MobileFailureKind):Exception(kind.name)
interface MobileTransport {
 fun send(context:MobileContext,row:MobileQueueRow):JSONObject
 fun upload(context:MobileContext,row:MobileQueueRow)
 fun refresh(context:MobileContext)
 fun cancel()
 fun acknowledge(context:MobileContext,row:MobileQueueRow,result:JSONObject) {}
}
fun mobileFailure(error:Throwable,proof:Boolean=false):MobileFailure {
 var cause=error;while(cause.cause!=null && cause !is FirebaseFunctionsException && cause !is StorageException && cause !is MobileFailure)cause=cause.cause!!
 if(cause is MobileFailure)return cause
 val kind=when(cause){
  is TimeoutException->MobileFailureKind.Transient
  is FirebaseFunctionsException->when(cause.code){
   FirebaseFunctionsException.Code.UNAUTHENTICATED->MobileFailureKind.Authentication
   FirebaseFunctionsException.Code.PERMISSION_DENIED->MobileFailureKind.Forbidden
   FirebaseFunctionsException.Code.NOT_FOUND->if(proof)MobileFailureKind.MissingProof else MobileFailureKind.Conflict
   FirebaseFunctionsException.Code.UNAVAILABLE,FirebaseFunctionsException.Code.DEADLINE_EXCEEDED,FirebaseFunctionsException.Code.INTERNAL,FirebaseFunctionsException.Code.ABORTED,FirebaseFunctionsException.Code.RESOURCE_EXHAUSTED->MobileFailureKind.Transient
   else->MobileFailureKind.Conflict
  }
  is StorageException->when(cause.errorCode){StorageException.ERROR_NOT_AUTHENTICATED->MobileFailureKind.Authentication;StorageException.ERROR_NOT_AUTHORIZED->MobileFailureKind.Forbidden;StorageException.ERROR_RETRY_LIMIT_EXCEEDED,StorageException.ERROR_UNKNOWN->MobileFailureKind.Transient;StorageException.ERROR_CANCELED->MobileFailureKind.Stopped;else->MobileFailureKind.Conflict}
  else->MobileFailureKind.Conflict
 };return MobileFailure(kind)
}
class LocalMobileTransport(private val identity:MobileIdentity,private val uploader:MobileUpload):MobileTransport {
 override fun send(context:MobileContext,row:MobileQueueRow):JSONObject = try {JSONObject(identity.command("mobileCommand",MobileRequest(row.operationId,row.action,row.payloadJson).wire(),context.uid))}catch(error:Exception){throw mobileFailure(error,row.action=="evidence.finalise")}
 override fun upload(context:MobileContext,row:MobileQueueRow){try{uploader.ensure(context,row)}catch(error:Exception){throw mobileFailure(error)}}
 override fun refresh(context:MobileContext){identity.requireUid(context.uid);Tasks.await(requireNotNull(identity.environment.auth.currentUser).getIdToken(true),15,TimeUnit.SECONDS);identity.requireUid(context.uid)}
 override fun cancel(){uploader.cancel();identity.cancelHttp()}
 override fun acknowledge(context:MobileContext,row:MobileQueueRow,result:JSONObject){if(row.action=="evidence.finalise" && result.getString("state")=="Committed")uploader.acknowledge(context,row,result)}
}
