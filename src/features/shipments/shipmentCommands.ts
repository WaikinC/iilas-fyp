import type {ShipmentInput,ShipmentRow} from './shipmentPresentation';
export type ShipmentIntent={kind:'create';input:ShipmentInput}|{kind:'save';input:ShipmentInput;original:ShipmentRow|null}|{kind:'remove';original:ShipmentRow};
export type ShipmentCommandPorts={create:(input:ShipmentInput)=>Promise<unknown>;save:(input:ShipmentInput,original:ShipmentRow|null)=>Promise<unknown>;remove:(original:ShipmentRow)=>Promise<unknown>};
export type ShipmentCommandOrigin={authorityKey:string;generation:number};
export type ShipmentCommandResult={kind:'success'|'error';intent:ShipmentIntent;message:string};
export function createShipmentCommandRunner(ports:ShipmentCommandPorts,current:()=>ShipmentCommandOrigin&{allowed:boolean},onResult:(result:ShipmentCommandResult)=>void){
 let busy=false,retired=false;
 const matches=(origin:ShipmentCommandOrigin)=>{const now=current();return !retired&&now.allowed&&now.authorityKey===origin.authorityKey&&now.generation===origin.generation;};
 return {isBusy:()=>busy,retire:()=>{retired=true;},async run(intent:ShipmentIntent,origin:ShipmentCommandOrigin):Promise<'success'|'error'|'ignored'>{
  if(busy||!matches(origin))return 'ignored';
  const captured=structuredClone(intent);busy=true;
  try{
   let created:unknown;if(captured.kind==='create')created=await ports.create(captured.input);else if(captured.kind==='save')await ports.save(captured.input,captured.original);else await ports.remove(captured.original);
   if(!matches(origin))return 'ignored';
   onResult({kind:'success',intent:captured,message:captured.kind==='create'?`Shipment ${(created as {code?:string})?.code||''} created.`:captured.kind==='remove'?'Draft deleted.':captured.input.status==='Dispatched'?'Shipment dispatched.':'Shipment saved.'});return 'success';
  }catch(error){
   if(!matches(origin))return 'ignored';
   onResult({kind:'error',intent:captured,message:(error instanceof Error?error.message:'Unable to confirm this request.')+' Check the current shared record/reference before repeating the request.'});return 'error';
  }finally{busy=false;}
 }};
}
