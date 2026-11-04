export function boundModelEnvironment(binding,role,inherited={}){
 if(!['stock','delivery'].includes(role)||Object.keys(inherited).some(k=>k.includes('EMULATOR')||k==='GOOGLE_APPLICATION_CREDENTIALS'))throw Error('Approved model environment required');
 const upper=role.toUpperCase(),prefix='IILAS_'+upper,token=binding[prefix+'_API_TOKEN'],path=binding[prefix+'_MANIFEST_PATH'],digest=binding[prefix+'_MANIFEST_SHA256'];
 if(binding[prefix+'_API_URL']!==`http://127.0.0.1:${role==='stock'?8001:8002}`||!/^[-_A-Za-z0-9]{43}$/.test(token??'')||typeof path!=='string'||!path||! /^[a-f0-9]{64}$/.test(digest??''))throw Error('Approved model environment required');
 const env={...inherited};for(const key of Object.keys(env))if(/^(IILAS_|RESEARCH_API_)/.test(key))delete env[key];
 Object.assign(env,{[prefix+'_SERVICE_TOKEN']:token,[prefix+'_SERVING_MANIFEST']:path,[prefix+'_SERVING_MANIFEST_SHA256']:digest,PYTHONUTF8:'1'});
 if(role==='stock')Object.assign(env,{IILAS_STOCK_DEMO_PROCUREMENT:'disabled',IILAS_STOCK_DEMO_PRODUCTS:'disabled',IILAS_STOCK_DEMO_REORDERS:'disabled'});
 return env;
}