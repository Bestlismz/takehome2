from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from pathlib import Path
import sys
import unittest
import uuid
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from health_store import HealthStore, StoreError, alert_candidates
from server import clean_records


def observation(kind='bloodPressure',payload=None,**extra):
    return {'id':str(uuid.uuid4()),'kind':kind,'source':'manual','confirmed':True,'occurredAt':datetime.now(timezone.utc).isoformat(),'payload':payload or {'systolic':128,'diastolic':78},**extra}


class PostgreSQLHealthStore(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.store=HealthStore('dbname=luklaan_test host=localhost');cls.store.initialize()
    @classmethod
    def tearDownClass(cls):
        cls.store.pool.close()
    def setUp(self):
        self.workspace=str(uuid.uuid4());self.other=str(uuid.uuid4())
    def tearDown(self):
        with self.store.connect() as db:
            for table in ['audit','acknowledgements','summaries','observations','workspaces']:
                db.execute(f'DELETE FROM {table} WHERE '+('id' if table=='workspaces' else 'workspace')+' IN (%s,%s)',(self.workspace,self.other))
    def test_persists_confirmed_records_snapshot_and_isolates_households(self):
        real=observation(payload={'systolic':128,'diastolic':78,'image':'private'})
        result=self.store.save(self.workspace,{'events':[real,observation(isDemo=True),observation(confirmed=False)]},0)
        self.assertEqual(result['revision'],1);self.assertEqual(len(result['state']['events']),1)
        self.assertNotIn('image',result['state']['events'][0]['payload'])
        self.assertEqual(len(clean_records(result['state']['events'])),1)
        self.assertEqual(self.store.load(self.other)['state']['events'],[])
        restarted=HealthStore('dbname=luklaan_test host=localhost')
        self.assertEqual(restarted.load(self.workspace)['state']['events'][0]['id'],real['id']);restarted.pool.close()
        self.assertEqual(len(self.store.summaries(self.workspace)),1)
        self.assertEqual(self.store.summaries(self.other),[])
    def test_concurrent_revision_writes_have_one_winner(self):
        self.store.save(self.workspace,{'events':[]},0)
        def write(value):
            try:return self.store.save(self.workspace,{'events':[observation(payload={'systolic':value,'diastolic':78})]},1)['revision']
            except StoreError as error:return error.status
        with ThreadPoolExecutor(max_workers=2) as executor:
            self.assertCountEqual(list(executor.map(write,[130,140])),[2,409])
        self.assertEqual(len(self.store.load(self.workspace)['state']['events']),1)
    def test_acknowledgement_survives_reload_and_is_not_resolution(self):
        low=observation('glucose',{'value':60,'measured':True,'unit':'mg/dL'})
        result=self.store.save(self.workspace,{'events':[low]},0)
        alert=result['alerts'][0];self.assertEqual(alert['severity'],'attention')
        self.store.acknowledge(self.workspace,alert['id'])
        loaded=self.store.load(self.workspace)['alerts'][0]
        self.assertTrue(loaded['acknowledgedAt']);self.assertEqual(loaded['severity'],'attention')
        with self.assertRaises(StoreError):self.store.acknowledge(self.other,alert['id'])
    def test_edit_invalidates_old_alert_and_historical_records_are_not_current(self):
        e=observation('bloodPressure',{'systolic':190,'diastolic':125},occurredAt=(datetime.now(timezone.utc)-timedelta(days=2)).isoformat())
        result=self.store.save(self.workspace,{'events':[e]},0)
        self.assertTrue(result['alerts'][0]['historical']);self.assertEqual(result['alerts'][0]['severity'],'followup')
        e['payload']={'systolic':128,'diastolic':78}
        result=self.store.save(self.workspace,{'events':[e]},1)
        self.assertEqual(result['alerts'],[])
        self.assertEqual(len(self.store.summaries(self.workspace)),2)
    def test_duplicate_snapshot_is_deduplicated_and_ai_evidence_is_frozen(self):
        e=observation();state={'events':[e]}
        self.store.save(self.workspace,state,0);self.store.save(self.workspace,state,1)
        self.assertEqual(len(self.store.summaries(self.workspace)),1)
        identity=self.store.save_report(self.workspace,{'summary':'facts'},[e],{},'test-model')
        self.store.save(self.workspace,{'events':[]},2)
        saved=next(r for r in self.store.summaries(self.workspace) if r['id']==identity)
        self.assertEqual(saved['body']['evidence'][0]['id'],e['id'])
    def test_unmeasured_glucose_invalid_dates_and_impossible_bp_rejected(self):
        for e in [observation('glucose',{'value':50,'measured':False,'unit':'mg/dL'}),observation(occurredAt='bad'),observation(payload={'systolic':100,'diastolic':120})]:
            with self.assertRaises(StoreError):self.store.save(self.workspace,{'events':[e]},0)
    def test_missing_readings_create_no_false_clinical_alert(self):
        self.assertEqual(alert_candidates({'events':[]}),[])
        self.assertEqual(self.store.load(self.workspace)['brief']['confirmedCount'],0)

if __name__=='__main__':unittest.main()
