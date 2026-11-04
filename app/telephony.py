"""One allowlisted outbound greeting test. No scheduling or PSTN AI conversation."""
import base64
import json
import os
from pathlib import Path
import re
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid


class TelephonyError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.status_code = status
        self.message = message


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, new_url):
        return None


class TelephonyAdapter:
    KEYS = ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "LUKLAAN_TEST_PHONE", "LUKLAAN_ENABLE_TEST_CALLS")
    CALL_STATUSES = {"queued", "initiated", "ringing", "in-progress", "completed", "busy", "failed", "no-answer", "canceled"}
    TWIML = ('<Response><Say voice="Google.th-TH-Chirp3-HD-Aoede" language="th-TH">'
             'สวัสดีค่ะ นี่คือสายทดสอบจากลูกหลาน ผู้ช่วยเอไอค่ะ '
             'สายนี้ใช้ตรวจสอบการเชื่อมต่อโทรศัพท์เท่านั้น ขอบคุณค่ะ'
             '</Say><Hangup/></Response>')

    def __init__(self, state_path=None, opener=None, environ=None):
        self.state_path = Path(state_path) if state_path is not None else Path(__file__).resolve().parent / ".runtime" / "telephony-test.json"
        self.opener = opener or urllib.request.build_opener(_NoRedirect()).open
        self.environ = os.environ if environ is None else environ

    def _configuration(self):
        values = {key: self.environ.get(key, "").strip() for key in self.KEYS}
        invalid = [key for key, value in values.items() if not value]
        patterns = {"TWILIO_ACCOUNT_SID": r"AC[0-9a-fA-F]{32}", "TWILIO_AUTH_TOKEN": r"[0-9a-fA-F]{32}",
                    "TWILIO_FROM_NUMBER": r"\+[1-9]\d{7,14}", "LUKLAAN_TEST_PHONE": r"\+[1-9]\d{7,14}",
                    "LUKLAAN_ENABLE_TEST_CALLS": r"1"}
        invalid.extend(key for key, value in values.items() if value and not re.fullmatch(patterns[key], value))
        return values, invalid

    def _read_attempt(self):
        try:
            value = json.loads(self.state_path.read_text())
            return value if isinstance(value, dict) else {"phase": "unknown"}
        except FileNotFoundError:
            return None
        except (OSError, ValueError):
            return {"phase": "unknown"}

    def status(self):
        _, missing = self._configuration()
        used = self._read_attempt() is not None
        return {"provider": "twilio", "mode": "test-greeting-only", "configured": not missing,
                "missing": missing, "testUsed": used, "testReady": not missing and not used,
                "realtimeConversation": False, "scheduledCalls": False}

    def _write_result(self, attempt):
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.state_path.parent, delete=False) as file:
                temporary = file.name
                json.dump(attempt, file)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, self.state_path)
        finally:
            if temporary and os.path.exists(temporary):
                os.unlink(temporary)

    def _replay(self, request_id):
        attempt = self._read_attempt() or {}
        if attempt.get("requestId") == request_id and attempt.get("phase") == "accepted":
            return {**attempt["result"], "replayed": True}
        raise TelephonyError(409, "ใช้สิทธิ์ทดสอบโทรครั้งนี้แล้ว หรือยังไม่ทราบผลจากผู้ให้บริการ กรุณาตรวจสอบก่อนลองใหม่ค่ะ")

    def start_test_call(self, request_id):
        try:
            if not isinstance(request_id, str) or str(uuid.UUID(request_id)) != request_id:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise TelephonyError(400, "ขอรหัสคำขอทดสอบที่ถูกต้องค่ะ") from None
        values, missing = self._configuration()
        if missing:
            raise TelephonyError(503, "ยังไม่ได้ตั้งค่าบริการโทรทดสอบค่ะ")
        attempt = {"requestId": request_id, "phase": "pending"}
        try:
            self.state_path.parent.mkdir(parents=True, exist_ok=True)
            descriptor = os.open(self.state_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            return self._replay(request_id)
        except OSError:
            raise TelephonyError(503, "ยังเก็บสถานะการโทรทดสอบไม่ได้ จึงยังไม่โทรค่ะ") from None
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as file:
                json.dump(attempt, file)
                file.flush()
                os.fsync(file.fileno())
        except OSError:
            raise TelephonyError(503, "ยังเก็บสถานะการโทรทดสอบไม่ได้ จึงยังไม่โทรค่ะ") from None
        data = urllib.parse.urlencode({"To": values["LUKLAAN_TEST_PHONE"], "From": values["TWILIO_FROM_NUMBER"],
                                      "Twiml": self.TWIML, "Timeout": "20", "TimeLimit": "30", "Record": "false"}).encode()
        credentials = base64.b64encode(f'{values["TWILIO_ACCOUNT_SID"]}:{values["TWILIO_AUTH_TOKEN"]}'.encode()).decode()
        request = urllib.request.Request(f'https://api.twilio.com/2010-04-01/Accounts/{values["TWILIO_ACCOUNT_SID"]}/Calls.json',
                                         data=data, headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/x-www-form-urlencoded"}, method="POST")
        try:
            with self.opener(request, timeout=12) as response:
                raw = response.read(65537)
            if len(raw) > 65536:
                raise ValueError()
            result = json.loads(raw)
            if not isinstance(result, dict) or not re.fullmatch(r"CA[0-9a-fA-F]{32}", result.get("sid", "")) or result.get("status") not in self.CALL_STATUSES:
                raise ValueError()
            public = {"provider": "twilio", "callSid": result["sid"], "status": result["status"], "testOnly": True}
            self._write_result({**attempt, "phase": "accepted", "result": public})
            return public
        except (OSError, ValueError, TypeError):
            # A timeout can happen after Twilio accepted the request. Keep the budget consumed.
            raise TelephonyError(502, "ยังยืนยันผลการโทรไม่ได้ กรุณาตรวจสอบใน Twilio Console ก่อน ไม่โทรซ้ำอัตโนมัติค่ะ") from None
