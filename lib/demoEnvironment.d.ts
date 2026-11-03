export type DemoEnvironment={schema:'iilas-demo-environment-1.0';mode:'local-emulator'|'cloud-demo';projectId:string;storageBucket:string;functionsRegion:string;webOrigins:readonly string[]};
export const LOCAL_DEMO_ENVIRONMENT:DemoEnvironment;
export function validateDemoEnvironment(raw:unknown,allowlist:readonly DemoEnvironment[]):DemoEnvironment;
export function demoEnvironmentKey(profile:DemoEnvironment):string;
export function getDemoEndpoints(profile:DemoEnvironment,origin?:string):{functionsRegion:string;customerEvidenceUrl:string;emulators:Record<'auth'|'firestore'|'functions'|'storage',{host:string;port:number}>|null};
export function projectRecoveryStorage(storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,profile:DemoEnvironment):Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function initialiseDemoSDKs<A,U,D,F,S>(input:{profile:DemoEnvironment;allowlist:readonly DemoEnvironment[];options:{projectId:string;storageBucket:string};origin:string;existing?:A;factories:{initialise:(options:unknown)=>A;auth:(app:A)=>U;firestore:(app:A)=>D;functions:(app:A,region:string)=>F;storage:(app:A)=>S;connect:(sdk:U|D|F|S,endpoint:{host:string;port:number},kind:string)=>void}}):{profile:DemoEnvironment;app:A;auth:U;db:D;functions:F;storage:S};
