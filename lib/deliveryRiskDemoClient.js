import {deliveryExact} from './deliveryRiskDemo.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const actions={AI:['startDeliveryDemoExperiment','resolveDeliveryDemoExperiment'],Rules:['captureDeliveryAbnormality','resolveDeliveryAbnormality'],Review:['reviewDeliveryRisk','resolveDeliveryRiskReview']};
function validate(kind,v){
 deliveryExact(v,kind==='Review'?['operationId','targetKind','targetId','expectedReviewVersion','decision','notes']:['operationId','shipmentId','demoAcknowledged']);
 if(!uuid(v.operationId))throw Error('Invalid saved operation.');
 if(kind==='Review'){if(!['AI','Rules'].includes(v.targetKind)||!id(v.targetId)||!Number.isInteger(v.expectedReviewVersion)||v.expectedReviewVersion<0||!['Acknowledge','NeedsFollowUp'].includes(v.decision)||typeof v.notes!=='string'||v.notes.trim().length<3||v.notes.length>500)throw Error('Invalid review.');}
 else if(!id(v.shipmentId)||v.demoAcknowledged!==true)throw Error('Invalid saved shipment.');return v;
}
function outcome(kind,v,input){
 if(!v||v.operationId!==input.operationId)throw Error('Unconfirmed delivery outcome.');
 if(v.state==='Running'&&kind==='AI'){deliveryExact(v,['state','operationId','experimentId']);if(v.experimentId!==null)throw Error('Invalid pending outcome.');return v;}
 const fields=v.state==='Cancelled'?['state','operationId',kind==='AI'?'experimentId':kind==='Rules'?'assessmentId':'reviewId','replayed']:kind==='AI'?['state','operationId','experimentId','assessmentId','replayed']:kind==='Rules'?['state','operationId','assessmentId','replayed']:['state','operationId','reviewId','targetId','reviewVersion','replayed'];
 deliveryExact(v,fields);if(typeof v.replayed!=='boolean')throw Error('Invalid recovery marker.');
 if(v.state==='Cancelled'){if(v[fields[2]]!==null)throw Error('Invalid cancellation.');return v;}
 if(kind==='AI'&&(!['Predicted','Unavailable'].includes(v.state)||!uuid(v.experimentId)||!uuid(v.assessmentId))||kind==='Rules'&&(v.state!=='Assessed'||!uuid(v.assessmentId))||kind==='Review'&&(v.state!=='Reviewed'||!uuid(v.reviewId)||v.targetId!==input.targetId||v.reviewVersion!==input.expectedReviewVersion+1))throw Error('Unconfirmed delivery result identity.');return v;
}
async function observe(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No confirmed response within 35 seconds. Check the saved operation; current rule assessment remains separate.')),35000);})]);}finally{clearTimeout(timer);}}
export function createDeliveryDemoController({command,storage,scope,uid,tab='default',isCurrent=()=>true,clock=Date.now}){
 if(![scope,uid,tab].every(id)||typeof command!=='function'||typeof clock!=='function')throw Error('A current delivery account and tab are required.');
 let busy=false,active=true,epoch=0;const key=kind=>`iilas.deliveryDemo.${scope}.${uid}.${tab}.${kind}`;
 const current=()=>{if(!active||!isCurrent())throw Error('The original delivery view or account changed. Recover in its original account.');};
 function pending(kind){current();if(!actions[kind])throw Error('Unknown delivery action.');const raw=storage.getItem(key(kind));if(raw==null)return null;try{return validate(kind,JSON.parse(raw));}catch{throw Error('Saved delivery intent needs administrator reconciliation. Keep the saved data.');}}
 async function send(kind,input,resolve=false){current();if(busy)throw Error('A delivery request is already running.');let saved=pending(kind);if(input){if(saved)throw Error('Recover the saved operation first.');saved=validate(kind,{...input,operationId:crypto.randomUUID()});storage.setItem(key(kind),JSON.stringify(saved));}if(!saved)throw Error('No saved operation.');const original=JSON.stringify(saved),started=epoch;busy=true;try{const result=outcome(kind,await observe(command(actions[kind][resolve?1:0],saved)),saved);current();if(started!==epoch||JSON.stringify(pending(kind))!==original)throw Error('Saved delivery view or intent changed. Recover its original operation.');if(result.state!=='Running')storage.removeItem(key(kind));return result;}finally{busy=false;}}
 return {activate(){active=true;epoch++;},dispose(){active=false;epoch++;},pending,analyse:shipmentId=>send('AI',{shipmentId,demoAcknowledged:true}),assessRules:shipmentId=>send('Rules',{shipmentId,demoAcknowledged:true}),review:input=>send('Review',input),retry:kind=>send(kind,null),checkOutcome:(kind='AI')=>send(kind,null,true),checkReviewOutcome:()=>send('Review',null,true)};
}
