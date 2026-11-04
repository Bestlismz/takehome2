from pathlib import Path
import sys
import unittest
import uuid
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
from health_store import valid_state, StoreError, HealthStore

class LanguageConfiguration(unittest.TestCase):
    def test_english_session_uses_english_delivery_and_transcription(self):
        config=server.session_config(language='en')
        self.assertEqual(config['audio']['input']['transcription']['language'],'en')
        self.assertIn('All spoken replies and newly generated explanatory text must be in English',config['instructions'])
        self.assertNotIn('You are an adult Thai woman speaking Thai',config['instructions'])
        self.assertEqual(server.session_config()['audio']['input']['transcription']['language'],'th')
    def test_language_endpoint_updates_without_creating_provider_credentials(self):
        with patch.object(server,'request_openai',side_effect=AssertionError('No new connection required')):
            result=server.handle_api('/api/voice-language',{'language':'en','audioProfile':'noisy'})
        self.assertEqual(result['language'],'en')
        self.assertEqual(result['audioInput']['transcription']['language'],'en')
        self.assertIn("Hello, I'm your Luklaan AI assistant",result['greetingInstructions'])
        self.assertEqual(result['audioInput']['turn_detection']['type'],'server_vad')
    def test_invalid_language_rejected_and_language_setting_preserved(self):
        self.assertEqual(valid_state({'events':[],'language':'en'})['language'],'en')
        for value in ['fr',None,[],{}]:
            with self.assertRaises(StoreError):valid_state({'events':[],'language':value})
            with self.assertRaises(server.RequestError):server.handle_api('/api/voice-language',{'language':value})
    def test_audio_profile_change_keeps_selected_transcription_language(self):
        result=server.handle_api('/api/audio-profile',{'profile':'headset','language':'en'})
        self.assertEqual(result['audioInput']['transcription']['language'],'en')
    def test_language_choice_persists_in_postgresql(self):
        store=HealthStore('dbname=luklaan_test host=localhost');store.initialize()
        workspace=str(uuid.uuid4())
        try:
            saved=store.save(workspace,{'events':[],'language':'en'},0)
            self.assertEqual(store.load(workspace)['state']['language'],'en')
            store.save(workspace,{'events':[],'language':'th'},saved['revision'])
            self.assertEqual(store.load(workspace)['state']['language'],'th')
        finally:
            with store.connect() as db:
                for table in ['audit','acknowledgements','summaries','observations','workspaces']:
                    db.execute(f'DELETE FROM {table} WHERE '+('id' if table=='workspaces' else 'workspace')+'=%s',(workspace,))
            store.pool.close()
