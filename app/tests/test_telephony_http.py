"""Exercise the outbound-call boundary without contacting a carrier."""
from pathlib import Path
import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
import uuid
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from telephony import TelephonyError


class TelephonyHTTP(unittest.TestCase):
    def test_origin_workspace_confirmation_and_destination_are_enforced(self):
        adapter = Mock()
        adapter.status.return_value = {"configured": False, "testReady": False}
        adapter.start_test_call.return_value = {"provider": "twilio", "status": "queued", "testOnly": True}
        http = server.make_server(0)
        origin = f"http://127.0.0.1:{http.server_port}"
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        def post(path, body, *, cookie=True, request_origin=origin):
            headers = {"Content-Type": "application/json", "Origin": request_origin}
            if cookie:
                headers["Cookie"] = f"luklaan_workspace={uuid.uuid4()}"
            req = urllib.request.Request(origin + path, data=json.dumps(body).encode(), headers=headers)
            try:
                with urllib.request.urlopen(req) as response:
                    return response.status, json.load(response)
            except urllib.error.HTTPError as error:
                return error.code, json.load(error)
        try:
            with patch.object(server, "TELEPHONY", adapter):
                self.assertEqual(post('/api/telephony/status', {}, cookie=False)[0], 401)
                self.assertEqual(post('/api/telephony/status', {})[1]['configured'], False)
                request_id = str(uuid.uuid4())
                body = {"requestId": request_id, "confirmed": True}
                self.assertEqual(post('/api/telephony/test', body, request_origin='https://other.invalid')[0], 403)
                self.assertEqual(post('/api/telephony/test', {"requestId": request_id})[0], 400)
                self.assertEqual(post('/api/telephony/test', {**body, "to": "+12025550100"})[0], 400)
                adapter.start_test_call.assert_not_called()
                self.assertEqual(post('/api/telephony/test', body)[1]['status'], 'queued')
                adapter.start_test_call.assert_called_once_with(request_id)
                adapter.start_test_call.side_effect = TelephonyError(503, 'Provider not configured')
                self.assertEqual(post('/api/telephony/test', body), (503, {'error': 'Provider not configured'}))
        finally:
            http.shutdown()
            http.server_close()
            thread.join()
