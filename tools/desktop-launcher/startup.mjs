export async function runStartup({services,report=()=>{},checkOnly=false,recoverChain=false}) {
 const started=[];
 for(const name of ['chain','stock','delivery','api','tunnel']) {
  let status;
  try { status=await services[name].inspect(); } catch { status={state:'blocked'}; }
  if(status.state==='ready') { report(name,'Ready'); continue; }
  if(name==='chain'&&!recoverChain||status.state!=='absent'||checkOnly) {
   report(name,name==='chain'?'Blockchain recovery needed':'Needs attention');
   return {servicesReady:false,blockedAt:name,started};
  }
  report(name,'Starting');
  try {
   await services[name].start();
   const after=await services[name].inspect();
   if(after.state!=='ready')throw Error('Not ready');
   started.push(name); report(name,'Ready');
  } catch {
   report(name,'Needs attention');
   return {servicesReady:false,blockedAt:name,started};
  }
 }
 return {servicesReady:true,started};
}
