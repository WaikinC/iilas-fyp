package com.iilas.fyp.driverdemo
import android.content.Context
import androidx.work.*
import java.util.concurrent.TimeUnit

class MobileSyncCoordinator(private val application:Context) {
 fun requestDrain(context:MobileContext){
  val input=Data.Builder().putString("uid",context.uid).putString("scope",context.scope).putString("installationId",context.installationId).putString("destination",context.destination).build()
  val request=OneTimeWorkRequestBuilder<MobileSyncWorker>().setInputData(input).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).addTag("iilas-mobile").build()
  // One unique serial chain avoids KEEP's enqueue-vs-finishing race. Room's
  // lease is still the authority when an explicit foreground drain overlaps.
  WorkManager.getInstance(application).enqueueUniqueWork("iilas-sync-${context.partition}",ExistingWorkPolicy.APPEND_OR_REPLACE,request)
 }
 fun cancel(){WorkManager.getInstance(application).cancelAllWorkByTag("iilas-mobile")}
}
