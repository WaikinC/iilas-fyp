import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

// The OS mutex belongs to this helper's lifetime. An abrupt Node exit closes its
// stdin pipe, releasing the mutex even when an on-disk ownership record remains.
export async function acquireWindowsMutex(key){
 if(process.platform!=='win32')throw Error('Windows ownership required');
 const name='Local\\IILAS-'+createHash('sha256').update(key).digest('hex');
 const source=`$ErrorActionPreference='Stop';$m=New-Object System.Threading.Mutex($false,'${name}');$held=$false;try{try{$held=$m.WaitOne(0)}catch [System.Threading.AbandonedMutexException]{$held=$true};if(-not $held){exit 23};[Console]::Out.WriteLine('ACQUIRED');[Console]::Out.Flush();$null=[Console]::In.ReadToEnd()}finally{if($held){$m.ReleaseMutex()};$m.Dispose()}`;
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',source],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 child.stderr.resume();let exitResolve;const exited=new Promise(resolve=>{exitResolve=resolve;});child.once('exit',exitResolve);child.once('error',exitResolve);
 await new Promise((yes,no)=>{let output='';const timer=setTimeout(()=>{child.stdin.end();no(Error('Windows startup ownership timed out'));},10000);child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('ACQUIRED')){clearTimeout(timer);yes();}});child.once('error',()=>{clearTimeout(timer);no(Error('Windows startup ownership unavailable'));});child.once('exit',()=>{clearTimeout(timer);no(Error('Another startup or recovery owns this resource'));});});
 let released=false;return {async release(){if(released)return;released=true;child.stdin.end();await exited;}};
}

export function stopProcessIdentity(identity){
 if(!Number.isSafeInteger(identity.pid)||identity.pid<1||!/^\d{17,19}$/.test(identity.startTicks))throw Error('Exact process required');
 // Open one Windows process handle, compare its creation time, then terminate
 // that same handle. Reopening a numeric PID between checks would permit reuse.
 const source=`$ErrorActionPreference='Stop';Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class IILASProcessHandle {
 [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetProcessTimes(IntPtr handle, out long created, out long exited, out long kernel, out long user);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool TerminateProcess(IntPtr handle, uint code);
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
}
'@;$h=[IILASProcessHandle]::OpenProcess(0x101001,$false,${identity.pid});if($h -eq [IntPtr]::Zero){throw 'Process unavailable'};try{$c=0L;$e=0L;$k=0L;$u=0L;if(-not [IILASProcessHandle]::GetProcessTimes($h,[ref]$c,[ref]$e,[ref]$k,[ref]$u) -or [DateTime]::FromFileTimeUtc($c).Ticks.ToString() -ne '${identity.startTicks}'){throw 'Process incarnation differs'};if(-not [IILASProcessHandle]::TerminateProcess($h,0)){throw 'Termination refused'}}finally{$null=[IILASProcessHandle]::CloseHandle($h)}`;
 execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',source],{encoding:'utf8',timeout:15000,windowsHide:true,stdio:['ignore','pipe','pipe']});
}
