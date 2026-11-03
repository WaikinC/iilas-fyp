import {getFirestore} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {locationBalances} from './locationStock.js';
import {validateDemoProductSource,demoProductFactsPayload} from './inventoryContextAI.js';
const fail=(message,code='failed-precondition')=>{throw Object.assign(new Error(message),{code});};
const hash=value=>createHash('sha256').update(value).digest('hex');
export async function captureDemoProductSource(tx,scope,productId,observedAtMs){
 const snapshot=await tx.get(getFirestore().collection('products').doc(productId));
 if(!snapshot.exists)fail('The selected demo product is unavailable.');
 const product=snapshot.data();
 if(product.ownerId!==scope||product.status!=='Active'||product.archived)fail('Choose an active product from this shared system.');
 locationBalances(product);
 const source=validateDemoProductSource({productId,productVersion:product.version,name:product.name,sku:product.sku,quantityOnHand:product.quantityOnHand,reservedQuantity:product.reservedQuantity??0,reorderLevel:product.reorderLevel,observedAtMs,dataOrigin:'demonstration-test',factsSha256:'0'.repeat(64)});
 source.factsSha256=hash(demoProductFactsPayload(source));return source;
}
