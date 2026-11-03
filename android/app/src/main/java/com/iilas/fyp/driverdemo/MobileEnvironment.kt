package com.iilas.fyp.driverdemo

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.storage.FirebaseStorage
import org.json.JSONObject

object MobileEnvironmentPolicy {
 fun validateCloud(debug:Boolean,project:String,bucket:String,appId:String,apiKey:String,allowedProject:String,fixtureOnly:Boolean) {
  require(debug && !fixtureOnly && project==allowedProject && project!="fyp-inventory-and-logistics" && Regex("[a-z][a-z0-9-]{4,28}[a-z0-9]").matches(project)) { "Explicit cloud demo identity required" }
  require(bucket in listOf("$project.firebasestorage.app","$project.appspot.com") && Regex("1:[0-9]+:android:[a-f0-9]{16,40}").matches(appId) && appId!="1:1234567890:android:0000000000000000" && Regex("AIza[A-Za-z0-9_-]{35}").matches(apiKey)) { "Cloud demo options unavailable" }
 }
 fun validate(debug:Boolean,project:String,host:String,ports:List<Int>) {
  require(debug && project=="fyp-inventory-and-logistics" && host=="127.0.0.1" && ports==listOf(5001,8081,9099,9199)) { "Local debug environment required" }
 }
}
data class MobileSparkDestination(val apiOrigin:String,val backendInstanceId:String){
 init{MobileHttpPolicy.origin(apiOrigin);require(backendInstanceId.matches(Regex("[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}")))}
 val partitionIdentity:String get()="spark-msi:fyp-inventory-and-logistics:$backendInstanceId:"+mobileSha(apiOrigin.toByteArray(Charsets.UTF_8))
 val preferencesName:String get()="iilas-spark-context-"+mobileSha(partitionIdentity.toByteArray(Charsets.UTF_8))
}
class MobileEnvironment private constructor(val project:String,val auth:FirebaseAuth,val functions:FirebaseFunctions?,val storage:FirebaseStorage?,val localOnly:Boolean,val spark:MobileSparkDestination?=null) {
 fun dto():Map<String,Any> = spark?.let{mapOf("schema" to "iilas-mobile-spark-msi-1.0","mode" to "spark-msi","projectId" to project,"protocol" to "mobile-command-1.0","localOnly" to false,"apiOrigin" to it.apiOrigin,"backendInstanceId" to it.backendInstanceId)}?:mapOf("schema" to if(localOnly) "iilas-mobile-local-1.0" else "iilas-mobile-cloud-demo-1.0","projectId" to project,"protocol" to "mobile-command-1.0","localOnly" to localOnly)
 companion object {
  @Volatile private var instance:MobileEnvironment?=null
  @Synchronized fun requireLocalDebug(context:Context):MobileEnvironment { require(BuildConfig.FLAVOR=="local");return requireDebug(context) }
  @Synchronized fun requireDebug(context:Context):MobileEnvironment {
   instance?.let { return it }
   val raw=context.assets.open("mobile-environment.json").bufferedReader().use { it.readText() }
   require(raw.toByteArray().size<=4096)
   val config=JSONObject(raw)
   require(config.getString("protocol")=="mobile-command-1.0")
   if(BuildConfig.FLAVOR=="cloudDemo") {
    if(config.getString("schema")=="iilas-mobile-spark-msi-1.0"){
     require(config.keys().asSequence().toSet()==setOf("schema","projectId","protocol","apiKey","appId","fixtureOnly","apiOrigin","backendInstanceId"))
     require(BuildConfig.DEBUG && !config.getBoolean("fixtureOnly") && config.getString("projectId")=="fyp-inventory-and-logistics" && BuildConfig.IILAS_PROJECT_ID==config.getString("projectId"))
     require(mobileSha(raw.toByteArray(Charsets.UTF_8))==BuildConfig.IILAS_CONFIG_SHA256)
     val key=config.getString("apiKey");val appId=config.getString("appId");require(key.matches(Regex("AIza[A-Za-z0-9_-]{35}")) && appId.matches(Regex("1:[0-9]+:android:[a-f0-9]{16,40}")))
     val destination=MobileSparkDestination(config.getString("apiOrigin"),config.getString("backendInstanceId"));val project=config.getString("projectId")
     val options=FirebaseOptions.Builder().setProjectId(project).setApiKey(key).setApplicationId(appId).build();val app=FirebaseApp.initializeApp(context.applicationContext,options,"iilas-spark-driver")
     return MobileEnvironment(project,FirebaseAuth.getInstance(app),null,null,false,destination).also{instance=it}
    }
    require(config.keys().asSequence().toSet()==setOf("schema","projectId","protocol","apiKey","appId","storageBucket","functionsRegion","fixtureOnly"))
    require(config.getString("schema")=="iilas-mobile-cloud-demo-1.0")
    val pin=java.security.MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8)).joinToString(""){"%02x".format(it)}
    require(pin==BuildConfig.IILAS_CONFIG_SHA256)
    val project=config.getString("projectId")
    MobileEnvironmentPolicy.validateCloud(BuildConfig.DEBUG,project,config.getString("storageBucket"),config.getString("appId"),config.getString("apiKey"),BuildConfig.IILAS_PROJECT_ID,config.getBoolean("fixtureOnly"))
    val region=config.getString("functionsRegion");require(Regex("[a-z]+-[a-z]+[0-9]").matches(region))
    val options=FirebaseOptions.Builder().setProjectId(project).setApiKey(config.getString("apiKey")).setApplicationId(config.getString("appId")).setStorageBucket(config.getString("storageBucket")).build()
    val app=FirebaseApp.initializeApp(context.applicationContext,options,"iilas-cloud-driver")
    return MobileEnvironment(project,FirebaseAuth.getInstance(app),FirebaseFunctions.getInstance(app,region),FirebaseStorage.getInstance(app),false).also { instance=it }
   }
   require(BuildConfig.FLAVOR=="local" && config.getString("schema")=="iilas-mobile-local-1.0")
   val ports=config.getJSONObject("ports");val project=config.getString("projectId")
   MobileEnvironmentPolicy.validate(BuildConfig.DEBUG,project,config.getString("host"),listOf(ports.getInt("functions"),ports.getInt("firestore"),ports.getInt("auth"),ports.getInt("storage")))
   require(config.getString("apiKey")=="emulator-test-only" && config.getString("appId")=="1:1234567890:android:0000000000000000" && config.getString("storageBucket")=="$project.firebasestorage.app")
   val options=FirebaseOptions.Builder().setProjectId(project).setApiKey(config.getString("apiKey")).setApplicationId(config.getString("appId")).setStorageBucket(config.getString("storageBucket")).build()
   val app=FirebaseApp.initializeApp(context.applicationContext,options,"iilas-local-driver")
   // No credential/user operation occurs until every SDK is emulator-bound.
   val auth=FirebaseAuth.getInstance(app);auth.useEmulator("127.0.0.1",9099)
   val functions=FirebaseFunctions.getInstance(app,"asia-southeast1");functions.useEmulator("127.0.0.1",5001)
   val storage=FirebaseStorage.getInstance(app);storage.useEmulator("127.0.0.1",9199)
   return MobileEnvironment(project,auth,functions,storage,true).also { instance=it }
  }
 }
}
