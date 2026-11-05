import {createRoot} from 'react-dom/client';
import DeliveryRiskDemo,{DeliveryRiskRecovery} from '../../../src/features/operations/DeliveryRiskDemo';
import type {Membership} from '../../../src/features/workspace/WorkspaceGate';
import '../../../app/globals.css';
import '../../../app/interface.css';
import '../../../src/features/operations/operations.css';
import '../../../src/features/operations/delivery/delivery.css';

const {member}=(window as unknown as {deliveryUI:{member:Membership}}).deliveryUI;
const reassigned=new URLSearchParams(location.search).has('reassigned');
const shipment={id:'shipment',version:1,reference:'SHP-001',driverUid:member.uid};

createRoot(document.getElementById('root')!).render(<main className="delivery-workspace">
  {reassigned ? <DeliveryRiskRecovery member={member}/> : <div className="delivery-card">
    <DeliveryRiskDemo member={member} shipment={shipment}/>
  </div>}
</main>);
