package com.iilas.fyp.driverdemo
import org.junit.Assert.*
import org.junit.Test

class MobileUploadTest {
 @Test fun existingObjectMustMatchTheOriginalReservedBytesAndMetadata() {
  val expected=MobileStorageObject("evidence/scope/s/00000000-0000-4000-8000-000000000001",20,"application/pdf","1",mapOf("actor" to "driver","sha256" to "a".repeat(64),"mobilePrepareId" to "00000000-0000-4000-8000-000000000002"))
  MobileUploadPolicy.verifyExisting(expected,expected)
  for(other in listOf(expected.copy(bytes=21),expected.copy(path="evidence/other/s/id"),expected.copy(contentType="text/html"),expected.copy(metadata=expected.metadata+("actor" to "other")),expected.copy(metadata=expected.metadata+("sha256" to "b".repeat(64))))) {
   try{MobileUploadPolicy.verifyExisting(expected,other);fail("Conflicting object accepted")}catch(_:IllegalArgumentException){}
  }
 }
}
