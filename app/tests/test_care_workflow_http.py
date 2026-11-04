"""Persist the shared-session workflow through the actual HTTP API and PostgreSQL."""
from http.cookiejar import CookieJar
import json
import os
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

class CareWorkflowHTTP(unittest.TestCase):
    def test_draft_review_handover_and_revocation_survive_api_reload(self):
        store=HealthStore('dbname=luklaan_test host=localhost');store.initialize()
        http=server.make_server(0);origin=f'http://127.0.0.1:{http.server_port}'
        thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
        jar=CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        public=urllib.request.build_opener()
        def post(path,body,who=client):
            req=urllib.request.Request(origin+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Origin':origin})
            with who.open(req) as response:return json.load(response)
        try:
            with patch.object(server,'STORE',store),patch.dict(os.environ,{'LUKLAAN_CLINICIAN_REVIEW_TOKEN':'fixture-review-only'}):
                post('/api/workspace',{'operation':'load'})
                path='/api/care-workflow';doc=post(path,{'operation':'load'})
                def change(operation,**body):
                    nonlocal doc
                    doc=post(path,{'operation':operation,'expectedRevision':doc['revision'],**body});return doc
                change('plan.draft',title='Fictional test plan',sourceText='Synthetic document',medications=[{'name':'Fictional medicine','dose':'test dose','instructions':'Not for actual use','uncertain':False}],uncertainties=[])
                plan_id=doc['plans'][0]['id']
                change('plan.submit',id=plan_id,caregiverReviewed=True)
                with self.assertRaises(urllib.error.HTTPError) as denied:
                    change('plan.review',id=plan_id,reviewer='Fixture reviewer',reviewerToken='incorrect',decision='approved')
                self.assertEqual(denied.exception.code,403)
                change('plan.review',id=plan_id,reviewer='Fixture reviewer',reviewerToken='fixture-review-only',decision='approved')
                change('handover.add',text='Synthetic follow-up',assignee='Fixture caregiver')
                change('handover.complete',id=doc['handovers'][0]['id'])
                self.assertEqual(doc['handovers'][0]['status'],'completed')
                change('access.create',label='Fixture access',scope='family_summary')
                token=doc['accessToken'];grant=doc['grants'][-1]['id']
                shared=post(path,{'operation':'access.read','token':token},public)
                self.assertEqual(shared['activePlan']['version'],1)
                self.assertNotIn('sourceText',shared['activePlan'])
                change('access.revoke',id=grant)
                with self.assertRaises(urllib.error.HTTPError) as revoked:post(path,{'operation':'access.read','token':token},public)
                self.assertEqual(revoked.exception.code,403)
                reloaded=post(path,{'operation':'load'})
                self.assertEqual(reloaded['activePlanId'],plan_id)
                self.assertNotIn('accessToken',reloaded)
                self.assertGreaterEqual(len(reloaded['audit']),6)
        finally:
            http.shutdown();http.server_close();thread.join()
            with store.connect() as db:
                for cookie in jar:
                    if cookie.name=='luklaan_workspace':
                        for table in ['audit','acknowledgements','summaries','observations','workspaces']:
                            db.execute(f'DELETE FROM {table} WHERE '+('id' if table=='workspaces' else 'workspace')+'=%s',(cookie.value,))
            store.pool.close()
