import {getStorage} from 'firebase-admin/storage';
import {demoEvidenceBucket} from './demoEnvironment.mjs';
let provider=null;
export function installMsiEvidenceProvider(value){
 if(provider||!value||['getMetadata','download','createReadStream'].some(k=>typeof value[k]!=='function'))throw Error('The evidence provider is already bound or invalid.');provider=value;
}
export function evidenceFile(path){
 if(['spark-msi','spark-loopback-test'].includes(process.env.IILAS_DEMO_MODE)){
  if(!provider)throw Object.assign(Error('The private MSI evidence provider is unavailable.'),{code:'unavailable'});
  return {getMetadata:async()=>[await provider.getMetadata(path)],download:async()=>[await provider.download(path)],createReadStream:()=>provider.createReadStream(path)};
 }
 return getStorage().bucket(demoEvidenceBucket()).file(path);
}
