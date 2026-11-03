export type CustomerSummary={shipmentId:string;reference:string;expectedDelivery:string|null;status:string};
export type CustomerProof={evidenceId:string;fileName:string;contentType:string;bytes:number};
export type CustomerDetail=CustomerSummary&{timeline:{rows:{status:string;atMs:number|null}[];hasMore:boolean;coverage:string};location:{latitude:number;longitude:number;accuracy:number;submittedAtMs:number;capturedAtMs?:number}|null;proof:CustomerProof|null;observedAtMs:number};
export type CustomerPage={rows:CustomerSummary[];cursor:string|null;hasMore:boolean;observedAtMs:number;scanned:number};
export function validateCustomerList(value:unknown):CustomerPage;
export function validateCustomerDetail(value:unknown):CustomerDetail;
export function fetchCustomerProof(options:{user:{uid:string;getIdToken:(forceRefresh?:boolean)=>Promise<string>};customerUid:string;shipmentId:string;proof:CustomerProof;siteUrl:string;isCurrent:()=>boolean;signal?:AbortSignal;fetcher?:typeof fetch;environment?:import('./demoEnvironment.js').DemoEnvironment|import('./sparkRuntime.js').SparkRuntime}):Promise<Blob>;
