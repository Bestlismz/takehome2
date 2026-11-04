import sys,unittest,uuid
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from health_store import HealthStore,StoreError,valid_state

class CalendarPlans(unittest.TestCase):
 def test_invalid_dates_and_prescriptions_are_rejected_at_server_boundary(self):
  base={'id':'one','title':'นัดติดตาม','date':'2026-11-04','at':'09:00','planType':'appointment','status':'active'}
  for patch in [{'date':'2026-02-31'},{'at':'29:00'},{'planType':'medicine'}]:
   with self.assertRaises(StoreError):valid_state({'events':[],'calendarPlans':[{**base,**patch}]})
 def test_plan_edit_and_cancellation_persist_without_changing_medical_observations(self):
  store=HealthStore('dbname=luklaan_test host=localhost');workspace=str(uuid.uuid4())
  plan={'id':'one','title':'นัดติดตาม','date':'2026-11-04','at':'09:00','planType':'appointment','status':'active','note':''}
  try:
   saved=store.save(workspace,{'events':[],'calendarPlans':[plan]},0)
   self.assertEqual(saved['state']['calendarPlans'][0]['at'],'09:00')
   plan['at']='10:00';store.save(workspace,{'events':[],'calendarPlans':[plan]},1)
   plan['status']='cancelled';store.save(workspace,{'events':[],'calendarPlans':[plan]},2)
   self.assertEqual(store.load(workspace)['state']['calendarPlans'][0]['status'],'cancelled')
   self.assertEqual(store.load(workspace)['state']['events'],[])
  finally:
   with store.connect() as db:
    for table in ['audit','acknowledgements','summaries','observations','workspaces']:
     db.execute(f'DELETE FROM {table} WHERE '+('id' if table=='workspaces' else 'workspace')+'=%s',(workspace,))
   store.pool.close()
