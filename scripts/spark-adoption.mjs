import {prepareExistingCloudAdoption} from './hybrid-existing-adoption.mjs';
export function prepareSparkAdoption({backup,observedState,sourcePins,billingEnabled}){
 if(billingEnabled!==false||backup?.billingEnabled!==false)throw Error('Spark adoption requires billing to remain disabled.');
 const legacy=prepareExistingCloudAdoption({backupReceipt:backup,observedState,sourcePins});
 return Object.freeze({mode:'spark-msi',adoption:legacy.adoption,fixtureOnly:true,executable:false,readiness:Object.freeze({...legacy.readiness,billingEnabled:false,blockers:Object.freeze(legacy.readiness.blockers.filter(x=>x!=='BillingDisabled'))})});
}
