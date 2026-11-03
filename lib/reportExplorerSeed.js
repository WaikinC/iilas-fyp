import {completionExact} from './completionWorkflow.js';import {validateReportRequest} from './reporting.js';
export function consumeReportSeed(resource,raw,seenRevision){
 const seed=completionExact(raw,['revision','filters']);if(!Number.isSafeInteger(seed.revision)||seed.revision<0)throw Error('Invalid source report selection.');if(seed.revision===seenRevision)return null;
 return {revision:seed.revision,filters:validateReportRequest({resource,filters:seed.filters}).filters};
}
