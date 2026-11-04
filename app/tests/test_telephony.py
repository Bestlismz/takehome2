from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
from pathlib import Path
import sys
import tempfile
import unittest
import urllib.error
import urllib.parse
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from telephony import TelephonyAdapter, TelephonyError


class Response(BytesIO):
    pass


def configured():
    return {"TWILIO_ACCOUNT_SID": "AC" + "a" * 32, "TWILIO_AUTH_TOKEN": "b" * 32,
            "TWILIO_FROM_NUMBER": "+15555550101", "LUKLAAN_TEST_PHONE": "+15555550123", "LUKLAAN_ENABLE_TEST_CALLS": "1"}


class TelephonyTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "telephony-test.json"
        self.requests = []

    def opener(self, request, timeout):
        self.requests.append((request, timeout))
        return Response(json.dumps({"sid": "CA" + "c" * 32, "status": "queued", "to": "provider-private-number"}).encode())

    def adapter(self, **overrides):
        return TelephonyAdapter(self.path, opener=overrides.pop("opener", self.opener), environ=overrides.pop("environ", configured()), **overrides)

    def test_unconfigured_status_is_safe_and_cannot_call(self):
        adapter = self.adapter(environ={})
        self.assertFalse(adapter.status()["configured"])
        self.assertFalse(adapter.status()["testReady"])
        self.assertFalse(adapter.status()["realtimeConversation"])
        with self.assertRaises(TelephonyError) as error:
            adapter.start_test_call(str(uuid.uuid4()))
        self.assertEqual(error.exception.status, 503)
        self.assertEqual(self.requests, [])
        self.assertFalse(self.path.exists())

    def test_valid_call_serializes_only_allowlisted_target_and_short_greeting(self):
        adapter = self.adapter()
        result = adapter.start_test_call(str(uuid.uuid4()))
        self.assertEqual(result, {"provider": "twilio", "callSid": "CA" + "c" * 32, "status": "queued", "testOnly": True})
        request, timeout = self.requests[0]
        self.assertEqual(timeout, 12)
        self.assertEqual(request.full_url, "https://api.twilio.com/2010-04-01/Accounts/AC" + "a" * 32 + "/Calls.json")
        form = urllib.parse.parse_qs(request.data.decode())
        self.assertEqual(form["To"], [configured()["LUKLAAN_TEST_PHONE"]])
        self.assertEqual(form["Record"], ["false"])
        self.assertEqual(form["TimeLimit"], ["30"])
        self.assertEqual(form["Timeout"], ["20"])
        self.assertIn("ผู้ช่วยเอไอ", form["Twiml"][0])
        self.assertIn("<Hangup/>", form["Twiml"][0])
        self.assertNotIn("Url", form)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        for private in [configured()["TWILIO_AUTH_TOKEN"], configured()["LUKLAAN_TEST_PHONE"], "provider-private-number"]:
            self.assertNotIn(private, json.dumps(result) + json.dumps(adapter.status()) + self.path.read_text())

    def test_same_request_replays_and_new_request_cannot_spend_another_call(self):
        key = str(uuid.uuid4())
        first = self.adapter().start_test_call(key)
        second = self.adapter().start_test_call(key)
        self.assertEqual(second, {**first, "replayed": True})
        with self.assertRaises(TelephonyError) as error:
            self.adapter().start_test_call(str(uuid.uuid4()))
        self.assertEqual(error.exception.status, 409)
        self.assertEqual(len(self.requests), 1)

    def test_timeout_or_provider_error_never_retries_or_exposes_private_error(self):
        for provider_error in [TimeoutError("private token"), urllib.error.HTTPError("https://private", 401, "private token", {}, None)]:
            with self.subTest(error=type(provider_error).__name__):
                self.path.unlink(missing_ok=True)
                calls = []
                def failing(request, timeout):
                    calls.append(request)
                    raise provider_error
                adapter = self.adapter(opener=failing)
                key = str(uuid.uuid4())
                with self.assertRaises(TelephonyError) as error:
                    adapter.start_test_call(key)
                self.assertEqual(error.exception.status, 502)
                self.assertNotIn("private", str(error.exception))
                with self.assertRaises(TelephonyError):
                    adapter.start_test_call(key)
                self.assertEqual(len(calls), 1)
                self.assertTrue(adapter.status()["testUsed"])
                self.assertFalse(adapter.status()["testReady"])

    def test_invalid_configuration_and_request_never_reaches_provider(self):
        for name, value in [("TWILIO_ACCOUNT_SID", "bad/path"), ("TWILIO_AUTH_TOKEN", "bad\nheader"), ("TWILIO_FROM_NUMBER", "555"), ("LUKLAAN_TEST_PHONE", "0800000000"), ("LUKLAAN_ENABLE_TEST_CALLS", "0")]:
            env = configured()
            env[name] = value
            adapter = self.adapter(environ=env)
            self.assertFalse(adapter.status()["configured"])
            with self.assertRaises(TelephonyError):
                adapter.start_test_call(str(uuid.uuid4()))
        for key in [None, "", "not-uuid", 1]:
            with self.assertRaises(TelephonyError):
                self.adapter().start_test_call(key)
        self.assertEqual(self.requests, [])

    def test_concurrent_requests_reserve_one_attempt_across_adapter_instances(self):
        def call(_):
            try:
                return self.adapter().start_test_call(str(uuid.uuid4()))
            except TelephonyError:
                return None
        with ThreadPoolExecutor(max_workers=5) as pool:
            results = list(pool.map(call, range(5)))
        self.assertEqual(sum(result is not None for result in results), 1)
        self.assertEqual(len(self.requests), 1)

    def test_corrupt_or_pending_journal_fails_closed(self):
        for value in ["not-json", "[]", '{"phase":"pending"}']:
            self.path.write_text(value)
            adapter = self.adapter()
            self.assertTrue(adapter.status()["testUsed"])
            with self.assertRaises(TelephonyError):
                adapter.start_test_call(str(uuid.uuid4()))
        self.assertEqual(self.requests, [])

    def test_bad_provider_response_consumes_budget_without_returning_untrusted_fields(self):
        for payload in [{"sid": "not-a-sid", "status": "queued"}, [], {"sid": "CA" + "c" * 32, "status": "<script>"}]:
            self.path.unlink(missing_ok=True)
            adapter = self.adapter(opener=lambda request, timeout: Response(json.dumps(payload).encode()))
            with self.assertRaises(TelephonyError):
                adapter.start_test_call(str(uuid.uuid4()))
            self.assertTrue(adapter.status()["testUsed"])
