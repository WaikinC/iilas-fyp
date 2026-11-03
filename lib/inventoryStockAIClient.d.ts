import type {ExperimentInput,Outcome} from './inventoryAI';
import type {ContextScenario,ContextExperimentInput,DemoInput,DemoSource} from './inventoryContextAI';
export type PendingKind='legacy'|'context'|'demo-product';
export type Pending={kind:'legacy';input:ExperimentInput}|{kind:'context';input:ContextExperimentInput}|{kind:'demo-product';input:DemoInput};
export function createInventoryStockAIClient(options:{storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>;context:{uid:string;scope:string};isCurrent:()=>boolean;command:(action:string,input:ExperimentInput|ContextExperimentInput|DemoInput|{productId:string})=>Promise<unknown>}):{pending:()=>Pending[];preview:(productId:string)=>Promise<DemoSource>;startContext:(scenario:ContextScenario)=>Promise<Outcome>;startDemo:(input:Omit<DemoInput,'operationId'>)=>Promise<Outcome>;retry:(kind:PendingKind)=>Promise<Outcome>;resolve:(kind:PendingKind)=>Promise<Outcome>};
