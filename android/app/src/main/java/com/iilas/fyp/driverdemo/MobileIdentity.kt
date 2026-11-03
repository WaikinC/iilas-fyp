package com.iilas.fyp.driverdemo

import com.google.android.gms.tasks.Tasks
import java.util.concurrent.TimeUnit

class MobileIdentityFence {
 private var generation=0L
 private var uid:String?=null
 @Synchronized fun replace(next:String?):Long { generation++;uid=next;return generation }
 @Synchronized fun ticket():Long=generation
 @Synchronized fun isCurrent(ticket:Long,nativeUid:String?,webUid:String?):Boolean = uid!=null && generation==ticket && uid==nativeUid && uid==webUid
}
class MobileIdentity(val environment:MobileEnvironment) {
 @Volatile private var http:MobileHttpBackend?=null
 fun cancelHttp(){http?.cancel()}
 fun <T> withHttp(original:String,work:(MobileHttpBackend)->T):T {
  requireUid(original);val ticket=fence.ticket();val destination=requireNotNull(environment.spark)
  val backend=MobileHttpBackend(destination.apiOrigin,destination.backendInstanceId,{requireUid(original);val result=Tasks.await(requireNotNull(environment.auth.currentUser).getIdToken(true),30,TimeUnit.SECONDS);requireUid(original);requireNotNull(result.token)},{fence.isCurrent(ticket,uid(),original)})
  http=backend;return try{work(backend).also{requireUid(original);require(fence.isCurrent(ticket,uid(),original))}}finally{if(http===backend)http=null}
 }
 val fence=MobileIdentityFence()
 @Volatile var onAccessLost:(()->Unit)?=null
 init { var seen=environment.auth.currentUser?.uid;fence.replace(seen);environment.auth.addAuthStateListener { auth -> val next=auth.currentUser?.uid;if(next!=seen){seen=next;fence.replace(next);onAccessLost?.invoke()} } }
 fun uid():String?=environment.auth.currentUser?.uid
 fun requireUid(original:String):String { require(uid()==original) { "Account changed" };return original }
 fun signIn(email:String,password:String):String {
  require(email.length in 3..254 && password.length in 1..4096)
  onAccessLost?.invoke();fence.replace(null)
  val result=Tasks.await(environment.auth.signInWithEmailAndPassword(email,password),30,TimeUnit.SECONDS)
  val uid=requireNotNull(result.user?.uid);requireUid(uid);fence.replace(uid);return uid
 }
 fun command(action:String,input:Map<String,Any?>,original:String):Map<String,Any?> {
  requireUid(original)
  val ticket=fence.ticket()
  require(action in setOf("getMobileAvailability","getMobileAccessContext","mintMobileWebSession","getMobileAssignments","getMobileShipment","mobileCommand","resolveMobileCommand"))
  val data=if(environment.spark!=null)withHttp(original){it.command(action,input)} else Tasks.await(requireNotNull(environment.functions).getHttpsCallable("command").call(mapOf("action" to action,"input" to input)),30,TimeUnit.SECONDS).data
  requireUid(original)
  require(fence.isCurrent(ticket,uid(),original)){"Account lifecycle changed"}
  @Suppress("UNCHECKED_CAST") val result=data as? Map<String,Any?> ?: throw IllegalStateException("Invalid local server reply")
  return result
 }
 fun establishWebSession():Map<String,Any?> {
  val original=requireNotNull(uid());val ticket=fence.ticket();val result=command("mintMobileWebSession",emptyMap(),original)
  require(result.keys==setOf("uid","customToken") && result["uid"]==original && result["customToken"] is String && fence.isCurrent(ticket,uid(),original)) { "Account handoff changed" }
  return result
 }
 fun signOut(){onAccessLost?.invoke();fence.replace(null);environment.auth.signOut()}
}
