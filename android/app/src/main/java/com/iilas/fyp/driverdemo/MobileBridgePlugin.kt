package com.iilas.fyp.driverdemo

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import android.Manifest
import android.content.Intent
import android.app.Activity
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import com.getcapacitor.annotation.ActivityCallback
import org.json.JSONObject
import java.util.UUID
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import java.util.concurrent.Executors

@CapacitorPlugin(name="IilasMobile",permissions=[Permission(alias="location",strings=[Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION]),Permission(alias="notifications",strings=[Manifest.permission.POST_NOTIFICATIONS])])
class MobileBridgePlugin:Plugin() {
 private val executor=Executors.newSingleThreadExecutor()
 private val identity:MobileIdentity by lazy { MobileRuntime.get(context).identity }
 private fun background(call:PluginCall,work:()->Map<String,Any?>){executor.execute { try { call.resolve(JSObject.fromJSONObject(org.json.JSONObject(work()))) } catch(error:Exception){if(mobileFailure(error).kind in setOf(MobileFailureKind.Authentication,MobileFailureKind.Forbidden))runtime().authorityLost(null);call.reject("Local Android operation unavailable. Check your account, USB connection and saved queue.")} }}
 @PluginMethod fun getEnvironment(call:PluginCall)=background(call){identity.environment.dto()}
 @PluginMethod fun signIn(call:PluginCall)=background(call){val uid=identity.signIn(requireNotNull(call.getString("email")),requireNotNull(call.getString("password")));mapOf("uid" to uid)}
 @PluginMethod fun establishWebSession(call:PluginCall)=background(call){identity.establishWebSession()}
 @PluginMethod fun getSession(call:PluginCall)=background(call){val runtime=MobileRuntime.get(context);val access=runtime.access(call.getBoolean("refresh",false)==true);mapOf("uid" to identity.uid(),"access" to access?.dto())}
 @PluginMethod fun signOut(call:PluginCall){identity.signOut();call.resolve(JSObject().put("signedOut",true))}
 private fun exact(call:PluginCall,required:Set<String>,optional:Set<String> = emptySet()){val keys=call.data.keys().asSequence().toSet();require(keys.containsAll(required) && keys.all{it in required||it in optional})}
 private fun runtime()=MobileRuntime.get(context)
 private fun driver():MobileContext=runtime().requireAccess()
 private fun recovery():MobileContext=runtime().requireAccess(false)
 @PluginMethod fun readAssignments(call:PluginCall)=background(call){exact(call,emptySet(),setOf("cursor"));val r=runtime();MobilePresentation(r.repository).page(driver(),call.getString("cursor"))}
 @PluginMethod fun refreshAssignments(call:PluginCall)=background(call){
  exact(call,emptySet(),setOf("cursor"));val r=runtime();r.access(true);val owner=driver();val input=call.getString("cursor")?.let{mapOf("cursor" to it)}?:emptyMap()
  val value=MobileProjection.page(JSONObject(identity.command("getMobileAssignments",input,owner.uid)));r.repository.requireOwner(owner);val items=value.getJSONArray("items");r.repository.cacheAssignments(owner,(0 until items.length()).map{items.getJSONObject(it).toString()},value.getLong("verifiedAtMs"));mobileMap(value)+("cached" to false)
 }
 @PluginMethod fun readShipment(call:PluginCall)=background(call){
  exact(call,setOf("shipmentId"),setOf("refresh"));val r=runtime();val owner=driver();val id=requireNotNull(call.getString("shipmentId"));val refresh=call.getBoolean("refresh",false)==true
  if(refresh){val value=MobileProjection.shipment(JSONObject(identity.command("getMobileShipment",mapOf("shipmentId" to id),owner.uid)));require(value.getString("id")==id);r.repository.cacheAssignments(owner,listOf(value.toString()),System.currentTimeMillis())}
  MobilePresentation(r.repository).detail(owner,id,!refresh)
 }
 @PluginMethod fun readQueue(call:PluginCall)=background(call){exact(call,emptySet(),setOf("cursor"));val r=runtime();val owner=recovery();r.files.reconcileInterrupted(owner);r.repository.pruneHistory(owner);MobilePresentation(r.repository).queue(owner,call.getInt("cursor",0)!!)}
 @PluginMethod fun enqueueStatus(call:PluginCall)=background(call){
  exact(call,setOf("shipmentId","status","notes","proofId"));val r=runtime();val owner=driver();val row=MobileLocalCommands(r.repository,r.files){id->r.stopTrackingImmediately(id,"Terminal action queued")}.enqueueStatus(owner,requireNotNull(call.getString("shipmentId")),requireNotNull(call.getString("status")),requireNotNull(call.getString("notes")),call.getString("proofId"));r.coordinator.requestDrain(owner);mapOf("operationId" to row.operationId,"state" to "Queued")
 }
 @PluginMethod fun enqueueProof(call:PluginCall)=background(call){
  exact(call,setOf("shipmentId","draftFileId"));val r=runtime();val owner=driver();val queued=MobileLocalCommands(r.repository,r.files).enqueueProof(owner,requireNotNull(call.getString("shipmentId")),requireNotNull(call.getString("draftFileId")));r.coordinator.requestDrain(owner);mapOf("prepareOperationId" to queued.prepareOperationId,"finaliseOperationId" to queued.finaliseOperationId,"evidenceId" to queued.evidenceId,"name" to queued.name,"state" to "Queued")
 }
 @PluginMethod fun retry(call:PluginCall)=background(call){
  exact(call,setOf("operationId"),setOf("checkOnly"));val r=runtime();val owner=recovery();val id=requireNotNull(call.getString("operationId"))
  if(call.getBoolean("checkOnly",false)==true){val worker=UUID.randomUUID().toString();val row=requireNotNull(r.repository.claimOutcome(owner,id,worker)){"Another synchronisation is running"};try{val result=JSONObject(identity.command("resolveMobileCommand",MobileRequest(row.operationId,row.action,row.payloadJson).wire(),owner.uid));MobileWire.validate(owner,row,result,row.fileId?.let{r.database.dao().file(owner.partition,it)});r.repository.markResult(owner,id,worker,result.toString());try{r.transport.acknowledge(owner,row,result)}catch(_:Exception){r.repository.noteCleanup(owner,id)}}catch(error:Exception){r.repository.markAwaiting(owner,id,worker,mobileFailure(error).kind.name,true);throw error}}
  else {require(r.access(false)?.mode=="Driver");r.repository.retry(owner,id);r.coordinator.requestDrain(owner)}
  mapOf("requested" to true)
 }
 @PluginMethod fun discard(call:PluginCall)=background(call){exact(call,emptySet(),setOf("operationId","draftFileId"));val r=runtime();val owner=recovery();val id=call.getString("operationId");val file=call.getString("draftFileId");require((id==null)!=(file==null));if(id!=null)MobileLocalCommands(r.repository,r.files).discard(owner,id) else r.files.discardDraft(owner,requireNotNull(file));mapOf("discarded" to true)}
 private var picking:Pair<MobileContext,Long>?=null
 @PluginMethod fun chooseProofFile(call:PluginCall){try{exact(call,emptySet());val owner=driver();check(picking==null);picking=owner to identity.fence.ticket();val intent=Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").putExtra(Intent.EXTRA_MIME_TYPES,arrayOf("application/pdf","image/jpeg","image/png","image/webp"));startActivityForResult(call,intent,"proofPicked")}catch(_:Exception){picking=null;call.reject("File selection unavailable")}}
 @ActivityCallback private fun proofPicked(call:PluginCall?,result:ActivityResult){val original=picking;picking=null;if(call==null)return;if(result.resultCode!=Activity.RESULT_OK||result.data?.data==null||original==null){call.reject("No file selected");return};val uri=result.data!!.data!!
  background(call){val (owner,ticket)=original;val r=runtime();require(identity.fence.isCurrent(ticket,identity.uid(),owner.uid));require(driver()==owner);val resolver=context.contentResolver;val mime=requireNotNull(resolver.getType(uri));var name="proof";resolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use{if(it.moveToFirst())name=it.getString(0)};val file=resolver.openInputStream(uri)!!.use{r.files.copy(owner,it,name,mime)};require(identity.fence.isCurrent(ticket,identity.uid(),owner.uid));MobilePresentation(r.repository).draft(file)}
 }
 private fun visible():Boolean=activity!=null && activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
 private fun locationGranted():Boolean=ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED || ContextCompat.checkSelfPermission(context,Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED
 @PluginMethod fun startTracking(call:PluginCall){
  if(!visible()){call.reject("Open the driver app before starting tracking.");return}
  if(!locationGranted()){requestPermissionForAlias("location",call,"locationPermissionResult");return}
  notificationPermissionResult(call)
 }
 @PermissionCallback private fun locationPermissionResult(call:PluginCall){if(!locationGranted()){call.reject("Location permission is required; tracking did not start.");return};notificationPermissionResult(call)}
 @PermissionCallback private fun notificationPermissionResult(call:PluginCall){
  if(!visible()){call.reject("Return to the driver app and press Start.");return}
  if(Build.VERSION.SDK_INT>=33 && ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
   if(call.getBoolean("notificationRequested",false)==true){call.reject("Allow the visible tracking notification before starting.");return}
   call.data.put("notificationRequested",true);requestPermissionForAlias("notifications",call,"notificationPermissionResult");return
  }
  background(call){val runtime=MobileRuntime.get(context);MobileTrackingController(runtime).start(requireNotNull(call.getString("shipmentId")),{visible()&&locationGranted()}){operation,elapsed->
   ContextCompat.startForegroundService(context,Intent(context,LocationTrackingService::class.java).setAction(LocationTrackingService.START).putExtra("operationId",operation).putExtra("requestStartedElapsed",elapsed))
  }}
 }
 @PluginMethod fun stopTracking(call:PluginCall){runtime().stopTrackingImmediately(null,"Stopped by user");background(call){recovery();MobileTrackingController(runtime()).stop()}}
 @PluginMethod fun readTracking(call:PluginCall)=background(call){recovery();MobileTrackingController(runtime()).read()}
 override fun handleOnDestroy(){executor.shutdownNow();super.handleOnDestroy()}
}
