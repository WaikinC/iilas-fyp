package com.iilas.fyp.driverdemo
import org.json.JSONObject
import java.util.UUID

enum class MobileDrain {Idle,Retry,Stopped}
class MobileSyncEngine(private val repository:MobileRepository,private val transport:MobileTransport,private val authorityLost:(String?)->Unit={},private val active:()->Boolean={true}) {
 fun drain(context:MobileContext):MobileDrain {
  val worker=UUID.randomUUID().toString()
  repeat(25){
   try{repository.requireOwner(context)}catch(_:IllegalArgumentException){transport.cancel();return MobileDrain.Stopped}
   if(!active()){transport.cancel();return MobileDrain.Stopped}
   val row=repository.claimNext(context,worker)?:return MobileDrain.Idle
   try {
    fun transmit():JSONObject {
     if(row.action=="evidence.finalise" && !row.sentOnce)transport.upload(context,row)
     return try{transport.send(context,row)}catch(error:MobileFailure){if(row.action=="evidence.finalise" && error.kind==MobileFailureKind.MissingProof){transport.upload(context,row);transport.send(context,row)}else throw error}
    }
    val result=try{transmit()}catch(error:MobileFailure){if(error.kind==MobileFailureKind.Authentication){transport.refresh(context);transmit()}else throw error}
    repository.requireOwner(context);if(!active()){transport.cancel();repository.markAwaiting(context,row.operationId,worker,"Stopped");return MobileDrain.Stopped}
    MobileWire.validate(context,row,result,row.fileId?.let{repository.file(context,it)})
    repository.markResult(context,row.operationId,worker,result.toString())
    if(result.getString("state")=="Rejected" && result.optString("reason") in setOf("assignment_changed","delivery_closed","authority_changed"))authorityLost(row.shipmentId)
    // A confirmed server outcome remains confirmed even if local file cleanup
    // needs attention; it must never become an uncertain resend.
    try{transport.acknowledge(context,row,result)}catch(_:Exception){repository.noteCleanup(context,row.operationId)}
   }catch(error:Exception){
    try{repository.requireOwner(context)}catch(_:IllegalArgumentException){transport.cancel();return MobileDrain.Stopped}
    val failure=mobileFailure(error);transport.cancel()
    if(failure.kind in setOf(MobileFailureKind.Authentication,MobileFailureKind.Forbidden))authorityLost(null)
    try{repository.markAwaiting(context,row.operationId,worker,failure.kind.name,failure.kind!=MobileFailureKind.Transient || row.attempts+1>=8)}catch(_:IllegalArgumentException){return MobileDrain.Stopped}
    if(failure.kind in setOf(MobileFailureKind.Authentication,MobileFailureKind.Forbidden,MobileFailureKind.Stopped))return MobileDrain.Stopped
    if(failure.kind==MobileFailureKind.Transient && row.attempts+1<8)return MobileDrain.Retry
   }
  }
  return if(repository.readQueue(context).any{it.state in setOf("Queued","Awaiting confirmation")})MobileDrain.Retry else MobileDrain.Idle
 }
}
