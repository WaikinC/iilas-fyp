package com.iilas.fyp.driverdemo
import org.junit.Assert.*
import org.junit.Test
class MobileTrackingAdmissionTest {
 @Test fun stopBeforeServiceHookInstallationFencesTheDelayedStart(){val admission=MobileTrackingAdmission();val ticket=admission.ticket();var starts=0;var stops=0;admission.stop{stops++};assertFalse(admission.install(ticket){starts++});assertEquals(0,starts);assertEquals(1,stops);assertTrue(admission.install(admission.ticket()){starts++});assertEquals(1,starts);}
 @Test fun stopAfterInstallationObservesTheInstalledSensorAndCannotBeUndone(){val admission=MobileTrackingAdmission();var sensor=false;val ticket=admission.ticket();assertTrue(admission.install(ticket){sensor=true});admission.stop{sensor=false};assertFalse(sensor);assertFalse(admission.install(ticket){sensor=true});assertFalse(sensor);}
}
