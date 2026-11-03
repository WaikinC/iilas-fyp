package com.iilas.fyp.driverdemo
import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

class MobileSyncWorker(context:Context,parameters:WorkerParameters):Worker(context,parameters) {
 private var transport:MobileTransport?=null
 override fun doWork():Result {
  return try {
   val runtime=MobileRuntime.get(applicationContext);val context=MobileContext(requireNotNull(inputData.getString("scope")),requireNotNull(inputData.getString("uid")),requireNotNull(inputData.getString("installationId")),inputData.getString("destination"))
   runtime.repository.requireOwner(context);transport=runtime.transport
   when(MobileSyncEngine(runtime.repository,runtime.transport,authorityLost={runtime.authorityLost(it)}){!isStopped}.drain(context)){MobileDrain.Retry->Result.retry();MobileDrain.Idle,MobileDrain.Stopped->Result.success()}
  }catch(_:Exception){Result.failure()}
 }
 override fun onStopped(){transport?.cancel();super.onStopped()}
}
