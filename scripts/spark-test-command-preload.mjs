import {validateSparkLoopbackTest} from '../lib/sparkRuntime.js';
import {readSparkPrivate} from './spark-private-files.mjs';
export function createSparkTestCommandFetch(profile,fetcher){
 const p=validateSparkLoopbackTest(profile);
 return (input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url||String(input));if(!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Spark acceptance refuses non-loopback test requests.');
  if(url.origin==='http://127.0.0.1:5001'&&url.pathname===`/${p.projectId}/asia-southeast1/command`){
   if(options.method!=='POST'||typeof options.body!=='string')throw Error('Invalid test command envelope.');const body=JSON.parse(options.body);if(!body||Object.keys(body).length!==1||!Object.hasOwn(body,'data'))throw Error('Invalid test command envelope.');
   const headers=new Headers(options.headers);headers.set('X-IILAS-Protocol','iilas-msi-api-1.0');headers.set('X-IILAS-Backend',p.backendInstanceId);headers.set('Content-Type','application/json');return (async()=>{const response=await fetcher(p.apiOrigin+'/v1/command',{...options,headers,body:JSON.stringify(body.data),redirect:'error'});if(response.ok)return response;const value=await response.json();if(!/^[a-z]+(?:-[a-z]+)*$/.test(value?.error?.code||''))throw Error('Invalid local test error envelope');value.error.status=value.error.code.replaceAll('-','_').toUpperCase();const replyHeaders=new Headers(response.headers);replyHeaders.delete('content-length');return new Response(JSON.stringify(value),{status:response.status,headers:replyHeaders});})();
  }return fetcher(input,options);
 };
}
if(process.env.IILAS_SPARK_TEST_REDIRECT==='enabled'){
 const profile=JSON.parse(await readSparkPrivate(process.env.IILAS_SPARK_TEST_PROFILE));globalThis.fetch=createSparkTestCommandFetch(profile,globalThis.fetch.bind(globalThis));
}
