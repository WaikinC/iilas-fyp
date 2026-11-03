package com.iilas.fyp.driverdemo
import org.junit.Assert.*
import org.junit.Test
class MobileIdentityFenceTest {
 @Test fun logoutAndSameUidReloginInvalidateOldCallbacks(){val f=MobileIdentityFence();val old=f.replace("driver");f.replace(null);f.replace("driver");assertFalse(f.isCurrent(old,"driver","driver"))}
}
