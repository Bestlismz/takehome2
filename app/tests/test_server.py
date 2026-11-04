from datetime import datetime, timezone, timedelta
import importlib.util
import json
from pathlib import Path
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("luklaan_server", Path(__file__).resolve().parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class DomainBoundaries(unittest.TestCase):
    def test_summary_excludes_demo_and_raw_media(self):
        data = [{"id": "demo", "isDemo": True, "payload": {"value": 7}}, {"id": "real", "kind": "meal", "isDemo": False, "confirmed": True, "occurredAt":datetime.now(timezone.utc).isoformat(), "payload": {"description": "ข้าวต้ม", "image": "private pixels"}}]
        records = server.clean_records(data)
        self.assertEqual([r["id"] for r in records], ["real"])
        self.assertNotIn("image", records[0]["payload"])

    def test_summary_requires_explicit_confirmation_and_recent_timestamp(self):
        base={"id":"entry", "kind":"symptom", "isDemo":False,"occurredAt":datetime.now(timezone.utc).isoformat(),"payload":{"text":"เวียนหัว"}}
        self.assertEqual(server.clean_records([base]),[])
        self.assertEqual(server.clean_records([{**base,"confirmed":True,"occurredAt":(datetime.now(timezone.utc)-timedelta(days=8)).isoformat()}]),[])
        self.assertEqual(server.clean_records([{**base,"confirmed":True,"payload":{"confirmed":False}}]),[])
        self.assertEqual(len(server.clean_records([{**base,"confirmed":True}])),1)

    def test_summary_without_real_records_never_calls_provider(self):
        with patch.object(server, "request_openai") as upstream:
            with self.assertRaises(server.RequestError):
                server.handle_api("/api/physician-summary", {"events": [{"id": "demo", "isDemo": True, "payload": {}}]})
            upstream.assert_not_called()

    def test_non_image_and_oversized_camera_data_rejected(self):
        for value in ["https://example.org/private.jpg", "data:image/jpeg;base64,aaaa", "x" * 1_600_001]:
            with self.assertRaises(server.RequestError):
                server.safe_image(value)

    def test_phone_mode_does_not_generate_unsolicited_responses(self):
        self.assertFalse(server.session_config("phone")["audio"]["input"]["turn_detection"]["create_response"])
        self.assertTrue(server.session_config("app")["audio"]["input"]["turn_detection"]["create_response"])


class HttpBoundaries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = server.make_server(0)
        cls.port = cls.http.server_port
        cls.origin = f"http://127.0.0.1:{cls.port}"
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()

    def test_cross_origin_session_request_rejected(self):
        req = urllib.request.Request(self.origin + "/api/realtime/session", data=b"{}", headers={"Content-Type": "application/json", "Origin": "https://unrelated.example"})
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(req)
        self.assertEqual(error.exception.code, 403)

    def test_static_server_does_not_publish_backend_or_env(self):
        for path in ["/.env.local", "/server.py", "/tests/test_server.py"]:
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(self.origin + path)
            self.assertEqual(error.exception.code, 404)

    def test_health_only_reports_configuration_presence(self):
        with patch.dict("os.environ", {"OPENAI_API_KEY": "secret-test-marker"}):
            with urllib.request.urlopen(self.origin + "/api/health") as response:
                raw = response.read().decode()
            self.assertTrue(json.loads(raw)["configured"])
            self.assertNotIn("secret-test-marker", raw)


if __name__ == "__main__":
    unittest.main()
