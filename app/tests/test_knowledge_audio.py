from pathlib import Path
import sys,unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from health_store import HealthStore
from knowledge import lookup,remote_tools,validate_query,source_status
import server


class AudioConfiguration(unittest.TestCase):
    def test_semantic_vad_balances_conversational_turns_and_keeps_interruption(self):
        config=server.session_config()['audio']['input']
        self.assertEqual(config['noise_reduction']['type'],'far_field')
        self.assertEqual(config['turn_detection']['type'],'semantic_vad')
        self.assertEqual(config['turn_detection']['eagerness'],'medium')
        self.assertTrue(config['turn_detection']['interrupt_response'])
        self.assertFalse(server.session_config('phone','noisy')['audio']['input']['turn_detection']['create_response'])
    def test_headset_and_noisy_configs_change_without_overriding_each_other(self):
        self.assertEqual(server.audio_input_config('app','headset')['noise_reduction']['type'],'near_field')
        self.assertGreater(server.audio_input_config('app','noisy')['turn_detection']['threshold'],.5)
        self.assertEqual(server.audio_input_config('app','speaker')['turn_detection']['type'],'semantic_vad')
        with self.assertRaises(server.RequestError):server.handle_api('/api/audio-profile',{'profile':'invalid'})


class KnowledgeRetrieval(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.store=HealthStore('dbname=luklaan_test host=localhost');cls.store.initialize()
    @classmethod
    def tearDownClass(cls):cls.store.pool.close()
    def test_thai_question_retrieves_attributed_relevant_postgres_evidence(self):
        result=lookup(self.store,'น้ำตาลต่ำควรสังเกตอะไร',lambda *a:self.fail('local lookup must not call external provider'))
        self.assertTrue(result['evidence'])
        self.assertIn('niddk-low-glucose',[e['id'] for e in result['evidence']])
        self.assertTrue(all(e['url'].startswith('https://') and e['reviewedAt'] for e in result['evidence']))
        self.assertFalse(result['externalUsed'])
    def test_unknown_question_returns_no_invented_evidence(self):
        self.assertEqual(lookup(self.store,'การซ่อมเครื่องบิน',None)['evidence'],[])
    def test_missing_mcp_configuration_is_not_reported_as_connected(self):
        with patch('knowledge.config',return_value={'mcp':[],'vectorStores':[]}):
            result=lookup(self.store,'อาหารและไขมัน',lambda *a:self.fail('no configured tool'),external=True)
            self.assertEqual(result['externalStatus'],'not-configured');self.assertFalse(result['externalUsed'])
    def test_external_connector_never_receives_household_records(self):
        calls=[]
        def provider(path,body):
            calls.append(body)
            return {'output':[{'type':'mcp_call','status':'completed'},{'type':'message','content':[{'type':'output_text','text':'public facts','annotations':[]}]}]}
        cfg={'mcp':[{'label':'approved','url':'https://reference.example/mcp','publicKnowledgeOnly':True,'readOnlyTools':['search']}], 'vectorStores':[]}
        with patch('knowledge.config',return_value=cfg):result=lookup(self.store,'อาหารและไขมัน',provider,True)
        self.assertTrue(result['externalUsed']);self.assertEqual(calls[0]['input'],'อาหารและไขมัน')
        self.assertNotIn('events',calls[0]);self.assertFalse(calls[0]['store'])
        self.assertEqual(calls[0]['tools'][0]['allowed_tools'],{'read_only':True,'tool_names':['search']})
    def test_unverified_or_failed_mcp_result_cannot_be_spoken_as_retrieved_fact(self):
        cfg={'mcp':[{'label':'approved','url':'https://reference.example/mcp','publicKnowledgeOnly':True,'readOnlyTools':['search']}]}
        with patch('knowledge.config',return_value=cfg):
            result=lookup(self.store,'อาหารและไขมัน',lambda *_:{'output':[{'type':'mcp_call','error':'failed'},{'type':'message','content':[{'type':'output_text','text':'invented answer'}]}]},True)
        self.assertFalse(result['externalUsed']);self.assertIsNone(result['externalAnswer'])
    def test_identifier_readings_and_unapproved_endpoints_are_rejected(self):
        for query in ['ชื่อสมใจ น้ำตาลต่ำ','น้ำตาล 65','เบอร์ test@example.com']:
            with self.assertRaises(ValueError):validate_query(query)
        for url in ['http://public.example/mcp','https://127.0.0.1/mcp','https://u:p@public.example/mcp']:
            with self.assertRaises(ValueError):remote_tools({'mcp':[{'label':'x','url':url,'publicKnowledgeOnly':True,'readOnlyTools':['search']}]})

if __name__=='__main__':unittest.main()
