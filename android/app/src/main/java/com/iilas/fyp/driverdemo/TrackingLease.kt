package com.iilas.fyp.driverdemo
import kotlin.math.abs

class TrackingLease private constructor(val serverNowMs:Long,val leaseUntilMs:Long,val absoluteUntilMs:Long,val anchorElapsed:Long,val deadlineElapsed:Long,val absoluteDeadlineElapsed:Long,private val wallAtAnchorMs:Long) {
 fun expired(elapsed:Long):Boolean=elapsed<anchorElapsed || elapsed>=deadlineElapsed || elapsed>=absoluteDeadlineElapsed
 fun needsRenew(elapsed:Long):Boolean=!expired(elapsed) && elapsed-anchorElapsed>=300000
 fun clockValid(wallNowMs:Long,elapsed:Long):Boolean=elapsed>=anchorElapsed && wallNowMs>=0 && abs((wallNowMs-wallAtAnchorMs)-(elapsed-anchorElapsed))<=120000
 fun renew(serverNow:Long,leaseUntil:Long,absoluteUntil:Long,elapsed:Long,requestStartedElapsed:Long=elapsed,wallAtReceiptMs:Long=serverNow+(elapsed-requestStartedElapsed)):TrackingLease {
  require(!expired(requestStartedElapsed) && !expired(elapsed) && absoluteUntil==absoluteUntilMs)
  val next=accept(serverNow,leaseUntil,absoluteUntil,elapsed,requestStartedElapsed,wallAtReceiptMs)
  return TrackingLease(next.serverNowMs,next.leaseUntilMs,next.absoluteUntilMs,next.anchorElapsed,minOf(next.deadlineElapsed,absoluteDeadlineElapsed),minOf(next.absoluteDeadlineElapsed,absoluteDeadlineElapsed),wallAtReceiptMs)
 }
 companion object {
  fun accept(serverNow:Long,leaseUntil:Long,absoluteUntil:Long,elapsedRealtime:Long,requestStartedElapsed:Long=elapsedRealtime,wallAtReceiptMs:Long=serverNow+(elapsedRealtime-requestStartedElapsed)):TrackingLease {
   require(serverNow>=0 && elapsedRealtime>=0 && requestStartedElapsed in 0..elapsedRealtime && leaseUntil in serverNow..(serverNow+1800000) && absoluteUntil in leaseUntil..(serverNow+14400000))
   val duration=leaseUntil-serverNow;val latency=elapsedRealtime-requestStartedElapsed;require(duration>latency && abs(wallAtReceiptMs-(serverNow+latency))<=120000)
   return TrackingLease(serverNow,leaseUntil,absoluteUntil,elapsedRealtime,requestStartedElapsed+duration,requestStartedElapsed+(absoluteUntil-serverNow),wallAtReceiptMs)
  }
 }
}
