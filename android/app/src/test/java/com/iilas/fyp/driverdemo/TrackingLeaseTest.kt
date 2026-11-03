package com.iilas.fyp.driverdemo
import org.junit.Assert.*
import org.junit.Test

class TrackingLeaseTest {
 private fun lease()=TrackingLease.accept(1000000,2800000,15400000,3000,1000,1002000)
 @Test fun expiryUsesMonotonicTimeAndSubtractsRequestLatency(){val l=lease();assertEquals(1801000L,l.deadlineElapsed);assertFalse(l.expired(1800999));assertTrue(l.expired(1801000));assertTrue(l.expired(999));assertFalse(l.clockValid(99999999,4000))}
 @Test fun renewAfterFiveMinutesNeverExtendsAbsoluteDeadline(){val l=lease();assertFalse(l.needsRenew(302999));assertTrue(l.needsRenew(303000));val renewed=l.renew(1300000,3100000,15400000,303000,301000,1302000);assertEquals(2101000L,renewed.deadlineElapsed);assertEquals(14401000L,renewed.absoluteDeadlineElapsed);assertEquals(l.absoluteDeadlineElapsed,renewed.absoluteDeadlineElapsed)}
 @Test fun changedServerDeadlineOrExpiredRenewalRefuse(){val l=lease();try{l.renew(1300000,3100000,15400001,303000,301000,1302000);fail("Changed absolute session accepted")}catch(_:IllegalArgumentException){};try{l.renew(3000000,4800000,15400000,2000000,1999999,3000000);fail("Expired capture resumed")}catch(_:IllegalArgumentException){}}
 @Test fun invalidDurationsAndBackwardsMonotonicObservationsRefuse(){for(run in listOf<()->Unit>({TrackingLease.accept(1000,1801001,14401000,1)},{TrackingLease.accept(1000,1801000,14401001,1)},{TrackingLease.accept(1000,1801000,14401000,10,11)})){try{run();fail("Unsafe lease accepted")}catch(_:IllegalArgumentException){}}}
}
