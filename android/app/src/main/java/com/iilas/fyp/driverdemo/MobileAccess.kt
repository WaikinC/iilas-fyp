package com.iilas.fyp.driverdemo
import org.json.JSONObject

data class MobileAccess(val uid:String,val scope:String?,val role:String?,val mode:String,val verifiedAtMs:Long,val online:Boolean=true) {
 fun dto():Map<String,Any?> = mapOf("uid" to uid,"scope" to scope,"role" to role,"mode" to mode,"verifiedAtMs" to verifiedAtMs,"online" to online)
 companion object {
  fun fromServer(uid:String,data:Map<String,Any?>,verifiedAtMs:Long):MobileAccess {
   require(data.keys==setOf("uid","scope","role","mode","protocol") && data["uid"]==uid && data["protocol"]=="mobile-command-1.0")
   val mode=data["mode"] as? String;val role=data["role"] as? String;val scope=data["scope"] as? String
   require(mode in setOf("Driver","Recovery only","Waiting"))
   if(mode=="Waiting")require(scope==null && role==null) else {require(scope!=null && scope.matches(Regex("[A-Za-z0-9_-]{1,128}")));require(if(mode=="Driver")role=="Driver" else role in setOf("Admin","Manager","Inventory","Warehouse","Logistics","Viewer"))}
   require(verifiedAtMs>=0);return MobileAccess(uid,scope,role,mode!!,verifiedAtMs)
  }
 }
}
