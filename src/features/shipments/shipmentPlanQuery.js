import {collection,documentId,limit,query,where} from 'firebase/firestore';
/** A one-ID interval avoids the emulator's null-resource equality rule branch. */
export function shipmentPlanQuery(db,scope,id){
 if(typeof scope!=='string'||!scope||scope.includes('/')||typeof id!=='string'||!id||id.length>128||id.includes('/'))throw Error('Invalid shipment plan scope or identifier.');
 return query(collection(db,'transportPlans'),where('ownerId','==',scope),where(documentId(),'>=',id),where(documentId(),'<=',id),limit(1));
}
