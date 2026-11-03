export const DELIVERY_PROTOCOL='delivery-demo-inference-1.0';
export const DELIVERY_POLICY='delivery-triage-policy-1.0';
export const DELIVERY_RULES='delivery-abnormality-rules-1.0';
export const DELIVERY_CLASSES=Object.freeze(['Low','Medium','High']);
export const DELIVERY_STATUSES=Object.freeze(['Dispatched','In Transit','Attempt Failed']);
export const DELIVERY_FACTS=Object.freeze(['expectedDurationHours','elapsedHours','failedAttempts','hasProof','statusEventCount','parcelCount','hoursSinceLastUpdate','currentStatus']);
export const DELIVERY_FEATURES=Object.freeze(['expected_duration_hours','elapsed_hours','failed_attempts','has_proof','status_event_count','parcel_count','hours_since_last_update','status_dispatched','status_in_transit','status_attempt_failed']);
export const DELIVERY_PROVENANCE=Object.freeze({origin:'simulated',annotationOrigin:'AI-authored delivery triage policy',independentHumanReview:false,independentAccuracyValidated:false,operationally_approved:false,evaluationOnly:true,acceptanceSha256:null,humanReviewRequired:true,policyVersion:DELIVERY_POLICY});
export function deliveryExact(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw Error('Invalid delivery fields');}
export function deliveryNumber(v,low,high,integer=false){if(typeof v!=='number'||!Number.isFinite(v)||v<low||v>high||integer&&!Number.isInteger(v))throw Error('Invalid delivery units');return v===0?0:v;}
export function validateDeliveryFacts(value){
 deliveryExact(value,DELIVERY_FACTS);const v={...value},limits={expectedDurationHours:[0,720],elapsedHours:[0,1440],failedAttempts:[0,20,true],statusEventCount:[0,1000,true],parcelCount:[1,1000,true],hoursSinceLastUpdate:[0,1440]};
 for(const [k,args]of Object.entries(limits))v[k]=deliveryNumber(v[k],...args);
 if(!v.expectedDurationHours||typeof v.hasProof!=='boolean'||!DELIVERY_STATUSES.includes(v.currentStatus))throw Error('Invalid delivery context');
 if(v.hoursSinceLastUpdate>v.elapsedHours||v.failedAttempts>v.statusEventCount||v.currentStatus==='Dispatched'&&(v.statusEventCount||v.failedAttempts)||v.currentStatus==='Attempt Failed'&&!v.failedAttempts)throw Error('Inconsistent delivery counts or times');
 return Object.fromEntries(DELIVERY_FACTS.map(k=>[k,v[k]]));
}
export function deliveryFeaturesForFacts(value){const v=validateDeliveryFacts(value),values=DELIVERY_FACTS.slice(0,7).map(k=>k==='hasProof'?Number(v[k]):v[k]);return Object.fromEntries(DELIVERY_FEATURES.map((k,i)=>[k,i<7?values[i]:Number(v.currentStatus===DELIVERY_STATUSES[i-7])]));}
export function validateDeliveryFeatures(value){deliveryExact(value,DELIVERY_FEATURES);for(const [k,v]of Object.entries(value))deliveryNumber(v,0,['elapsed_hours','hours_since_last_update'].includes(k)?1440:['parcel_count','status_event_count'].includes(k)?1000:k==='expected_duration_hours'?720:k==='failed_attempts'?20:1,!['expected_duration_hours','elapsed_hours','hours_since_last_update'].includes(k));const states=DELIVERY_FEATURES.slice(-3).map(k=>value[k]);if(states.reduce((a,b)=>a+b,0)!==1)throw Error('One active status required');return deliveryFeaturesForFacts({expectedDurationHours:value.expected_duration_hours,elapsedHours:value.elapsed_hours,failedAttempts:value.failed_attempts,hasProof:Boolean(value.has_proof),statusEventCount:value.status_event_count,parcelCount:value.parcel_count,hoursSinceLastUpdate:value.hours_since_last_update,currentStatus:DELIVERY_STATUSES[states.indexOf(1)]});}
export function deliveryFeaturePayload(value){const v=validateDeliveryFeatures(value);return DELIVERY_PROTOCOL+'\n'+DELIVERY_FEATURES.map(k=>{const b=new ArrayBuffer(8);new DataView(b).setFloat64(0,v[k],false);return k+'='+Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('')+'\n';}).join('');}
export function chooseDeliveryLabel(scores){deliveryExact(scores,DELIVERY_CLASSES);for(const v of Object.values(scores))deliveryNumber(v,0,1);if(Math.abs(Object.values(scores).reduce((a,b)=>a+b,0)-1)>1e-6)throw Error('Invalid delivery probability sum');return DELIVERY_CLASSES.reduce((a,b)=>scores[b]>scores[a]?b:a);}
export function teachingDeliveryLabel(value){const v=validateDeliveryFacts(value),overdue=v.elapsedHours-v.expectedDurationHours,age=v.hoursSinceLastUpdate,high=[[v.failedAttempts>=2,'repeated_failures'],[overdue>=24,'overdue_24h'],[age>=48&&overdue>0,'stale_48h_overdue']].filter(x=>x[0]).map(x=>x[1]),medium=[[overdue>0,'overdue'],[v.failedAttempts===1,'one_failure'],[age>=24,'stale_24h'],[v.elapsedHours/v.expectedDurationHours>=.8,'near_deadline']].filter(x=>x[0]).map(x=>x[1]);return {label:high.length?'High':medium.length?'Medium':'Low',reasons:high.length?high:medium.length?medium:['normal_progress'],policyVersion:DELIVERY_POLICY};}
export function evaluateDeliveryRules(s){
 deliveryExact(s,['observedAtMs','deadlineMs','dispatchedAtMs','lastUpdateAtMs','currentStatus','failedAttempts','proofValid','invalidTransition']);const now=deliveryNumber(s.observedAtMs,0,8640000000000000,true),unknowns=[],matches=[];
 function valid(k,low=0,high=8640000000000000,integer=true){try{deliveryNumber(s[k],low,high,integer);return true;}catch{unknowns.push(k);return false;}}
 const add=(code,points,reason)=>matches.push({code,points,reason}),active=DELIVERY_STATUSES.includes(s.currentStatus),closed=['Delivered','Returned'].includes(s.currentStatus);
 if(!active&&!closed)unknowns.push('currentStatus');let dispatchOK=valid('dispatchedAtMs');if(dispatchOK&&s.dispatchedAtMs>now){unknowns.push('dispatchedAtMs');dispatchOK=false;}
 if(active){let ok=valid('deadlineMs');if(ok&&(!dispatchOK||s.deadlineMs<=s.dispatchedAtMs)){unknowns.push('deadlineMs');ok=false;}if(ok&&now>s.deadlineMs)add('overdue',30,'Expected delivery date exceeded');}
 if(valid('failedAttempts',0,20)&&s.failedAttempts>=2)add('repeated_failures',25,'Repeated failed delivery attempts');
 if(s.currentStatus==='Delivered'){if(typeof s.proofValid!=='boolean')unknowns.push('proofValid');else if(!s.proofValid)add('missing_proof',20,'Delivered without matching proof');}
 if(typeof s.invalidTransition!=='boolean')unknowns.push('invalidTransition');else if(s.invalidTransition)add('invalid_transition',15,'Invalid recorded status sequence');
 if(active){let ok=valid('lastUpdateAtMs');if(ok&&(!dispatchOK||s.lastUpdateAtMs<s.dispatchedAtMs||s.lastUpdateAtMs>now)){unknowns.push('lastUpdateAtMs');ok=false;}if(ok&&now-s.lastUpdateAtMs>86400000)add('stale_update',10,'No delivery update for 24 hours');}
 const complete=unknowns.length===0,score=complete?matches.reduce((a,b)=>a+b.points,0):null;return {complete,unknowns:[...new Set(unknowns)],dataReviewRequired:unknowns.length>0||s.invalidTransition===true,matches,score,level:complete?(score>=50?'High':score>=20?'Medium':'Low'):null,observedAtMs:now,ruleVersion:DELIVERY_RULES};
}
export function validateDeliveryPrediction(value,expected){
 const ids=['requestId','inputSha256','modelSha256','datasetSha256','developmentSha256','evaluationSha256','servingManifestSha256'];
 deliveryExact(value,['protocol',...ids,'features','label','probabilities','model','processingTimeMs','totalProcessingTimeMs','outOfRange',...Object.keys(DELIVERY_PROVENANCE)]);
 if(value.protocol!==DELIVERY_PROTOCOL||value.model!=='RandomForest'||!DELIVERY_CLASSES.includes(value.label)||value.label!==chooseDeliveryLabel(value.probabilities))throw Error('Invalid delivery result');
 for(const [k,v]of Object.entries(DELIVERY_PROVENANCE))if(value[k]!==v)throw Error('Invalid delivery provenance');
 for(const k of ids){if(typeof value[k]!=='string'||!(k==='requestId'?/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/:/^[a-f0-9]{64}$/).test(value[k])||expected[k]!==undefined&&value[k]!==expected[k])throw Error('Delivery identity differs');}
 const features=validateDeliveryFeatures(value.features);if(expected.features&&JSON.stringify(features)!==JSON.stringify(validateDeliveryFeatures(expected.features)))throw Error('Delivery features differ');
 deliveryNumber(value.processingTimeMs,0,60000);deliveryNumber(value.totalProcessingTimeMs,value.processingTimeMs,60000);
 if(!Array.isArray(value.outOfRange)||value.outOfRange.some((k,i)=>!DELIVERY_FEATURES.includes(k)||value.outOfRange.indexOf(k)!==i))throw Error('Invalid delivery range warnings');
 if(expected.ranges){const warnings=DELIVERY_FEATURES.filter(k=>features[k]<expected.ranges[k].min||features[k]>expected.ranges[k].max);if(JSON.stringify(warnings)!==JSON.stringify(value.outOfRange))throw Error('Delivery range warnings differ');}
 return value;
}
