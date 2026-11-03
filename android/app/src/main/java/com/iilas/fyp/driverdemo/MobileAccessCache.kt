package com.iilas.fyp.driverdemo
import android.content.SharedPreferences
import org.json.JSONObject
class MobileAccessCache(private val preferences:SharedPreferences,private val onDriverRestored:(MobileAccess)->Unit={}) {
 private var memory:MobileAccess?=null
 private val invalidated=mutableSetOf<String>()
 @Synchronized fun clearMemory(){memory=null}
 @Synchronized fun read(uid:String):MobileAccess? {
  if(uid in invalidated)return null
  memory?.takeIf{it.uid==uid}?.let{return it}
  val raw=preferences.getString("access-$uid",null)?:return null
  return try{val j=JSONObject(raw);MobileAccess.fromServer(uid,mobileMap(j.getJSONObject("context")),j.getLong("verifiedAtMs")).copy(online=false)}catch(_:Exception){null}
 }
 @Synchronized fun accept(value:MobileAccess){
  val server=mapOf("uid" to value.uid,"scope" to value.scope,"role" to value.role,"mode" to value.mode,"protocol" to "mobile-command-1.0")
  require(MobileAccess.fromServer(value.uid,server,value.verifiedAtMs)==value.copy(online=true))
  preferences.edit().putString("access-${value.uid}",JSONObject().put("context",JSONObject(server)).put("verifiedAtMs",value.verifiedAtMs).toString()).commit()
  invalidated.remove(value.uid);memory=value;if(value.mode=="Driver")onDriverRestored(value)
 }
 @Synchronized fun invalidate(uid:String){invalidated.add(uid);if(memory?.uid==uid)memory=null;preferences.edit().remove("access-$uid").commit()}
}
