export const msiError=(code,message)=>Object.assign(Error(message),{code,publicMessage:message});
export function createAdmissionController({clock=Date.now}={}){
 let active=0,global={start:clock(),count:0};const peers=new Map(),users=new Map();
 function tick(map,key,limit,capacity){
  const now=clock();for(const [k,v]of map)if(now-v.start>=60000)map.delete(k);
  let value=map.get(key);if(!value){if(map.size>=capacity)throw msiError('resource-exhausted','MSI is busy. Keep and resolve the original operation.');value={start:now,count:0};map.set(key,value);}
  if(++value.count>limit)throw msiError('resource-exhausted','MSI request limit reached. Wait before resolving the original operation.');
 }
 return {admitPeer(peer){const now=clock();if(now-global.start>=60000)global={start:now,count:0};if(++global.count>120)throw msiError('resource-exhausted','MSI request limit reached.');tick(peers,peer,120,1024);},admitUid(uid){tick(users,uid,60,4096);},acquire(){if(active>=16)throw msiError('resource-exhausted','MSI is busy. Resolve the original operation later.');active++;let released=false;return()=>{if(!released){released=true;active--;}};}};
}
