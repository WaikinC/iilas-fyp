package com.iilas.fyp.driverdemo
// Stop also fences an accepted Start whose service hook is not installed yet.
class MobileTrackingAdmission {
 private var generation=0L
 @Synchronized fun ticket():Long=generation
 @Synchronized fun stop(work:()->Unit){generation++;work()}
 @Synchronized fun install(ticket:Long,work:()->Unit):Boolean {if(ticket!=generation)return false;work();return true}
}
