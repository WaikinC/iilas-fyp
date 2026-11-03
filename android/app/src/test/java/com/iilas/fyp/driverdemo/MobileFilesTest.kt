package com.iilas.fyp.driverdemo
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.ByteArrayInputStream
import java.util.UUID

@RunWith(RobolectricTestRunner::class) @Config(sdk=[28],manifest=Config.NONE)
class MobileFilesTest {
 @Test fun selectedFileIsCopiedAndHashedBeforeOriginalUriDisappears() = mobileOnWorker {
  val ctx:Context=ApplicationProvider.getApplicationContext();val db=MobileDatabase.open(ctx,"files-${UUID.randomUUID()}.db");var uid:String?="driver";val repo=MobileRepository(db,{uid},"process");val owner=MobileContext("scope","driver",UUID.randomUUID().toString());val files=MobileFiles(ctx,repo)
  val source=ByteArrayInputStream("%PDF-1.4 ordinary proof".toByteArray());val file=files.copy(owner,source,"proof.pdf","application/pdf");source.close();assertEquals(23,file.bytes.toInt());assertTrue(files.verify(owner,file.fileId).isFile)
  files.verify(owner,file.fileId).appendText("changed");try{files.verify(owner,file.fileId);fail("Changed private bytes") }catch(_:IllegalStateException){}
  uid="other";try{files.verify(owner,file.fileId);fail("Cross-account file") }catch(_:IllegalArgumentException){};db.close()
 }
 @Test fun fileAndTotalCapsDoNotEvictPendingFiles() = mobileOnWorker {
  val ctx:Context=ApplicationProvider.getApplicationContext();val db=MobileDatabase.open(ctx,"files-cap-${UUID.randomUUID()}.db");val repo=MobileRepository(db,{"driver"},"process");val owner=MobileContext("scope","driver",UUID.randomUUID().toString());val files=MobileFiles(ctx,repo)
  repeat(10){files.copy(owner,ByteArrayInputStream("%PDF-1.4".toByteArray()),"p.pdf","application/pdf")};try{files.copy(owner,ByteArrayInputStream(byteArrayOf(1)),"p.pdf","application/pdf");fail("File cap") }catch(_:IllegalStateException){}
  MobileQuotaPolicy.requireFits(125829119,1);try{MobileQuotaPolicy.requireFits(125829120,1);fail("Byte cap") }catch(_:IllegalStateException){};db.close()
 }
 @Test fun quarantinedAccountsStillCountAgainstTheAppFileLimit() = mobileOnWorker {
  val ctx:Context=ApplicationProvider.getApplicationContext();val db=MobileDatabase.open(ctx,"global-cap-${UUID.randomUUID()}.db");var uid:String?="driver";val repo=MobileRepository(db,{uid},"process");val installation=UUID.randomUUID().toString();val first=MobileContext("scope","driver",installation);val files=MobileFiles(ctx,repo)
  repeat(10){files.copy(first,ByteArrayInputStream("%PDF-1.4".toByteArray()),"p.pdf","application/pdf")};uid="other";val other=MobileContext("scope","other",installation)
  try{files.copy(other,ByteArrayInputStream("%PDF-1.4".toByteArray()),"p.pdf","application/pdf");fail("Another account bypassed total storage caps")}catch(_:IllegalStateException){};db.close()
 }
 @Test fun interruptedCopyCleansOnlyItsOwnDraft() = mobileOnWorker {
  val ctx:Context=ApplicationProvider.getApplicationContext();val db=MobileDatabase.open(ctx,"i.db");var uid:String?="driver";val repo=MobileRepository(db,{uid},"process");val owner=MobileContext("scope","driver",UUID.randomUUID().toString());val files=MobileFiles(ctx,repo)
  val source=object:ByteArrayInputStream("%PDF-1.4".toByteArray()){override fun read(buffer:ByteArray,offset:Int,length:Int):Int {uid="other";return super.read(buffer,offset,length)}}
  try{files.copy(owner,source,"p.pdf","application/pdf");fail("Account change was ignored")}catch(_:IllegalArgumentException){};uid="driver";assertTrue(db.dao().files(owner.partition).isEmpty());db.close()
 }
 @Test fun processDeathPartialCopyIsRecoverableWithoutDeletingCompleteDraft() = mobileOnWorker {
  val ctx:Context=ApplicationProvider.getApplicationContext();val db=MobileDatabase.open(ctx,"death.db");val repo=MobileRepository(db,{"driver"},"process");val owner=MobileContext("scope","driver",UUID.randomUUID().toString());val files=MobileFiles(ctx,repo);val complete=files.copy(owner,ByteArrayInputStream("%PDF-complete".toByteArray()),"p.pdf","application/pdf");val id=UUID.randomUUID().toString();repo.reserveFile(owner,id,"partial.pdf","application/pdf",owner.partition+"/"+id);val partial=java.io.File(ctx.filesDir,"mobile-proofs/"+owner.partition+"/"+id);partial.writeText("partial");files.reconcileInterrupted(owner);assertFalse(partial.exists());assertEquals(listOf(complete.fileId),db.dao().files(owner.partition).map{it.fileId});assertTrue(files.verify(owner,complete.fileId).isFile);db.close()
 }
 @Test fun fileCreationFailureDoesNotLeaveAnInvisibleQuotaReservation() = mobileOnWorker {
  val ctx:Context=ApplicationProvider.getApplicationContext();val db=MobileDatabase.open(ctx,"creation.db");val repo=MobileRepository(db,{"driver"},"process");val owner=MobileContext("scope","driver",UUID.randomUUID().toString());java.io.File(ctx.filesDir,"mobile-proofs").writeText("block directory creation");try{MobileFiles(ctx,repo).copy(owner,ByteArrayInputStream(byteArrayOf(1)),"p.pdf","application/pdf");fail("Creation should fail")}catch(_:Exception){};assertTrue(db.dao().files(owner.partition).isEmpty());db.close()
 }

}
