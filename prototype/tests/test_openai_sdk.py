from pathlib import Path
import sys,json,unittest
from unittest.mock import patch
import httpx
from openai import OpenAI
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

class OpenAISDKContract(unittest.TestCase):
    def test_official_sdk_serializes_responses_and_realtime_requests(self):
        calls=[]
        def transport(request):
            calls.append((request.url.path,json.loads(request.content)))
            if request.url.path.endswith('client_secrets'):
                return httpx.Response(200,json={'value':'ephemeral-test-token','expires_at':1234,'session':{'type':'realtime'}})
            return httpx.Response(200,json={'id':'resp_test','object':'response','status':'completed','output':[]})
        client=OpenAI(api_key='test-only',http_client=httpx.Client(transport=httpx.MockTransport(transport)),max_retries=0)
        with patch.object(server,'openai_client',return_value=client),patch.dict('os.environ',{'OPENAI_API_KEY':'test-only'}):
            self.assertEqual(server.request_openai('/responses',{'model':'gpt-4.1-mini','input':'synthetic'})['status'],'completed')
            self.assertEqual(server.request_openai('/realtime/client_secrets',{'session':server.session_config()})['value'],'ephemeral-test-token')
        self.assertEqual([p for p,_ in calls],['/v1/responses','/v1/realtime/client_secrets'])
        self.assertEqual(calls[1][1]['session']['output_modalities'],['audio'])
        client.close()
    def test_sdk_error_body_cannot_expose_key_or_provider_details(self):
        client=OpenAI(api_key='test-only',http_client=httpx.Client(transport=httpx.MockTransport(lambda req:httpx.Response(401,json={'error':{'message':'private-marker','type':'authentication_error'}}))),max_retries=0)
        with patch.object(server,'openai_client',return_value=client),patch.dict('os.environ',{'OPENAI_API_KEY':'test-only'}):
            with self.assertRaises(server.RequestError) as error:server.request_openai('/responses',{'model':'test','input':'synthetic'})
        self.assertNotIn('private-marker',error.exception.message);self.assertEqual(error.exception.status,503)
        client.close()
