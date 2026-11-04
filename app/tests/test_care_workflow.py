from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import os
import sys
import unittest
import uuid
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from care_workflow import CareWorkflow
from health_store import HealthStore, StoreError


class CareWorkflowPostgreSQL(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.store = HealthStore('dbname=luklaan_test host=localhost')
        cls.store.initialize()

    @classmethod
    def tearDownClass(cls):
        cls.store.pool.close()

    def setUp(self):
        self.workspace, self.other = str(uuid.uuid4()), str(uuid.uuid4())
        self.workflow = CareWorkflow(self.store)
        self.env = patch.dict(os.environ, {'LUKLAAN_CLINICIAN_REVIEW_TOKEN': 'test-reviewer-only'})
        self.env.start()
        self.revision = 0

    def tearDown(self):
        self.env.stop()
        with self.store.connect() as db:
            for table in ['audit', 'acknowledgements', 'summaries', 'observations', 'workspaces']:
                db.execute(f'DELETE FROM {table} WHERE ' + ('id' if table == 'workspaces' else 'workspace') + ' IN (%s,%s)', (self.workspace, self.other))

    def mutate(self, operation, **body):
        result = self.workflow.handle(self.workspace, dict(operation=operation, expectedRevision=self.revision, **body))
        self.revision = result['revision']
        return result

    def draft(self, **extra):
        body = dict(title='Test plan', sourceText='Fictional medicine source', medications=[{'name': 'Test medicine', 'dose': '1 tablet', 'instructions': 'after breakfast', 'uncertain': False}], uncertainties=[])
        body.update(extra)
        return self.mutate('plan.draft', **body)

    def review(self, identity, decision='approved', **extra):
        return self.mutate('plan.review', id=identity, decision=decision, reviewerToken='test-reviewer-only', reviewer='Test reviewer', **extra)

    def test_plan_requires_preliminary_and_authorized_review_and_keeps_old_versions(self):
        doc = self.draft()
        identity = doc['plans'][0]['id']
        self.assertIsNone(doc['activePlanId'])
        with self.assertRaises(StoreError):
            self.review(identity)
        self.mutate('plan.submit', id=identity, caregiverReviewed=True)
        approved = self.review(identity)
        self.assertEqual(approved['activePlanId'], identity)
        self.assertEqual(approved['plans'][0]['status'], 'approved')
        second = self.draft(title='Second version')
        second_id = second['plans'][1]['id']
        self.mutate('plan.submit', id=second_id, caregiverReviewed=True)
        final = self.review(second_id)
        self.assertEqual([item['version'] for item in final['plans']], [1, 2])
        self.assertEqual(final['plans'][0]['sourceText'], 'Fictional medicine source')
        self.assertEqual(final['activePlanId'], second_id)
        self.assertEqual(len(final['audit']), 6)
        self.assertNotIn('test-reviewer-only', json.dumps(final))
        self.assertEqual(CareWorkflow(self.store).handle(self.workspace, {})['activePlanId'], second_id)
        with self.assertRaises(StoreError):
            self.mutate('plan.submit', id=identity, caregiverReviewed=True)

    def test_uncertain_and_missing_medication_fields_block_activation(self):
        for extra in [dict(uncertainties=['Illegible dose']), dict(medications=[{'name': 'Test', 'dose': '', 'instructions': 'after food', 'uncertain': False}]), dict(medications=[{'name': 'Test', 'dose': '1', 'instructions': 'after food', 'uncertain': True}])]:
            doc = self.draft(**extra)
            identity = doc['plans'][-1]['id']
            self.mutate('plan.submit', id=identity, caregiverReviewed=True)
            with self.assertRaises(StoreError) as error:
                self.review(identity)
            self.assertEqual(error.exception.status, 409)
        self.assertIsNone(self.workflow.handle(self.workspace, {})['activePlanId'])

    def test_no_client_role_can_substitute_for_configured_review_credential(self):
        identity = self.draft()['plans'][0]['id']
        self.mutate('plan.submit', id=identity, caregiverReviewed=True)
        for token in [None, '', 'wrong', {'role': 'doctor'}]:
            with self.assertRaises(StoreError) as error:
                self.mutate('plan.review', id=identity, decision='approved', reviewer='Pretend doctor', reviewerToken=token)
            self.assertEqual(error.exception.status, 403)
        with patch.dict(os.environ, {'LUKLAAN_CLINICIAN_REVIEW_TOKEN': ''}):
            self.assertFalse(self.workflow.handle(self.workspace, {})['reviewerConfigured'])
            with self.assertRaises(StoreError):
                self.review(identity)

    def test_handover_completion_is_persistent_and_isolated(self):
        doc = self.mutate('handover.add', text='Ask about meal', assignee='Test family')
        identity = doc['handovers'][0]['id']
        self.assertEqual(self.workflow.handle(self.other, {})['handovers'], [])
        doc = self.mutate('handover.complete', id=identity)
        self.assertEqual(doc['handovers'][0]['status'], 'completed')
        self.assertIn('completedAt', doc['handovers'][0])
        self.assertEqual(CareWorkflow(self.store).handle(self.workspace, {})['handovers'], doc['handovers'])

    def test_report_review_links_real_stored_snapshot_in_own_household(self):
        saved = self.store.save(self.workspace, {'events': []}, 0)
        identity = saved['snapshotId']
        doc = self.mutate('report.review', id=identity, decision='reviewed', reviewerToken='test-reviewer-only', reviewer='Test reviewer', note='Evidence checked')
        self.assertEqual(doc['reviews'][0]['summaryId'], identity)
        self.assertEqual(doc['summaryOptions'][0]['id'], identity)
        self.assertEqual(doc['metrics']['confirmedCount'], 0)
        self.assertEqual(doc['metrics']['missing'], ['bloodPressure', 'glucose', 'adherence'])
        with self.assertRaises(StoreError) as error:
            self.workflow.handle(self.other, {'operation': 'report.review', 'expectedRevision': 0, 'id': identity, 'decision': 'reviewed', 'reviewerToken': 'test-reviewer-only', 'reviewer': 'Test'})
        self.assertEqual(error.exception.status, 404)

    def test_share_token_is_returned_once_hashed_and_revoke_denies_subsequent_reads(self):
        identity = self.draft()['plans'][0]['id']
        self.mutate('plan.submit', id=identity, caregiverReviewed=True)
        self.review(identity)
        doc = self.mutate('access.create', label='Test family link', scope='family_summary')
        token, grant = doc['accessToken'], doc['grantId']
        shared = self.workflow.handle(None, {'operation': 'access.read', 'token': token})
        self.assertEqual(shared['activePlan']['version'], 1)
        self.assertNotIn('sourceText', json.dumps(shared))
        self.assertNotIn('audit', shared)
        owner = self.workflow.handle(self.workspace, {})
        self.assertNotIn('accessToken', owner)
        self.assertNotIn(token, json.dumps(owner))
        with self.store.connect() as db:
            row = db.execute('SELECT token_hash FROM care_access_grants WHERE id=%s', (grant,)).fetchone()
            self.assertNotEqual(row['token_hash'], token)
        with self.assertRaises(StoreError):
            self.workflow.handle(self.other, {'operation': 'access.revoke', 'expectedRevision': 0, 'id': grant})
        self.mutate('access.revoke', id=grant)
        with self.assertRaises(StoreError) as error:
            self.workflow.handle(None, {'operation': 'access.read', 'token': token})
        self.assertEqual(error.exception.status, 403)

    def test_conflicting_revisions_allow_only_one_concurrent_handover(self):
        self.workflow.handle(self.workspace, {})
        def write(name):
            try:
                return self.workflow.handle(self.workspace, {'operation': 'handover.add', 'expectedRevision': 0, 'text': name, 'assignee': 'Test'})['revision']
            except StoreError as error:
                return error.status
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertCountEqual(list(pool.map(write, ['A', 'B'])), [1, 409])
        self.assertEqual(len(self.workflow.handle(self.workspace, {})['handovers']), 1)

    def test_invalid_shapes_do_not_create_workflow_mutations(self):
        for body in [{'operation': {}}, {'operation': 'unknown'}, {'operation': 'handover.add', 'expectedRevision': True}, {'operation': 'plan.draft', 'expectedRevision': 0, 'title': 'x', 'medications': []}, {'operation': 'access.create', 'expectedRevision': 0, 'scope': 'all_records', 'label': 'x'}]:
            with self.assertRaises(StoreError):
                self.workflow.handle(self.workspace, body)
        self.assertEqual(self.workflow.handle(self.workspace, {})['revision'], 0)

    def test_handover_keeps_source_snapshot_and_rejects_another_household_record(self):
        from datetime import datetime, timezone
        event={'id':'fixture-bp-source','kind':'bloodPressure','confirmed':True,'occurredAt':datetime.now(timezone.utc).isoformat(),'source':'device','payload':{'systolic':128,'diastolic':78}}
        self.store.save(self.workspace,{'events':[event]},0)
        doc=self.mutate('handover.add',text='Fictional follow-up',assignee='Test caregiver',evidenceId=event['id'])
        self.assertEqual(doc['handovers'][0]['evidence']['payload']['systolic'],128)
        event['payload']['systolic']=135
        self.store.save(self.workspace,{'events':[event]},1)
        loaded=self.workflow.handle(self.workspace,{'operation':'load'})
        self.assertEqual(loaded['handovers'][0]['evidence']['payload']['systolic'],128)
        with self.assertRaises(StoreError) as error:
            self.workflow.handle(self.other,{'operation':'handover.add','expectedRevision':0,'text':'Wrong household','assignee':'Test','evidenceId':event['id']})
        self.assertEqual(error.exception.status,404)
