"""Offline software checks; fictional cases are not accepted training labels."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


class SimulationTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('inventory_simulation'),
                             'Offline inventory simulator is not implemented')
        import inventory_simulation as api
        self.api = api

    def case(self):
        a = self.api
        return dict(sample_id='C01', family_id='F01', ancestor_ids=['BASE01'],
                    observed_at_ms=200*a.DAY, opening_at_ms=40*a.DAY,
                    opening=[dict(location='A', quantity=100, reserved=20, warehouse=5)],
                    reorder_level=80, coverage_start_ms=40*a.DAY, coverage_complete=True,
                    pending_corrections=[], context=a.make_context(80, 20, 1, 7),
                    events=[a.event('r0', 160*a.DAY, 'Receipt', 10),
                            a.event('i0', 170*a.DAY, 'Issue', 10)])

    def test_exact_features_and_inclusive_window(self):
        a = self.api
        case = self.case()
        case['events'] += [a.event('a0', 200*a.DAY, 'Adjustment', 1, direction='Increase')]
        result = a.assess_case(case)
        self.assertEqual(list(result['features']), list(a.FEATURES))
        self.assertEqual(list(result['features'].values()), [81, 20, 2, 1, 1, 40.0])
        self.assertTrue(result['eligible'])

    def test_reserved_demand_not_subtracted_twice(self):
        a = self.api
        result = a.assess_case(self.case())
        self.assertEqual(result['product']['quantityOnHand'], 100)
        self.assertEqual(result['features']['available_quantity'], 80)

    def test_illegal_events_and_future_inputs_refused(self):
        a = self.api
        for extra in [a.event('bad', 190*a.DAY, 'Issue', 1000),
                      a.event('bad', 190*a.DAY, 'Release', 20),
                      a.event('bad', 201*a.DAY, 'Receipt', 1),
                      a.event('bad', 190*a.DAY, 'Receipt', True),
                      a.event('bad', 190*a.DAY, 'Transfer', 1, target=' a '),
                      a.event('bad', 190*a.DAY, 'Adjustment', 1, direction='Invalid')]:
            case = self.case(); case['events'].append(extra)
            with self.subTest(extra=extra), self.assertRaises(ValueError): a.assess_case(case)
        case = self.case(); case['context']['known_at_ms'] = 201*a.DAY
        with self.assertRaises(ValueError): a.assess_case(case)

    def test_transfer_conserves_totals_and_bin_reservations(self):
        a = self.api
        case = self.case(); case['events'].append(a.event('t0', 180*a.DAY, 'Transfer', 30, target='B'))
        result = a.assess_case(case)
        self.assertEqual(result['product']['quantityOnHand'], 100)
        self.assertEqual(result['product']['reservedQuantity'], 20)
        self.assertEqual([b['quantity'] for b in result['product']['locationBalances']], [70, 30])
        case['events'].append(a.event('bad', 181*a.DAY, 'Transfer', 51, target='B'))
        with self.assertRaises(ValueError): a.assess_case(case)

    def test_correction_keeps_history_and_uses_older_receipt(self):
        a = self.api
        case = self.case()
        case['events'] = [a.event('r0', 150*a.DAY, 'Receipt', 10),
                          a.event('r1', 180*a.DAY, 'Receipt', 5),
                          a.event('c1', 190*a.DAY, 'Correction', 5, direction='Decrease', correction='r1')]
        result = a.assess_case(case)
        self.assertEqual(result['features']['days_since_replenishment'], 50)
        self.assertEqual(result['features']['movement_frequency'], 2)
        self.assertEqual(result['features']['adjustment_count'], 0)
        self.assertEqual(len(case['events']), 3)
        case['events'].append(a.event('c2', 191*a.DAY, 'Correction', 5, direction='Decrease', correction='r1'))
        with self.assertRaises(ValueError): a.assess_case(case)

    def test_unknown_history_and_pending_receipt_stay_null(self):
        a = self.api
        case = self.case(); case['coverage_complete'] = False
        result = a.assess_case(case)
        self.assertIsNone(result['features']['movement_frequency']); self.assertFalse(result['eligible'])
        case = self.case(); case['pending_corrections'] = ['r0']
        self.assertIsNone(a.assess_case(case)['features']['days_since_replenishment'])
        case = self.case(); case['events'] = []
        self.assertIsNone(a.assess_case(case)['features']['days_since_replenishment'])

    def test_duplicate_events_timestamps_and_bad_balances_refused(self):
        a = self.api
        case = self.case(); case['events'].append(copy.deepcopy(case['events'][0]))
        with self.assertRaises(ValueError): a.assess_case(case)
        case = self.case(); case['opening'][0]['reserved'] = 101
        with self.assertRaises(ValueError): a.assess_case(case)
        case = self.case(); case['opening'].append(dict(location=' a ', quantity=1, reserved=0, warehouse=0))
        with self.assertRaises(ValueError): a.assess_case(case)

    def test_same_seed_cases_identical_and_labels_blank(self):
        a = self.api
        cases, design = a.build_pilot(42)
        self.assertEqual((cases, design), a.build_pilot(42))
        self.assertNotEqual(cases, a.build_pilot(43)[0])
        self.assertEqual(len(cases), 60)
        self.assertEqual(len({c['family_id'] for c in cases}), 60)
        self.assertEqual(sorted(design['intended_bucket_counts'].values()), [20, 20, 20])
        for case in cases:
            self.assertTrue(a.assess_case(case)['eligible'])
            self.assertNotIn('label', case); self.assertNotIn('regime', case)
        a.audit_families(cases)

    def test_reused_ancestry_cannot_claim_new_family(self):
        a = self.api
        first = self.case(); second = copy.deepcopy(first)
        second.update(sample_id='C02', family_id='F02')
        with self.assertRaises(ValueError): a.audit_families([first, second])
        second['family_id'] = first['family_id']
        a.audit_families([first, second])

    def test_renamed_event_ids_and_correction_links_cannot_hide_copy(self):
        a = self.api
        first = a.build_pilot(42)[0][1]
        second = copy.deepcopy(first)
        second.update(sample_id='Copy', family_id='NewFamily', ancestor_ids=['NewBase'])
        renamed = {r['event_id']: f'z{n:03}' for n, r in enumerate(sorted(second['events'], key=lambda r: (r['at_ms'], r['event_id'])))}
        for row in second['events']:
            row['event_id'] = renamed[row['event_id']]
            if row['correction_of']: row['correction_of'] = renamed[row['correction_of']]
        a.assess_case(second)
        with self.assertRaises(ValueError): a.audit_families([first, second])

    def test_real_trajectory_coverage_not_just_design_names(self):
        a = self.api
        cases, design = a.build_pilot(42)
        indexed = {c['sample_id']: c for c in cases}
        self.assertGreaterEqual(max(a.assess_case(c)['features']['adjustment_count'] for c in cases), 5)
        self.assertGreater(len({a.assess_case(c)['features']['adjustment_count'] for c in cases}), 2)
        for intended in design['assignments']:
            if intended['regime'] != 'depleting': continue
            case = indexed[intended['sample_id']]
            recent = [r for r in case['events'] if r['at_ms'] >= case['observed_at_ms']-6*a.DAY]
            self.assertGreaterEqual(sum(r['type'] == 'Issue' for r in recent), 3)
            self.assertGreater(sum(r['quantity'] for r in recent if r['type'] == 'Issue'),
                               sum(r['quantity'] for r in recent if r['type'] == 'Receipt'))

    def test_cutoff_same_time_sort_and_nonfinite_values(self):
        a = self.api
        case = self.case(); case['reorder_level'] = float('nan')
        with self.assertRaises(ValueError): a.assess_case(case)
        case = self.case(); case['events'] = list(reversed(case['events']))
        self.assertEqual(a.assess_case(case), a.assess_case(self.case()))

    def git_ok(self, args, **kwargs):
        return subprocess.CompletedProcess(args, 0, stdout='', stderr='')

    def test_exclusive_output_integrity_and_offline_packet(self):
        a = self.api
        with tempfile.TemporaryDirectory() as temp, patch.object(a.subprocess, 'run', self.git_ok):
            repo = Path(temp); dest = repo/'research/datasets/inventory-simulation-v1/pilot-01'
            summary = a.generate_pilot(dest, repo_root=repo)
            self.assertEqual(summary['families'], 60)
            self.assertEqual(summary['reviewed_labels'], 0)
            self.assertEqual(a.audit_pilot(dest, repo_root=repo)['status'], 'PASS')
            self.assertTrue((dest/'review.html').is_file())
            self.assertNotIn('intended_bucket', (dest/'review.html').read_text())
            twin = dest.with_name('pilot-02')
            a.generate_pilot(twin, repo_root=repo)
            self.assertEqual((dest/'manifest.json').read_bytes(), (twin/'manifest.json').read_bytes())
            with self.assertRaises((ValueError, FileExistsError)): a.generate_pilot(dest, repo_root=repo)
            first = next((dest/'dossiers').glob('*.json'))
            case = json.loads(first.read_text()); case['opening'][0]['quantity'] += 1
            first.write_text(json.dumps(case))
            with self.assertRaises(ValueError): a.audit_pilot(dest, repo_root=repo)

    def test_features_match_canonical_application_without_qualifying_real_history(self):
        a = self.api
        cases = a.build_pilot(42)[0][:8]
        script = """
