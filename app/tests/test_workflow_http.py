"""Exercise the HTTP boundary and PostgreSQL with disposable household fixtures."""
from datetime import datetime, timezone, timedelta
from http.cookiejar import CookieJar
import json
from pathlib import Path
import sys
import threading
import unittest
import urllib.request
import urllib.error
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
from health_store import HealthStore

class WorkflowHTTP(unittest.TestCase):
 def test_record_crud_calendar_and_frozen_report_use_real_postgres(self):
  store=HealthStore('dbname=luklaan_test host=localhost');store.initialize()
  http=server.make_server(0);origin=f'http://127.0.0.1:{http.server_port}'
  thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
  jars=[CookieJar(),CookieJar()];clients=[urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar)) for jar in jars]
  def post(path,body,client=0):
   req=urllib.request.Request(origin+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Origin':origin})
   with clients[client].open(req) as response:return json.load(response)
  try:
   with patch.object(server,'STORE',store):
    first=post('/api/workspace',{'operation':'load'});post('/api/workspace',{'operation':'load'},1)
    self.assertEqual(first['revision'],0)
    when=(datetime.now(timezone.utc)-timedelta(hours=1)).isoformat()
    entry={'id':'workflow-only','kind':'bloodPressure','confirmed':True,'isDemo':False,'source':'voice','occurredAt':when,'payload':{'systolic':128,'diastolic':78}}
    plan={'id':'workflow-plan','title':'นัดทดสอบสมมติ','date':'2026-11-05','at':'14:00','planType':'appointment','status':'active'}
    state={'events':[entry],'calendarPlans':[plan]}
    saved=post('/api/workspace',{'operation':'save','revision':0,'state':state})
    self.assertEqual(saved['brief']['confirmedCount'],1)
    self.assertEqual(post('/api/workspace',{'operation':'load'},1)['state']['events'],[])
    report={'summary':'fixture report','sections':[{'title':'ความดัน','evidenceIds':['workflow-only','invented-id']}],'spokenSummary':'fixture'}
    with patch.object(server,'structured_response',return_value=report):
     summary=post('/api/physician-summary',{'events':[{'id':'untrusted-browser-record'}]})
    self.assertEqual(summary['report']['sections'][0]['evidenceIds'],['workflow-only'])
    entry['payload']['systolic']=135;entry['occurredAt']=(datetime.now(timezone.utc)-timedelta(hours=2)).isoformat();plan['at']='15:00'
    post('/api/workspace',{'operation':'save','revision':1,'state':state})
    loaded=post('/api/workspace',{'operation':'load'})
    self.assertEqual(loaded['state']['events'][0]['payload']['systolic'],135)
    self.assertEqual(loaded['state']['calendarPlans'][0]['at'],'15:00')
    with self.assertRaises(urllib.error.HTTPError) as stale:post('/api/workspace',{'operation':'save','revision':1,'state':state})
    self.assertEqual(stale.exception.code,409)
    state['events']=[];plan['status']='cancelled'
    deleted=post('/api/workspace',{'operation':'save','revision':2,'state':state})
    self.assertEqual(deleted['state']['events'],[]);self.assertEqual(deleted['state']['calendarPlans'][0]['status'],'cancelled')
    archive=post('/api/summary-history',{})['summaries']
    frozen=next(r for r in archive if r['id']==summary['snapshotId'])
    self.assertEqual(frozen['body']['evidence'][0]['payload']['systolic'],128)
    self.assertEqual(frozen['body']['evidence'][0]['occurredAt'],when)
    self.assertEqual(post('/api/summary-history',{},1)['summaries'],[])
  finally:
   http.shutdown();http.server_close();thread.join()
   with store.connect() as db:
    for jar in jars:
     for cookie in jar:
      if cookie.name=='luklaan_workspace':
       for table in ['audit','acknowledgements','summaries','observations','workspaces']:db.execute(f'DELETE FROM {table} WHERE '+('id' if table=='workspaces' else 'workspace')+'=%s',(cookie.value,))
   store.pool.close()
