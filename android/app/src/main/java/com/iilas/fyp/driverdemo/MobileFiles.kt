package com.iilas.fyp.driverdemo
import android.content.Context
import java.io.File
import java.io.InputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.UUID

class MobileFiles(private val app:Context,private val repository:MobileRepository) {
 private val copying=java.util.concurrent.ConcurrentHashMap.newKeySet<String>()
 private val root=File(app.filesDir,"mobile-proofs")
 private fun ownedFile(context:MobileContext,path:String):File {
  require(path.matches(Regex("[a-f0-9]{64}/[a-f0-9-]{36}")) && path.startsWith(context.partition+"/"));val file=File(root,path)
  require(file.canonicalPath==file.absolutePath && file.canonicalPath.startsWith(root.canonicalPath+File.separator));return file
 }
 fun copy(context:MobileContext,source:InputStream,name:String,mime:String):MobileFileRow {
  repository.requireOwner(context);require(name.length in 1..180 && !name.contains(Regex("[\\\\/\\x00-\\x1f]")) && mime in setOf("application/pdf","image/jpeg","image/png","image/webp"))
  val id=UUID.randomUUID().toString();val path="${context.partition}/$id";val row=repository.reserveFile(context,id,name,mime,path);val file=ownedFile(context,path);var created=false;copying.add(id)
  try {
   check(file.parentFile!!.isDirectory||file.parentFile!!.mkdirs());check(file.createNewFile()){"Refuse to overwrite another private file"};created=true
   val digest=MessageDigest.getInstance("SHA-256");var size=0L
   FileOutputStream(file).use { target->val buffer=ByteArray(65536);while(true){repository.requireOwner(context);val n=source.read(buffer);if(n<0)break;if(n==0)continue;size+=n;check(size<=10485760){"Evidence exceeds10MiB"};digest.update(buffer,0,n);target.write(buffer,0,n)};target.fd.sync() }
   check(size>0);repository.requireOwner(context);repository.completeFile(context,id,size,digest.digest().joinToString(""){"%02x".format(it)});return repository.file(context,id)
  }catch(error:Exception){if(created&&file.exists())file.delete();repository.abandonCopy(context,row.fileId);throw error}finally{copying.remove(id)}
 }
 fun verify(context:MobileContext,id:String):File {
  repository.requireOwner(context);val row=repository.file(context,id);val file=ownedFile(context,row.relativePath);check(file.isFile && file.length()==row.bytes && row.bytes in 1..10485760)
  val digest=MessageDigest.getInstance("SHA-256");file.inputStream().use{input->val buffer=ByteArray(65536);while(true){repository.requireOwner(context);val n=input.read(buffer);if(n<0)break;digest.update(buffer,0,n)}}
  check(digest.digest().joinToString(""){"%02x".format(it)}==row.sha256){"Private evidence bytes changed"};return file
 }
 fun reconcileInterrupted(context:MobileContext){
  repository.requireOwner(context)
  for(row in repository.database.dao().files(context.partition))if(row.state=="Draft" && row.sha256.isEmpty() && row.fileId !in copying && repository.readQueue(context).none{it.fileId==row.fileId}){
   val file=ownedFile(context,row.relativePath);check(!file.exists()||file.isFile&&file.length()<=row.bytes);if(file.exists())check(file.delete());repository.abandonCopy(context,row.fileId)
  }
 }
 fun discardDraft(context:MobileContext,id:String){repository.requireOwner(context);val row=repository.file(context,id);check(row.state=="Draft" && repository.readQueue(context).none{it.fileId==id && it.state!="Discarded"});val file=verify(context,id);check(file.delete());repository.removeDraft(context,id)}
 fun acknowledge(context:MobileContext,id:String,sha:String){
  repository.requireOwner(context);val row=repository.file(context,id);require(row.sha256==sha)
  val receipt=repository.readQueue(context).any{it.action=="evidence.finalise" && it.fileId==id && it.state=="Synced" && org.json.JSONObject(requireNotNull(it.resultJson)).getJSONObject("data").optString("sha256")==sha};check(receipt)
  val file=ownedFile(context,row.relativePath);if(file.exists())verify(context,id)
  repository.database.dao().markFile(context.partition,id,row.bytes,row.sha256,"Registered");repository.requireOwner(context)
  check(!file.exists()||file.delete()){"Local file cleanup needs attention"};repository.deleteAcknowledgedFile(context,id,sha)
 }
}
