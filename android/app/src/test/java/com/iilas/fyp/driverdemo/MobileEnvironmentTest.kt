package com.iilas.fyp.driverdemo
import org.junit.Assert.*
import org.junit.Test

class MobileEnvironmentTest {
 @Test fun cloudRequiresAnExplicitProjectAndRealShapedOptions() {
  val project="iilas-cloud-fixture";val key="AI"+"za"+"x".repeat(35)
  MobileEnvironmentPolicy.validateCloud(true,project,"$project.firebasestorage.app","1:123456789012:android:1234567890abcdef",key,project,false)
  for(run in listOf<()->Unit>(
   { MobileEnvironmentPolicy.validateCloud(false,project,"$project.firebasestorage.app","1:123456789012:android:1234567890abcdef",key,project,false) },
   { MobileEnvironmentPolicy.validateCloud(true,project,"$project.firebasestorage.app","1:123456789012:android:1234567890abcdef",key,"other-project",false) },
   { MobileEnvironmentPolicy.validateCloud(true,project,"wrong.bucket","1:123456789012:android:1234567890abcdef",key,project,false) },
   { MobileEnvironmentPolicy.validateCloud(true,project,"$project.firebasestorage.app","1:123456789012:android:1234567890abcdef","emulator-test-only",project,false) },
   { MobileEnvironmentPolicy.validateCloud(true,project,"$project.firebasestorage.app","1:123456789012:android:1234567890abcdef",key,project,true) }
  )) { try {run();fail("Unsafe cloud profile accepted")} catch(_:IllegalArgumentException) {} }
 }
 @Test fun refusesReleaseCloudAndWrongPorts() {
  MobileEnvironmentPolicy.validate(true,"fyp-inventory-and-logistics","127.0.0.1",listOf(5001,8081,9099,9199))
  for (run in listOf<()->Unit>(
   { MobileEnvironmentPolicy.validate(false,"fyp-inventory-and-logistics","127.0.0.1",listOf(5001,8081,9099,9199)) },
   { MobileEnvironmentPolicy.validate(true,"other","127.0.0.1",listOf(5001,8081,9099,9199)) },
   { MobileEnvironmentPolicy.validate(true,"fyp-inventory-and-logistics","cloud.example",listOf(5001,8081,9099,9199)) },
   { MobileEnvironmentPolicy.validate(true,"fyp-inventory-and-logistics","127.0.0.1",listOf(5001,8080,9099,9199)) }
  )) { try { run(); fail("Unsafe environment accepted") } catch (_:IllegalArgumentException) {} }
 }
 @Test fun accountSwitchFencesLateResultsAndWebUidDrift() {
  val fence=MobileIdentityFence();val original=fence.replace("a")
  assertTrue(fence.isCurrent(original,"a","a"));assertFalse(fence.isCurrent(original,"a","b"))
  fence.replace("b");assertFalse(fence.isCurrent(original,"a","a"))
  val current=fence.replace("b");fence.replace(null);assertFalse(fence.isCurrent(current,"b","b"))
 }
}
