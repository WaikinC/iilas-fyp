package com.iilas.fyp.driverdemo
import android.content.Context
import java.util.UUID
import java.util.concurrent.Executors

class MobileRuntime private constructor(private val application:Context) {
 val identity=MobileIdentity(MobileEnvironment.requireDebug(application))
 val database=MobileDatabase.open(application)
 val repository=MobileRepository(database,{identity.uid()},destination={identity.environment.spark?.partitionIdentity})
 val files=MobileFiles(application,repository)
 val transport=LocalMobileTransport(identity,MobileUpload(identity,repository,files))
 val coordinator=MobileSyncCoordinator(application)
 val executor=Executors.newSingleThreadExecutor()
 val trackingAdmission=MobileTrackingAdmission()
 fun stopTrackingImmediately(shipmentId:String?,reason:String){trackingAdmission.stop{stopTrackingHook?.invoke(shipmentId,reason)}}
 @Volatile var stopTrackingHook:((String?,String)->Unit)?=null
 @Volatile private var lastContext:MobileContext?=null
 private val preferences=application.getSharedPreferences(identity.environment.spark?.preferencesName?:"iilas-local-context",Context.MODE_PRIVATE)
 val installationId:String=preferences.getString("installationId",null)?:UUID.randomUUID().toString().also{preferences.edit().putString("installationId",it).commit()}
 val accessCache=MobileAccessCache(preferences){access->val owner=MobileContext(requireNotNull(access.scope),access.uid,installationId,identity.environment.spark?.partitionIdentity);if(identity.uid()==owner.uid && repository.readQueue(owner).any{it.state in setOf("Queued","Awaiting confirmation")})coordinator.requestDrain(owner)}
 @Volatile var trackingNotice:MobileTrackingNotice?=null
 init { identity.onAccessLost={val old=lastContext;accessCache.clearMemory();stopTrackingImmediately(null,"Signed out");transport.cancel();coordinator.cancel();if(old!=null)executor.execute{repository.quarantineAccount(old)}} }
 fun authorityLost(shipmentId:String?,reason:String="Access changed") {
  stopTrackingImmediately(shipmentId,reason)
  if(shipmentId!=null)return
  val uid=identity.uid();if(uid!=null)accessCache.invalidate(uid)
  transport.cancel();coordinator.cancel();val old=lastContext;if(old!=null)executor.execute{repository.quarantineAccount(old)}
  // A known authority failure must also survive process restart without
  // reusing a persisted native login plus stale Driver projection.
  identity.signOut()
 }
 fun access(refresh:Boolean):MobileAccess? {
  val uid=identity.uid()?:return null
  if(!refresh)return accessCache.read(uid)
  try {val value=MobileAccess.fromServer(uid,identity.command("getMobileAccessContext",emptyMap(),uid),System.currentTimeMillis());identity.requireUid(uid)
   if(value.scope!=null)saveScope(uid,value.scope)
   if(value.mode!="Driver")stopTrackingImmediately(null,"Driver access changed")
   accessCache.accept(value);return value
  }catch(error:Exception){identity.requireUid(uid);if(mobileFailure(error).kind==MobileFailureKind.Transient)return accessCache.read(uid)?.copy(online=false);authorityLost(null,"Access unavailable");throw error}
 }
 fun requireAccess(driver:Boolean=true):MobileContext {val access=requireNotNull(access(false));require(access.mode=="Driver"||!driver&&access.mode=="Recovery only");val owner=context();require(access.scope==owner.scope);return owner}
 fun context():MobileContext {val uid=requireNotNull(identity.uid());val scope=requireNotNull(preferences.getString("scope-$uid",null));return MobileContext(scope,uid,installationId,identity.environment.spark?.partitionIdentity).also{lastContext=it}}
 fun saveScope(uid:String,scope:String){identity.requireUid(uid);MobileContext(scope,uid,installationId);preferences.edit().putString("scope-$uid",scope).commit()}
 companion object { @Volatile private var instance:MobileRuntime?=null;@Synchronized fun get(context:Context):MobileRuntime=instance?:MobileRuntime(context.applicationContext).also{instance=it} }
}
