package com.iilas.fyp.driverdemo
import android.app.Service
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class) @Config(sdk=[28],manifest=Config.NONE)
class TrackingServiceLifecycleTest {
 @Test fun missingStartIntentCannotResumeCaptureAfterProcessRecreation(){
  val controller=Robolectric.buildService(LocationTrackingService::class.java).create();assertEquals(Service.START_NOT_STICKY,controller.get().onStartCommand(null,0,1));controller.destroy()
 }
}
