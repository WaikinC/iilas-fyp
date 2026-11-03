import {createHash} from 'node:crypto';
import {approvedTransaction} from './access.mjs';
import {canonicalInventoryAI} from './inventoryAI.js';
import {validateDemoProductInput,demoScenarioFor} from './inventoryContextAI.js';
import {captureDemoProductSource as capture} from './inventoryDemoProductFacts.mjs';
import {DEMO_REORDER_POLICY} from './inventoryDemoReorder.js';
import {demoReorderCapabilityEnabled,writeDemoReorderResult} from './inventoryDemoReorder.mjs';
import {readInventoryContextConfiguration} from './inventoryContextAI.mjs';
import {createInventoryExperimentLifecycle,assertInventoryLocalEmulators} from './inventoryExperimentLifecycle.mjs';

const fail=(message,code='failed-precondition')=>{throw Object.assign(new Error(message),{code});};
const hash=value=>createHash('sha256').update(value).digest('hex');
function capability(){assertInventoryLocalEmulators();if(process.env.IILAS_STOCK_DEMO_PRODUCTS!=='enabled')fail('Demo-product experiments are disabled in this local profile.','unavailable');}
function withWorkflow(config){
 if(!config)return config;
 const flag=process.env.IILAS_STOCK_DEMO_REORDERS;
 if(flag!==undefined&&!['enabled','disabled'].includes(flag))fail('Invalid local demo reorder capability.','unavailable');
 const enabled=demoReorderCapabilityEnabled()&&config.demoReordersEnabled!==false;
 return {...config,demoReordersEnabled:enabled,fingerprint:hash(canonicalInventoryAI({base:config.fingerprint,demoProducts:'enabled',demoReorders:enabled,capability:flag==='enabled',policyVersion:enabled?DEMO_REORDER_POLICY:null}))};
}
export function readInventoryDemoConfiguration(){
 capability();const config=readInventoryContextConfiguration();
 return withWorkflow(config);
}
export function createInventoryDemoProductCommands({configuration=readInventoryDemoConfiguration,fetcher,clock=Date.now,infer}={}){
 const lifecycle=createInventoryExperimentLifecycle({configuration:()=>{capability();return withWorkflow(configuration());},fetcher,clock,infer,definition:{
  collection:'inventoryDemoProductAIRequests',action:'inventoryDemoProductExperiment',auditPrefix:'inventoryDemoProductAI_',version:3,validateInput:validateDemoProductInput,
  async prepareClaim(tx,{scope,data,nowMs,configuration}){
   const sourceProduct=await capture(tx,scope,data.productId,nowMs);
   if(sourceProduct.productVersion!==data.productVersion)fail('The selected product changed. Refresh its facts before analysis.');
   return {sourceProduct,scenario:demoScenarioFor(sourceProduct,data.facts),demoReorderPolicy:configuration.demoReordersEnabled?DEMO_REORDER_POLICY:null};
  },
  async checkFinal(tx,{scope,saved}){
   try{const current=await capture(tx,scope,saved.sourceProduct.productId,saved.sourceProduct.observedAtMs);return current.factsSha256===saved.sourceProduct.factsSha256?null:'product_changed';}
   catch{return 'product_changed';}
  },
  writeResult:writeDemoReorderResult,
  publicFields:saved=>({scenarioSource:'demo-product',sourceProduct:saved.sourceProduct}),
 }});
 async function getInventoryDemoProductContext(auth,scope,input){
  capability();
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||typeof input.productId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(input.productId))fail('Choose a valid demo product.');
  return approvedTransaction(auth,['Admin','Manager','Inventory','Warehouse'],async(tx,config)=>{
   if(scope!==config.dataScopeId)fail('The shared system data source cannot be changed.','permission-denied');
   return capture(tx,scope,input.productId,clock());
  });
 }
 return {getInventoryDemoProductContext,startInventoryDemoProductExperiment:lifecycle.start,resolveInventoryDemoProductExperiment:lifecycle.resolve};
}
const commands=createInventoryDemoProductCommands();
export const getInventoryDemoProductContext=(...args)=>commands.getInventoryDemoProductContext(...args);
export const startInventoryDemoProductExperiment=(...args)=>commands.startInventoryDemoProductExperiment(...args);
export const resolveInventoryDemoProductExperiment=(...args)=>commands.resolveInventoryDemoProductExperiment(...args);
