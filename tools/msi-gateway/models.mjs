import {validateContextPrediction} from '../../lib/inventoryContextAI.js';
import {validateDeliveryPrediction} from '../../lib/deliveryRiskDemo.js';
import {readBoundedHybridJSON} from '../../backend/functions/hybridGateway.mjs';
export function createModelHandlers({bindingSha256,stockConfiguration,deliveryConfiguration,fetcher=fetch}){
 const handler=kind=>async(payload,{envelope,signal})=>{
  if(envelope.bindingSha256!==bindingSha256||payload.requestId!==envelope.requestId)throw Error('Model binding changed');
  const config=(kind==='stock'?stockConfiguration:deliveryConfiguration)();if(!config||config.url!==`http://127.0.0.1:${kind==='stock'?8001:8002}`)throw Error('Local model unavailable');
  const response=await fetcher(config.url+`/predict/${kind==='stock'?'stock':'delivery'}-experiment`,{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+config.token},redirect:'error',body:JSON.stringify(payload),signal});
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw Error('Local model unavailable');}
  const result=await readBoundedHybridJSON(response,kind==='stock'?16384:65536);
  return kind==='stock'?validateContextPrediction(result,{...config.expected,requestId:payload.requestId,inputSha256:payload.inputSha256,features:payload.features}):validateDeliveryPrediction(result,{...config.expected,...payload});
 };
 return {'stock.predict':handler('stock'),'delivery.predict':handler('delivery')};
}
