package com.iilas.fyp.driverdemo
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
@RunWith(RobolectricTestRunner::class) @Config(sdk=[28],manifest=Config.NONE)
class MobileAccessCacheTest {
 @Test fun authoritativeRevocationErasesPersistedAndMemoryAccess(){val app:Context=ApplicationProvider.getApplicationContext();val prefs=app.getSharedPreferences("access",0);val cache=MobileAccessCache(prefs);val access=MobileAccess("driver","scope","Driver","Driver",1000);cache.accept(access);assertEquals("Driver",cache.read("driver")?.mode);cache.invalidate("driver");assertNull(cache.read("driver"));assertNull(MobileAccessCache(prefs).read("driver"));}
 @Test fun reestablishedOriginalDriverSchedulesOnlyThatAccountsDrain(){val app:Context=ApplicationProvider.getApplicationContext();val scheduled=mutableListOf<String>();val cache=MobileAccessCache(app.getSharedPreferences("resume",0)){scheduled.add(it.uid)};cache.accept(MobileAccess("driver","scope","Driver","Driver",1000));cache.clearMemory();cache.accept(MobileAccess("other","scope","Viewer","Recovery only",2000));assertEquals(listOf("driver"),scheduled);cache.accept(MobileAccess("driver","scope","Driver","Driver",3000));assertEquals(listOf("driver","driver"),scheduled);assertNull(cache.read("third"));}
}
