package com.iilas.fyp.driverdemo
import org.junit.Assert.*
import org.junit.Test
class MobileAccessTest {
 @Test fun accessProjectionCannotChangeUidScopeOrGrantAStaffRole(){
  val data=mapOf<String,Any?>("uid" to "driver","scope" to "scope","role" to "Driver","mode" to "Driver","protocol" to "mobile-command-1.0")
  assertEquals("Driver",MobileAccess.fromServer("driver",data,1000).mode)
  for(change in listOf(data+("uid" to "other"),data+("role" to "Admin"),data+("ownerId" to "foreign"))){try{MobileAccess.fromServer("driver",change,1000);fail("Forged native access") }catch(_:IllegalArgumentException){}}
 }
}
