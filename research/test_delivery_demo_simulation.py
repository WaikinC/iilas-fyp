import copy
import unittest
import delivery_demo_simulation as m
from delivery_demo_contract import FEATURES

class Replay(unittest.TestCase):
    def test_deterministic_family_views_and_asof_replay(self):
        cases=m.generate_families();self.assertEqual(len(cases),1200);self.assertEqual(cases,m.generate_families())
        families={c['familyId'] for c in cases};self.assertEqual(len(families),300)
        for c in cases:
            replay=m.replay_snapshot(c);self.assertEqual(tuple(replay['features']),FEATURES)
            self.assertNotIn('label',replay['features']);self.assertEqual(len([v for v in cases if v['familyId']==c['familyId']]),4)
    def test_bad_future_proof_chain_or_window_refuses(self):
        c=m.generate_families()[0]
        for change in [lambda x:x['ledger'].update(observedAtMs=x['ledger']['dispatchedAtMs']-1),lambda x:x['ledger'].update(expectedDeliveryDate='2026-02-30'),lambda x:x['ledger'].update(coverageComplete=False),lambda x:x['ledger']['events'].append({'atMs':x['ledger']['observedAtMs']+1,'status':'Attempt Failed','previousStatus':'In Transit'}),lambda x:x['ledger'].update(proof={'atMs':x['ledger']['observedAtMs']+1,'type':'Proof of Delivery','shipmentId':x['familyId']})]:
            x=copy.deepcopy(c);change(x)
            with self.assertRaises(ValueError):m.replay_snapshot(x)
    def test_complete_empty_history_and_closed_refusal(self):
        c=copy.deepcopy(m.generate_families()[0]);c['ledger']['events']=[]
        self.assertEqual(m.replay_snapshot(c)['facts']['currentStatus'],'Dispatched')
        c['ledger']['events'].append({'atMs':c['ledger']['observedAtMs'],'status':'Delivered','previousStatus':'Dispatched'})
        with self.assertRaises(ValueError):m.replay_snapshot(c)

if __name__=='__main__':unittest.main()
