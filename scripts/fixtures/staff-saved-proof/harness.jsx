import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import DeliveryShipmentContext from '/src/features/operations/delivery/DeliveryShipmentContext';
import '/app/globals.css';
import '/app/interface.css';
import '/src/features/operations/operations.css';

const fixture = window.staffProofFixture;
const scope = 'fixture-shared-scope';
const driver = {
  uid: 'fixture-driver',
  workspaceId: scope,
  role: 'Driver',
  status: 'Approved',
  active: true,
  version: 1,
  email: 'driver@example.invalid',
  emailVerified: true,
  displayName: 'Fixture driver',
};
const shipment = id => ({
  id,
  version: 1,
  ownerId: scope,
  status: 'Dispatched',
  driverUid: driver.uid,
  reference: id,
  recipient: 'Fixture recipient',
  address: 'Fixture destination',
  expectedDelivery: '2026-11-05',
});
const activeShipment = shipment('fixture-active-shipment');
const hiddenShipment = shipment('fixture-hidden-shipment');
const hiddenEvidence = {
  id: 'fixture-hidden-proof',
  ownerId: scope,
  version: 1,
  integrityVersion: 2,
  shipmentId: hiddenShipment.id,
  stage: 'Delivery',
  type: 'Proof of Delivery',
  captureSource: 'file',
  capturedAtClient: null,
  name: 'hidden-proof.png',
  path: `evidence/${scope}/${hiddenShipment.id}/fixture-hidden-proof`,
  bytes: 68,
  contentType: 'image/png',
  sha256: 'a'.repeat(64),
};
fixture.member = driver;
const noop = () => {};
const contextProps = {
  member: driver,
  busy: false,
  onBack: noop,
  command: async () => false,
  onActivityChange: noop,
  onRecoveryChange: noop,
  refreshKey: 0,
};

function Harness() {
  const [records, setRecords] = useState([]);
  const [visible, setVisible] = useState(true);
  const [assigned, setAssigned] = useState(true);
  const [recordedProofId, setRecordedProofId] = useState();
  useEffect(() => {
    fixture.publish = record => setRecords(previous => [...previous, record]);
    return () => { delete fixture.publish; };
  }, []);
  const activeEntry = {
    shipment: assigned ? activeShipment : {...activeShipment, driverUid: 'fixture-other-driver'},
    status: recordedProofId ? 'Delivered' : 'In Transit',
    delivery: recordedProofId ? {id: activeShipment.id, status: 'Delivered', version: 1, proofId: recordedProofId} : undefined,
  };
  return <main>
    <h1>Saved delivery proof fixture</h1>
    <button onClick={() => setVisible(false)}>Retire delivery fixture</button>
    <button onClick={() => { setRecordedProofId(records.at(-1)?.id); setVisible(true); }}>Reopen recorded delivery fixture</button>
    <button onClick={() => setAssigned(false)}>Reassign delivery fixture</button>
    <section aria-label="Active delivery fixture">
      <DeliveryShipmentContext {...contextProps} entry={activeEntry} visible={visible} evidence={records}/>
    </section>
    <section aria-label="Hidden delivery fixture">
      <DeliveryShipmentContext {...contextProps} entry={{shipment: hiddenShipment, status: 'Delivered',
        delivery: {id: hiddenShipment.id, status: 'Delivered', version: 1, proofId: hiddenEvidence.id}}}
        visible={false} evidence={[hiddenEvidence]}/>
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<StrictMode><Harness/></StrictMode>);
