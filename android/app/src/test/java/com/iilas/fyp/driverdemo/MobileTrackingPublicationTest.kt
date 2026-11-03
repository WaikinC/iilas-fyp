package com.iilas.fyp.driverdemo
import org.junit.Assert.*
import org.junit.Test
class MobileTrackingPublicationTest {
 @Test fun fullDiskStopsSensorsBeforeAttemptingOptionalStatePublication(){val order=mutableListOf<String>();val state=TrackingState{throw IllegalStateException("full")};state.start("s","00000000-0000-4000-8000-000000000001",TrackingLease.accept(1000000,2800000,15400000,1000,1000,1000000));MobileTrackingPublication.observed(state,{state.observe(TrackingFix(1000000,3.0,101.0,5.0),1000,1000000)},{order.add("persist");throw IllegalStateException("full")},{order.add("stop")},{order.add("drain")});assertEquals(listOf("stop","persist"),order);assertEquals("Needs review",state.phase);}
 @Test fun publicationFailureAlsoStopsAnOtherwiseAdmittedStream(){var stopped=false;val state=TrackingState{};state.start("s","00000000-0000-4000-8000-000000000001",TrackingLease.accept(1000000,2800000,15400000,1000,1000,1000000));MobileTrackingPublication.observed(state,{},{throw IllegalStateException("full")},{stopped=true},{});assertTrue(stopped);assertEquals("Needs review",state.phase);}
}
