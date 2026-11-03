package com.iilas.fyp.driverdemo
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

object MobileHttpPolicy {
 fun origin(value:String){val u=java.net.URI(value);require(u.scheme=="https" && u.host!=null && u.rawUserInfo==null && u.rawQuery==null && u.rawFragment==null && u.rawPath.isNullOrEmpty() && u.host !in setOf("localhost","127.0.0.1","::1") && !u.host.endsWith(".localhost")){"Pinned HTTPS MSI origin required"}}
 fun failure(status:Int,code:String,proof:Boolean):MobileFailureKind=when{status==401||code=="unauthenticated"->MobileFailureKind.Authentication;status==403||code=="permission-denied"->MobileFailureKind.Forbidden;status==404&&proof->MobileFailureKind.MissingProof;status in setOf(408,429,500,502,503,504)->MobileFailureKind.Transient;else->MobileFailureKind.Conflict}
}
class MobileHttpBackend(private val origin:String,private val backend:String,private val token:()->String,private val current:()->Boolean,private val connect:(URL)->HttpURLConnection={it.openConnection() as HttpURLConnection}) {
 @Volatile private var active:HttpURLConnection?=null
 init {MobileHttpPolicy.origin(origin);require(backend.matches(Regex("[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}")))}
 fun cancel(){active?.disconnect()}
 private fun fence(){if(!current())throw MobileFailure(MobileFailureKind.Authentication)}
 private fun convert(value:Any?):Any?=when(value){JSONObject.NULL,null->null;is JSONObject->value.keys().asSequence().associateWith{convert(value.get(it))};is JSONArray->(0 until value.length()).map{convert(value.get(it))};else->value}
 private fun request(path:String,method:String,contentType:String,length:Long,write:(java.io.OutputStream)->Unit):JSONObject {
  fence();val bearer=token();fence();require(bearer.length in 1..16384)
  val c=connect(URL(origin+path));active=c;val executor=Executors.newSingleThreadScheduledExecutor();val timeout=executor.schedule({c.disconnect()},60,TimeUnit.SECONDS)
  try{
   c.instanceFollowRedirects=false;c.connectTimeout=15000;c.readTimeout=60000;c.requestMethod=method;c.doOutput=true;c.useCaches=false;c.setFixedLengthStreamingMode(length)
   c.setRequestProperty("Authorization","Bearer $bearer");c.setRequestProperty("X-IILAS-Protocol","iilas-msi-api-1.0");c.setRequestProperty("X-IILAS-Backend",backend);c.setRequestProperty("ngrok-skip-browser-warning","1");c.setRequestProperty("Content-Type",contentType)
   c.outputStream.use{fence();write(it);fence()};val status=c.responseCode;fence()
   if(c.getHeaderField("x-iilas-protocol")!="iilas-msi-api-1.0"||c.getHeaderField("x-iilas-backend")!=backend||c.getHeaderField("content-type")?.substringBefore(';')?.trim()!="application/json")throw MobileFailure(MobileFailureKind.Transient)
   val input=if(status in 200..299)c.inputStream else c.errorStream;val out=java.io.ByteArrayOutputStream();input?.use{stream->val buffer=ByteArray(8192);while(true){val n=stream.read(buffer);if(n<0)break;fence();if(out.size()+n>4194304)throw MobileFailure(MobileFailureKind.Conflict);out.write(buffer,0,n)}}
   val reply=JSONObject(out.toString("UTF-8"));fence();if(status !in 200..299)throw MobileFailure(MobileHttpPolicy.failure(status,reply.optJSONObject("error")?.optString("code")?:"",path.contains("/evidence/")))
   require(reply.keys().asSequence().toSet()==setOf("data"));return reply
  }catch(e:MobileFailure){throw e}catch(_:java.io.IOException){throw MobileFailure(MobileFailureKind.Transient)}catch(_:Exception){throw MobileFailure(MobileFailureKind.Conflict)}finally{timeout.cancel(false);executor.shutdownNow();c.disconnect();if(active===c)active=null}
 }
 fun command(action:String,input:Map<String,Any?>):Map<String,Any?> {
  val bytes=JSONObject(mapOf("action" to action,"input" to input)).toString().toByteArray(Charsets.UTF_8);require(bytes.size<=131072)
  val reply=request("/v1/command","POST","application/json",bytes.size.toLong()){it.write(bytes)}
  @Suppress("UNCHECKED_CAST") return convert(reply.get("data")) as? Map<String,Any?> ?: throw MobileFailure(MobileFailureKind.Conflict)
 }
 fun upload(kind:String,intentId:String,file:File,contentType:String):MobileStorageObject {
  require(kind in setOf("web","mobile") && intentId.matches(Regex("[A-Za-z0-9_-]{1,128}")) && file.length() in 1..10485760)
  val reply=request("/v1/evidence/$kind/$intentId/bytes","PUT",contentType,file.length()){out->file.inputStream().use{input->val buffer=ByteArray(8192);var count=0L;while(true){val n=input.read(buffer);if(n<0)break;fence();count+=n;require(count<=10485760);out.write(buffer,0,n)}}}.getJSONObject("data")
  val metadata=reply.getJSONObject("metadata");return MobileStorageObject(reply.getString("path"),reply.getLong("size"),reply.getString("contentType"),reply.getString("generation"),metadata.keys().asSequence().associateWith{metadata.getString(it)})
 }
}
