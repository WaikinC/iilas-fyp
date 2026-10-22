// Server-owned sampled-live admission stays closed. Never populate from request,
// environment switches, registered-photo acceptance or Python approval claims.
export const parcelLiveAcceptance=null;

// The generated local shared-validator copy is added by prepare-functions when
// server integration starts. This source import remains independently testable.
import {toSafeParcelLiveModel} from './parcelLive.js';

export function requireParcelLiveAcceptance(acceptance){
  try{
    const safe=toSafeParcelLiveModel(acceptance);
    if(!safe||Reflect.ownKeys(acceptance).length!==Reflect.ownKeys(safe).length)throw new Error();
    return safe;
  }catch{
    const error=new Error('Live parcel analysis is unavailable until a model has trusted sampled-live acceptance.');error.code='unavailable';throw error;
  }
}
