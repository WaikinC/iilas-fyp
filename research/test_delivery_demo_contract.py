"""Delivery policy/units/boundary/parity tests; no scientific data or fitting."""
import copy
import hashlib
import json
import math
from pathlib import Path
import subprocess
import unittest
import delivery_demo_contract as m


def facts(**patch):
    return dict(expectedDurationHours=10,elapsedHours=1,failedAttempts=0,hasProof=False,
                statusEventCount=1,parcelCount=2,hoursSinceLastUpdate=1,currentStatus='In Transit',**{})|patch


def snapshot(**patch):
    return dict(observedAtMs=100*3600000,deadlineMs=110*3600000,dispatchedAtMs=90*3600000,
                lastUpdateAtMs=99*3600000,currentStatus='In Transit',failedAttempts=0,
                proofValid=False,invalidTransition=False)|patch


class Contract(unittest.TestCase):
    def test_exact_encoding_and_named_tie(self):
        f=m.features_for_facts(facts());self.assertEqual(tuple(f),m.FEATURES);self.assertEqual(len(f),10)
        self.assertEqual(f['status_in_transit'],1);self.assertEqual(f['has_proof'],0)
        self.assertEqual(m.feature_digest(f),hashlib.sha256(m.feature_payload(f).encode()).hexdigest())
        self.assertEqual(m.choose_label(dict(High=.5,Medium=0,Low=.5)),'Low')
        self.assertEqual(m.feature_payload(m.features_for_facts(facts(elapsedHours=-0.0,hoursSinceLastUpdate=0))),m.feature_payload(m.features_for_facts(facts(elapsedHours=0,hoursSinceLastUpdate=0))))

    def test_units_unknowns_and_inconsistencies(self):
        bad=[{'expectedDurationHours':0},{'expectedDurationHours':721},{'elapsedHours':1441},
             {'failedAttempts':21},{'statusEventCount':1001},{'parcelCount':0},{'parcelCount':1.5},
             {'hoursSinceLastUpdate':2},{'hasProof':1},{'currentStatus':'Delivered'},
             {'failedAttempts':2,'statusEventCount':1},{'currentStatus':'Dispatched'}, {'extra':1}]
        for patch in bad:
            with self.subTest(patch=patch),self.assertRaises(ValueError):m.validate_facts(facts(**patch))
        for key in ['expectedDurationHours','elapsedHours','failedAttempts','statusEventCount','parcelCount','hoursSinceLastUpdate']:
            for v in [None,'1',True,float('nan'),float('inf')]:
                with self.subTest(key=key,v=v),self.assertRaises(ValueError):m.validate_facts(facts(**{key:v}))
        missing=facts();del missing['hasProof']
        with self.assertRaises(ValueError):m.validate_facts(missing)

    def test_policy_boundaries_precedence_and_proof_absence(self):
        cases=[({},'Low'),({'elapsedHours':8},'Medium'),({'elapsedHours':math.nextafter(8,0)},'Low'),
               ({'failedAttempts':1},'Medium'),({'failedAttempts':2,'statusEventCount':3},'High'),
               ({'elapsedHours':34},'High'),({'elapsedHours':math.nextafter(34,0)},'Medium'),
               ({'expectedDurationHours':100,'elapsedHours':30,'hoursSinceLastUpdate':24},'Medium'),
               ({'expectedDurationHours':47,'elapsedHours':49,'hoursSinceLastUpdate':48},'High')]
        for patch,label in cases:
            with self.subTest(patch=patch):self.assertEqual(m.teaching_label(facts(**patch))['label'],label)
        self.assertEqual(m.teaching_label(facts(hasProof=True)),m.teaching_label(facts()))

    def test_rules_score_unknowns_and_closed_clocks(self):
        self.assertEqual(m.evaluate_rules(snapshot())['score'],0)
        x=m.evaluate_rules(snapshot(deadlineMs=99*3600000,failedAttempts=2));self.assertEqual((x['score'],x['level']),(55,'High'))
        x=m.evaluate_rules(snapshot(currentStatus='Delivered',proofValid=False));self.assertEqual((x['score'],x['level']),(20,'Medium'))
        x=m.evaluate_rules(snapshot(currentStatus='Returned',deadlineMs=1,lastUpdateAtMs=1));self.assertEqual(x['score'],0)
        x=m.evaluate_rules(snapshot(invalidTransition=True));self.assertEqual((x['score'],x['level'],x['dataReviewRequired']),(15,'Low',True))
        x=m.evaluate_rules(snapshot(lastUpdateAtMs=None,failedAttempts=2));self.assertFalse(x['complete']);self.assertIsNone(x['score']);self.assertIsNone(x['level']);self.assertEqual(x['matches'][0]['points'],25)
        self.assertEqual(m.evaluate_rules(snapshot(deadlineMs=100*3600000))['score'],0)
        self.assertEqual(m.evaluate_rules(snapshot(dispatchedAtMs=70*3600000,lastUpdateAtMs=76*3600000))['score'],0)
        self.assertEqual(m.evaluate_rules(snapshot(dispatchedAtMs=70*3600000,lastUpdateAtMs=75*3600000))['score'],10)

    def test_cross_language_payload_rules_and_labels(self):
        root=Path(__file__).resolve().parents[1];cases=[facts(),facts(elapsedHours=8.25),facts(expectedDurationHours=200,elapsedHours=24,hoursSinceLastUpdate=24)]
        script="import {deliveryFeaturesForFacts,deliveryFeaturePayload,teachingDeliveryLabel,evaluateDeliveryRules} from './lib/deliveryRiskDemo.js';let b='';for await(const c of process.stdin)b+=c;const x=JSON.parse(b);console.log(JSON.stringify({rows:x.facts.map(f=>({payload:deliveryFeaturePayload(deliveryFeaturesForFacts(f)),label:teachingDeliveryLabel(f)})),rule:evaluateDeliveryRules(x.snapshot)}));"
        result=subprocess.run(['node','--input-type=module','-e',script],input=json.dumps({'facts':cases,'snapshot':snapshot(failedAttempts=2)}),text=True,capture_output=True,cwd=root,check=True)
        data=json.loads(result.stdout)
        for f,row in zip(cases,data['rows']):self.assertEqual(row,dict(payload=m.feature_payload(m.features_for_facts(f)),label=m.teaching_label(f)))
        self.assertEqual(data['rule'],m.evaluate_rules(snapshot(failedAttempts=2)))

if __name__=='__main__':unittest.main()
