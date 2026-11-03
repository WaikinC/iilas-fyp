package com.iilas.fyp.driverdemo
import org.junit.Assert.*
import org.junit.Test

class LocationTrackingServiceTest {
 private fun lease()=TrackingLease.accept(1000000,2800000,15400000,1000,1000,1000000)
 private fun fix(at:Long)=TrackingFix(at,3.0,101.0,5.0)
 @Test fun noCaptureBeforeExplicitStartOrAfterNewProcess(){var stored=0;val state=TrackingState{stored++};assertNull(state.observe(fix(1000000),1000,1000000));assertEquals("Stopped",state.phase);assertEquals(0,stored)}
 @Test fun targetIntervalPersistsEachAdmittedPointFirst(){val saved=mutableListOf<TrackingPoint>();val state=TrackingState{saved.add(it)};state.start("s","00000000-0000-4000-8000-000000000001",lease());assertNotNull(state.observe(fix(1000000),1000,1000000));assertNull(state.observe(fix(1019999),20999,1019999));assertNotNull(state.observe(fix(1020000),21000,1020000));assertEquals(listOf(1L,2L),saved.map{it.sequence});assertEquals(2,saved.map{it.sampleId}.distinct().size)}
 @Test fun expiryOrClockDriftStopsInsteadOfExtendingOfflineCapture(){val saved=mutableListOf<TrackingPoint>();val state=TrackingState{saved.add(it)};state.start("s","00000000-0000-4000-8000-000000000001",lease());assertNull(state.observe(fix(2800000),1801000,2800000));assertEquals("Expired",state.phase);assertTrue(saved.isEmpty());val clock=TrackingState{saved.add(it)};clock.start("s","00000000-0000-4000-8000-000000000002",lease());assertNull(clock.observe(fix(1500000),21000,1500000));assertEquals("Needs review",clock.phase)}
 @Test fun fullStorageStopsWithoutAdmittingAnUnsavedSample(){val state=TrackingState{throw IllegalStateException("Full")};state.start("s","00000000-0000-4000-8000-000000000001",lease());assertNull(state.observe(fix(1000000),1000,1000000));assertEquals(0L,state.sequence);assertEquals("Needs review",state.phase);assertNull(state.observe(fix(1020000),21000,1020000))}
 @Test fun everyKnownStopConditionIsFinalUntilANewExplicitStart(){for(reason in listOf("Stopped by user","Permission removed","Signed out","Terminal action queued","Assignment changed","App restarted")){var saved=0;val state=TrackingState{saved++};state.start("s","00000000-0000-4000-8000-000000000001",lease());state.stop(reason);assertNull(state.observe(fix(1020000),21000,1020000));assertEquals("Stopped",state.phase);assertEquals(0,saved)}}
 @Test fun duplicateStartAndInvalidFixCannotCreateAnotherStream(){var saved=0;val state=TrackingState{saved++};state.start("s","00000000-0000-4000-8000-000000000001",lease());try{state.start("other","00000000-0000-4000-8000-000000000002",lease());fail("Duplicate stream")}catch(_:IllegalStateException){};assertNull(state.observe(TrackingFix(1000000,91.0,101.0,5.0),1000,1000000));assertEquals("s",state.shipmentId);assertEquals(0,saved)}
}
