import {createHash,randomUUID} from 'node:crypto';
import * as api from '../../lib/inventoryContextAI.js';
import {canonicalInventoryAI} from '../../lib/inventoryAI.js';
const sha=x=>createHash('sha256').update(x).digest('hex');
const facts=()=>({movementFrequency:2,adjustmentCount:0,daysSinceReplenishment:.0005,additionalFirmQuantity:0,additionalDueDays:null,incomingQuantity:0,incomingEtaDays:null,supplyStatus:'none'});
const source=()=>{const s={productId:'demo-p',productVersion:1,name:'Demo parcel',sku:'DEMO-001',quantityOnHand:10,reservedQuantity:3,reorderLevel:8,observedAtMs:1000,dataOrigin:'demonstration-test'};return {...s,factsSha256:sha(canonicalInventoryAI(s))};};
export function demoReorderFixture(){const s=source(),scenario={quantityOnHand:10,reservedQuantity:3,reorderLevel:8,...facts()},features=api.contextFeaturesForScenario(scenario),inputSha256=sha(api.contextFeaturePayload(features)),hashes=Object.fromEntries(['modelSha256','servingManifestSha256','datasetSha256','developmentSha256','evaluationSha256'].map((k,i)=>[k,String(i+1).repeat(64)]));return {ownerId:'scope',actor:'staff',operationId:randomUUID(),scenario,features,inputSha256,status:'Predicted',prediction:{protocol:api.INVENTORY_CONTEXT_PROTOCOL,requestId:randomUUID(),inputSha256,features,classOrder:[...api.INVENTORY_CONTEXT_CLASSES],label:'Reorder Risk',probabilities:[.1,.7,.2],model:'RandomForest',...hashes,processingTimeMs:1,totalProcessingTimeMs:2,outOfRange:[],...api.INVENTORY_CONTEXT_PROVENANCE},reason:null,source:{...hashes,ranges:Object.fromEntries(api.INVENTORY_CONTEXT_FEATURES.map(k=>[k,{min:-1e6,max:1e6}])),metrics:{accuracy:587/720,macroF1:.8080105925190334,criticalPrecision:.79,criticalRecall:316/360,observations:720,families:60,accuracyInterval:[.7854,.8486],origin:'AI-authored synthetic policy'},model:'RandomForest'},createdAt:{seconds:1,nanoseconds:0},requestedAtMs:1000,version:3,protocol:api.INVENTORY_CONTEXT_PROTOCOL,scenarioSource:'demo-product',sourceProduct:s,...api.INVENTORY_CONTEXT_PROVENANCE};}
export function demoRiskGraph(){
 const experiment=demoReorderFixture(),id=randomUUID();
 const {actor:experimentActor,operationId,sourceProduct,scenario,features,inputSha256,prediction,source,requestedAtMs}=experiment;
 const basis={experimentId:id,experimentActor,operationId,sourceProduct,scenario,features,inputSha256,prediction,source,requestedAtMs};
 const common={ownerId:experiment.ownerId,basis,policyVersion:'demo-risk-review-1.0',createdAt:experiment.createdAt,version:1,...api.INVENTORY_CONTEXT_PROVENANCE};
 return {id,experiment,alert:{...structuredClone(common),requirementId:id},requirement:{...structuredClone(common),alertId:id,status:'Pending',review:null}};
}