import {buildInventoryAssessment} from './lib/inventoryRisk.js';
import {applyLocationMovement} from './lib/locationStock.js';
let raw='';for await(const b of process.stdin)raw+=b;
const results=JSON.parse(raw).map(({c,p})=>{
 let product={...p,location:c.opening[0].location,quantityOnHand:c.opening.reduce((s,r)=>s+r.quantity,0),reservedQuantity:c.opening.reduce((s,r)=>s+r.reserved,0),warehouseReservedQuantity:c.opening.reduce((s,r)=>s+r.warehouse,0),locationBalances:c.opening};
 const seen=new Map();const correctionLinks={};
 for(const e of [...c.events].sort((x,y)=>x.at_ms-y.at_ms||x.event_id.localeCompare(y.event_id))){
  let type=e.type;
  if(type==='Correction'){type=seen.get(e.correction_of).type==='Transfer'?'Transfer':'Adjustment';correctionLinks[e.correction_of]={status:'Approved'};}
  product={...product,...applyLocationMovement(product,{type,quantity:e.quantity,locationFrom:e.location_from,locationTo:e.location_to,adjustmentDirection:e.direction})};seen.set(e.event_id,e);
 }
 const movements=c.events.map(e=>({id:e.event_id,atMs:e.at_ms,type:e.type}));
 const receiptCandidates=movements.filter(e=>e.type==='Receipt').sort((x,y)=>y.atMs-x.atMs||y.id.localeCompare(x.id)).slice(0,21);
 return {product,assessment:buildInventoryAssessment({productId:c.sample_id,product:{...product,version:1},movements:movements.filter(e=>e.atMs>=c.observed_at_ms-30*86400000),receiptCandidates,correctionLinks,cutoffMs:c.observed_at_ms})};
});console.log(JSON.stringify(results));
"""
        output = subprocess.run(['node', '--input-type=module', '-e', script], cwd=a.ROOT,
                                input=json.dumps([dict(c=c, p=a.assess_case(c)['product']) for c in cases]),
                                capture_output=True, text=True, check=True, timeout=30)
        results = json.loads(output.stdout)
        for case, result in zip(cases, results):
            expected = a.assess_case(case)
            for key in ('quantityOnHand', 'reservedQuantity', 'warehouseReservedQuantity', 'location'):
                self.assertEqual(expected['product'][key], result['product'][key])
            actual = result['assessment']
            for key in ('available_quantity', 'reserved_quantity', 'reorder_distance', 'days_since_replenishment'):
                self.assertEqual(expected['features'][key], actual['features'][key])
            self.assertEqual(expected['features']['movement_frequency'], actual['history']['observedMovementCount'])
            self.assertEqual(expected['features']['adjustment_count'], actual['history']['observedAdjustmentCount'])
            self.assertIsNone(actual['features']['movement_frequency'])
            self.assertEqual(actual['history']['coverage'], 'Unverified')

    def test_destination_escape_existing_and_symlink_refused(self):
        a = self.api
        with tempfile.TemporaryDirectory() as temp, patch.object(a.subprocess, 'run', self.git_ok):
            repo = Path(temp)
            for dest in [repo/'outside', repo/'research/datasets/inventory-simulation-v1',
                         repo/'research/datasets/inventory-simulation-v1/../escape']:
                with self.subTest(dest=dest), self.assertRaises(ValueError): a.validate_destination(dest, repo)
            parent = repo/'research/datasets/inventory-simulation-v1'; parent.mkdir(parents=True)
            (parent/'existing').mkdir()
            with self.assertRaises(ValueError): a.validate_destination(parent/'existing', repo)
            with patch.object(a, 'is_link', return_value=True):
                with self.assertRaises(ValueError): a.validate_destination(parent/'fresh', repo)

    def test_unignored_or_tracked_destination_refused(self):
        a = self.api
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp); dest = repo/'research/datasets/inventory-simulation-v1/fresh'
            for code, stdout in [(1, ''), (0, 'tracked.csv\n')]:
                def git_bad(args, **kwargs):
                    return subprocess.CompletedProcess(args, code if 'check-ignore' in args else 0,
                                                       stdout=stdout if 'ls-files' in args else '', stderr='')
                with patch.object(a.subprocess, 'run', git_bad), self.assertRaises(ValueError):
                    a.validate_destination(dest, repo)

    def test_csv_handles_closed_and_review_intentions_validated(self):
        a = self.api
        import warnings
        with tempfile.TemporaryDirectory() as temp, patch.object(a.subprocess, 'run', self.git_ok):
            repo = Path(temp); dest = repo/'research/datasets/inventory-simulation-v1/pilot'
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter('always', ResourceWarning)
                a.generate_pilot(dest, repo_root=repo)
                import gc
                gc.collect()
            self.assertFalse([w for w in caught if issubclass(w.category, ResourceWarning)])
            # Even updating transport hashes must not turn design intentions into labels.
            design_path = dest/'sealed-design.json'
            design = json.loads(design_path.read_text()); design['intended_bucket_counts']['Normal'] = 100
            design_path.write_bytes(a.canonical(design))
            manifest_path = dest/'manifest.json'; manifest = json.loads(manifest_path.read_text())
            import hashlib
            data = design_path.read_bytes()
            manifest['files']['sealed-design.json'] = dict(sha256=hashlib.sha256(data).hexdigest(), bytes=len(data))
            manifest_path.write_bytes(a.canonical(manifest))
            with self.assertRaises(ValueError): a.audit_pilot(dest, repo_root=repo)

    def test_rehashed_html_and_renamed_dossier_are_rejected(self):
        a = self.api
        import hashlib
        for mutation in ('html', 'name'):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as temp, patch.object(a.subprocess, 'run', self.git_ok):
                repo = Path(temp); dest = repo/'research/datasets/inventory-simulation-v1/pilot'
                a.generate_pilot(dest, repo_root=repo)
                path = next((dest/'dossiers').glob('*.html' if mutation == 'html' else '*.json'))
                manifest_path = dest/'manifest.json'; manifest = json.loads(manifest_path.read_text())
                old = path.relative_to(dest).as_posix()
                if mutation == 'html':
                    path.write_text('<h1>Suggested label: Normal</h1><p>False stock: 9999</p>')
                    body = path.read_bytes()
                    manifest['files'][old] = dict(sha256=hashlib.sha256(body).hexdigest(), bytes=len(body))
                else:
                    renamed = path.with_name('unrelated-name.json'); path.rename(renamed)
                    manifest['files'][renamed.relative_to(dest).as_posix()] = manifest['files'].pop(old)
                manifest_path.write_bytes(a.canonical(manifest))
                with self.assertRaises(ValueError): a.audit_pilot(dest, repo_root=repo)


if __name__ == '__main__': unittest.main()
