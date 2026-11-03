package com.iilas.fyp.driverdemo
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
fun mobileOnWorker(work:()->Unit) { val executor=Executors.newSingleThreadExecutor();try{executor.submit(work).get(90,TimeUnit.SECONDS)}finally{executor.shutdownNow()} }
