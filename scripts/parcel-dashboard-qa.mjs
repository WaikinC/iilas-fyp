import assert from 'node:assert/strict';
import {test} from 'node:test';
import {dashboardSummary} from '../src/features/dashboard/dashboardData.ts';
const hash='a'.repeat(64);
const model={model:'MobileNetV2',modelVersion:hash,selectionSha256:hash,evaluationSha256:hash,acceptanceSha256:hash,preprocessing:'rgb-letterbox224-v1',contrast:'clahe',classOrder:['Normal','Damaged']};
const shipment={id:'shipment',status:'Prepared',version:4};
const evidence={id:'photo',ownerId:'scope',type:'Parcel Image',version:2,sha256:hash,shipmentId:'shipment',stage:'Pre-dispatch'};
const prediction={...model,id:'parcel-analysis',ownerId:'scope',kind:'parcel',recordId:'photo',sourceVersion:2,evidenceSha256:hash,analysisId:'analysis',shipmentId:'shipment',stage:'Pre-dispatch',label:'Damaged',reviewStatus:'Accepted',createdAt:{seconds:100}};
const analysis={model,id:'analysis',analysisId:'analysis',ownerId:'scope',state:'Predicted',evidenceId:'photo',evidenceVersion:2,evidenceSha256:hash,shipmentId:'shipment',stage:'Pre-dispatch',predictionId:'parcel-analysis',label:'Damaged',reviewStatus:'Accepted'};
const summarize=(p=prediction,a=analysis,e=evidence,s=shipment)=>dashboardSummary([], [s], {purchases:[],deliveries:[],verifications:[],evidence:[e],predictions:[p],parcelAnalyses:[a]},0);

test('Accepted experiments or incomplete model provenance never become operational decisions',()=>{
  for(const patch of [{evaluationKind:'local-experimental',evaluationManifestSha256:hash,acceptanceSha256:null},{evaluationKind:'local-experimental'},{evaluationManifestSha256:hash},{acceptanceSha256:null}]){
    for(const [p,a] of [[{...prediction,...patch},analysis],[prediction,{...analysis,model:{...analysis.model,...patch}}]]){
      const summary=summarize(p,a);assert.equal(summary.currentParcelPredictions.length,0);assert.equal(summary.damageAlerts.length,0);assert.equal(summary.pendingVerification.length,0);
    }
  }
  for(const value of [null,{}, {...model,acceptanceSha256:null},{...model,modelVersion:'b'.repeat(64)}])assert.equal(summarize(prediction,{...analysis,model:value}).damageAlerts.length,0);
  const latest={...prediction,id:'newer-experiment',analysisId:'newer-experiment',createdAt:{seconds:200},evaluationKind:'local-experimental',evaluationManifestSha256:hash,acceptanceSha256:null};
  const summary=dashboardSummary([],[shipment],{purchases:[],deliveries:[],verifications:[],evidence:[evidence],parcelAnalyses:[analysis],predictions:[prediction,latest]},0);
  assert.equal(summary.damageAlerts.length,0,'A newer Accepted experiment must not resurrect an older operational alert');
});
test('parcel alerts require reciprocal accepted result, immutable image binding and current known stage',()=>{
  assert.equal(summarize().damageAlerts.length,1);
  for(const patch of [{analysisId:null},{reviewStatus:'Pending'},{reviewStatus:'Rejected'},{evidenceSha256:'b'.repeat(64)},{sourceVersion:1},{stage:'Delivery'},{label:null},{ownerId:'other'}])assert.equal(summarize({...prediction,...patch}).damageAlerts.length,0,JSON.stringify(patch));
  for(const patch of [{predictionId:'other'},{reviewStatus:'Pending'},{state:'Abstained'},{evidenceVersion:1},{evidenceSha256:'b'.repeat(64)},{label:'Normal'},{stage:'Delivery'},{ownerId:'other'}])assert.equal(summarize(prediction,{...analysis,...patch}).damageAlerts.length,0,JSON.stringify(patch));
  for(const patch of [{stage:null},{version:3},{sha256:'b'.repeat(64)},{type:'Proof of Delivery'}])assert.equal(summarize(prediction,analysis,{...evidence,...patch}).damageAlerts.length,0,JSON.stringify(patch));
  assert.equal(summarize(prediction,analysis,evidence,{...shipment,status:'Dispatched'}).damageAlerts.length,0);
  assert.equal(summarize({...prediction,stage:'Delivery'},{...analysis,stage:'Delivery'},{...evidence,stage:'Delivery'},{...shipment,status:'Dispatched'}).damageAlerts.length,1);
});
test('a newer unreviewed parcel result cannot resurrect an older accepted alert',()=>{
  const summary=dashboardSummary([],[shipment],{purchases:[],deliveries:[],verifications:[],evidence:[evidence],parcelAnalyses:[analysis],predictions:[prediction,{...prediction,id:'newer',analysisId:'newer-analysis',reviewStatus:'Pending',createdAt:{seconds:200}}]},0);
  assert.equal(summary.damageAlerts.length,0);
});
test('numeric parcel outcome timestamps select the latest result without changing tabular timestamps',()=>{
  const summary=dashboardSummary([],[shipment],{purchases:[],deliveries:[],verifications:[],evidence:[evidence],parcelAnalyses:[analysis],predictions:[{...prediction,createdAt:1000},{...prediction,id:'newer',analysisId:'newer-analysis',reviewStatus:'Pending',createdAt:2000}]},0);
  assert.equal(summary.damageAlerts.length,0);
});
