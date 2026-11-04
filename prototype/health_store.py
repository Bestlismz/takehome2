"""PostgreSQL household repository: bounded pool, revision checks and immutable summaries."""
import hashlib
import json
import math
import os
import threading
from contextlib import contextmanager
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool
from knowledge import seed_knowledge
from pathlib import Path
from datetime import datetime, timezone, timedelta


class StoreError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def stamp():
    return datetime.now(timezone.utc).isoformat()


def packed(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def fingerprint(value):
    return hashlib.sha256(packed(value).encode()).hexdigest()


def safe_value(value):
    if isinstance(value, dict):
        return {key: safe_value(item) for key, item in value.items() if key not in {"image", "frame", "audio", "photo", "transcript", "rawAudio"}}
    if isinstance(value, list):
        return [safe_value(item) for item in value]
    if isinstance(value, str) and (value.startswith("data:") or len(value) > 12000):
        raise StoreError(400, "ไม่เก็บภาพ เสียง หรือข้อความขนาดใหญ่ในฐานข้อมูลสุขภาพค่ะ")
    return value


def valid_state(raw):
    if not isinstance(raw, dict) or not isinstance(raw.get("events"), list) or len(raw["events"]) > 5000:
        raise StoreError(400, "รูปแบบบันทึกสุขภาพไม่ถูกต้องค่ะ")
    events, ids = [], set()
    for item in raw["events"]:
        if not isinstance(item, dict):
            raise StoreError(400, "รูปแบบรายการไม่ถูกต้องค่ะ")
        if item.get("isDemo") or item.get("source") == "demo" or item.get("confirmed") is not True:
            continue
        if item.get("kind") not in {"dose", "bloodPressure", "temperature", "symptom", "photo", "call", "meal", "glucose", "adherence"}:
            raise StoreError(400, "ชนิดข้อมูลไม่ถูกต้องค่ะ")
        identity = item.get("id")
        if not isinstance(identity, str) or not 1 <= len(identity) <= 160 or identity in ids or not isinstance(item.get("payload"), dict):
            raise StoreError(400, "รหัสหรือรายละเอียดบันทึกไม่ถูกต้องค่ะ")
        try:
            when = datetime.fromisoformat(item.get("occurredAt", "").replace("Z", "+00:00"))
            if when.tzinfo is None or when > datetime.now(timezone.utc) + timedelta(minutes=1):
                raise ValueError()
        except (ValueError, TypeError):
            raise StoreError(400, "วันเวลาบันทึกไม่ถูกต้องค่ะ") from None
        ids.add(identity)
        event = safe_value({key: value for key, value in item.items() if key in {"id", "kind", "occurredAt", "source", "confirmed", "payload", "editedAt", "updatedAt"}})
        event["isDemo"] = False
        p = event["payload"]
        fields = {"bloodPressure": [("systolic", 40, 300), ("diastolic", 20, 200)], "glucose": [("value", 20, 700)], "temperature": [("value", 30, 45)]}.get(event["kind"], [])
        for key, low, high in fields:
            v = p.get(key)
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not low <= v <= high:
                raise StoreError(400, "ค่าที่วัดอยู่นอกช่วงข้อมูลที่รองรับค่ะ")
        if event["kind"] == "bloodPressure" and p["diastolic"] >= p["systolic"]:
            raise StoreError(400, "ตรวจค่าความดันบนและล่างอีกครั้งค่ะ")
        if event["kind"] == "glucose" and (p.get("measured") is not True or p.get("unit") != "mg/dL"):
            raise StoreError(400, "ค่าน้ำตาลต้องมาจากเครื่องวัดและมีหน่วย mg/dL ค่ะ")
        events.append(event)
    result = safe_value({key: value for key, value in raw.items() if key in {"largeText", "sharing", "activities", "snooze", "profile", "callPlan", "audioProfile", "calendarPlans", "language"}})
    for key in ("profile", "sharing", "activities", "callPlan"):
        if key in result and not isinstance(result[key], dict):
            raise StoreError(400, "รูปแบบการตั้งค่าไม่ถูกต้องค่ะ")
    if result.get("audioProfile", "speaker") not in {"speaker", "headset", "noisy"}:
        raise StoreError(400, "ไม่พบรูปแบบการรับเสียงค่ะ")
    if not isinstance(result.get("language", "th"), str) or result.get("language", "th") not in {"th", "en"}:
        raise StoreError(400, "Language must be th or en")
    plans=result.get("calendarPlans",[])
    if not isinstance(plans,list) or len(plans)>300:
        raise StoreError(400,"แผนดูแลมีรูปแบบไม่ถูกต้องหรือมากเกินไปค่ะ")
    plan_ids=set()
    for plan in plans:
        try:
            if not isinstance(plan,dict) or not isinstance(plan.get("id"),str) or not 1<=len(plan["id"])<=160 or plan["id"] in plan_ids or not isinstance(plan.get("title"),str) or not 1<=len(plan["title"].strip())<=100 or plan.get("planType") not in {"appointment","activity","followup"} or plan.get("status") not in {"active","cancelled"} or len(plan.get("note",""))>500:
                raise ValueError()
            date=datetime.strptime(plan["date"],"%Y-%m-%d")
            if not 2000<=date.year<=2099 or date.strftime("%Y-%m-%d")!=plan["date"]:
                raise ValueError()
            if datetime.strptime(plan["at"],"%H:%M").strftime("%H:%M")!=plan["at"]:
                raise ValueError()
            plan_ids.add(plan["id"])
        except (ValueError,KeyError,TypeError):
            raise StoreError(400,"ตรวจชื่อนัด วันที่ และเวลาอีกครั้งค่ะ") from None
    result["events"] = events
    if len(packed(result)) > 2_000_000:
        raise StoreError(413, "ข้อมูลมีขนาดใหญ่เกินไปค่ะ")
    return result


def clinical_brief(state, now=None):
    now = now or datetime.now(timezone.utc)
    since = now.astimezone(timezone(timedelta(hours=7))).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)
    events = [e for e in state.get("events", []) if since <= datetime.fromisoformat(e["occurredAt"].replace("Z", "+00:00")) <= now]
    counts = {kind: sum(e["kind"] == kind for e in events) for kind in ("meal", "glucose", "bloodPressure", "adherence", "symptom")}
    return {"schemaVersion": 1, "title": "เรื่องสำคัญของคนที่เรารัก", "generatedAt": now.isoformat(), "periodDays": 7, "confirmedCount": len(events), "counts": counts, "evidenceIds": [e["id"] for e in events], "missing": [label for kind, label in [("bloodPressure", "ยังไม่มีค่าความดัน"), ("meal", "ยังไม่มีมื้ออาหารที่ยืนยัน"), ("symptom", "ยังไม่ได้รับคำตอบเรื่องอาการ")] if not counts[kind]], "note": "ไม่มีข้อมูลไม่แปลว่าปกติ หรือไม่ได้กินยา"}


def alert_candidates(state, now=None):
    now = now or datetime.now(timezone.utc)
    result = []
    for e in state.get("events", []):
        age = now - datetime.fromisoformat(e["occurredAt"].replace("Z", "+00:00"))
        if not timedelta(0) <= age <= timedelta(days=7):
            continue
        p, rule, title, action = e["payload"], None, None, None
        if e["kind"] == "glucose" and p.get("measured") is True and p.get("unit") == "mg/dL" and p.get("value", 100) < 70:
            rule, title = "glucose-low", f'น้ำตาลที่วัด {p["value"]} mg/dL'
            action = "ตรวจสอบอาการและทำตามแผนรับมือน้ำตาลต่ำที่แพทย์ให้ ติดต่อทีมรักษา หากหมดสติ ชัก หรือกลืนไม่ได้ ให้โทร 1669 อย่าป้อนอาหารหรือน้ำ"
        elif e["kind"] == "bloodPressure" and (p.get("systolic", 0) > 180 or p.get("diastolic", 0) > 120):
            rule, title = "bp-high", f'ความดันที่วัด {p["systolic"]}/{p["diastolic"]} mmHg'
            action = "หากเจ็บหน้าอก หายใจลำบาก อ่อนแรง หรือพูดไม่ชัด ให้โทร 1669 หากไม่มีอาการ ให้พักอย่างน้อย 1 นาที วัดซ้ำและติดต่อทีมรักษาหากยังสูง อย่าปรับยาเอง"
        elif e["kind"] == "adherence" and p.get("status") in {"missed", "partial"}:
            rule, title, action = "medication-followup", "มีคำยืนยันว่าลืมหรือกินยาไม่ครบ", "ถามรายละเอียดมื้อยาและติดตามกับเภสัชกรหรือทีมรักษา ไม่เพิ่มหรือชดเชยยาเอง"
        elif e["kind"] == "symptom" and p.get("noSymptoms") is not True and p.get("medicationRelation") == "after_medication":
            rule, title, action = "symptom-followup", "มีอาการที่เล่าหลังใช้ยา", "สอบถามเวลา อาการ และความต่อเนื่อง แล้วปรึกษาทีมรักษา ไม่สรุปว่ายาเป็นสาเหตุ"
        if rule:
            result.append({"id": fingerprint([e["id"], rule, p])[:32], "rule": rule, "severity": "attention" if rule in {"glucose-low", "bp-high"} and age <= timedelta(hours=6) else "followup", "title": title, "action": action, "evidenceId": e["id"], "occurredAt": e["occurredAt"], "historical": age > timedelta(hours=6)})
    return result


class HealthStore:
    def __init__(self, dsn=None):
        self.dsn = dsn
        self.pool = None
        self.lock = threading.Lock()

    def initialize(self):
        with self.lock:
            if self.pool is not None:
                return
            dsn = self.dsn or os.environ.get("LUKLAAN_DATABASE_URL", "dbname=luklaan_dev host=localhost")
            pool = ConnectionPool(dsn, min_size=1, max_size=6, timeout=8, max_waiting=16,
                                  kwargs={"row_factory": dict_row, "connect_timeout": 5, "application_name": "luklaan"}, open=True)
            try:
                pool.wait(timeout=8)
                with pool.connection() as db:
                    db.execute((Path(__file__).parent / "migrations" / "001_health.sql").read_text())
                    seed_knowledge(db)
            except Exception:
                pool.close()
                raise StoreError(503, "ฐานข้อมูล PostgreSQL ยังไม่พร้อม ข้อมูลในเครื่องยังไม่ถูกลบค่ะ") from None
            self.pool = pool

    @contextmanager
    def connect(self):
        self.initialize()
        with self.pool.connection() as db:
            db.execute("SET LOCAL statement_timeout = '8s'")
            yield db

    def load(self, workspace):
        with self.connect() as db:
            # One transaction snapshot keeps revision, settings and records consistent.
            db.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
            row = db.execute("SELECT * FROM workspaces WHERE id=%s", (workspace,)).fetchone()
            state = dict(row["settings"]) if row else {}
            state["events"] = [{**r["body"], "isDemo": False} for r in db.execute("SELECT body FROM observations WHERE workspace=%s ORDER BY occurred_at,id", (workspace,))]
            ack = {r["alert_id"]: r["acknowledged_at"].isoformat() for r in db.execute("SELECT * FROM acknowledgements WHERE workspace=%s", (workspace,))}
            summary = db.execute("SELECT id FROM summaries WHERE workspace=%s AND kind='daily' ORDER BY created_at DESC,id LIMIT 1", (workspace,)).fetchone()
        alerts = [{**a, "acknowledgedAt": ack.get(a["id"])} for a in alert_candidates(state)]
        return {"state": state, "revision": row["revision"] if row else 0, "alerts": alerts, "brief": clinical_brief(state), "snapshotId": summary["id"] if summary else None}

    def save(self, workspace, raw, revision):
        if isinstance(revision, bool) or not isinstance(revision, int) or revision < 0:
            raise StoreError(400, "ไม่พบเวอร์ชันข้อมูลค่ะ")
        state = valid_state(raw)
        with self.connect() as db:
            db.execute("INSERT INTO workspaces(id) VALUES(%s) ON CONFLICT DO NOTHING", (workspace,))
            row = db.execute("SELECT revision FROM workspaces WHERE id=%s FOR UPDATE", (workspace,)).fetchone()
            if row["revision"] != revision:
                raise StoreError(409, "ข้อมูลเปลี่ยนจากอีกหน้าต่างแล้ว กรุณาเปิดข้อมูลล่าสุดก่อนแก้ไขต่อค่ะ")
            settings = {key: value for key, value in state.items() if key != "events"}
            db.execute("UPDATE workspaces SET revision=%s,settings=%s,updated_at=now() WHERE id=%s", (revision+1, Jsonb(settings), workspace))
            ids = [e["id"] for e in state["events"]]
            db.execute("DELETE FROM observations WHERE workspace=%s AND NOT (id = ANY(%s::text[]))", (workspace, ids))
            for e in state["events"]:
                db.execute("INSERT INTO observations VALUES(%s,%s,%s,%s,%s) ON CONFLICT(workspace,id) DO UPDATE SET kind=excluded.kind,occurred_at=excluded.occurred_at,body=excluded.body", (workspace,e["id"],e["kind"],e["occurredAt"],Jsonb(e)))
            evidence = {"events": state["events"], "profile": state.get("profile", {}), "day": datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=7))).date().isoformat()}
            digest = fingerprint(evidence)
            identity = fingerprint([workspace, "daily", digest])
            brief = clinical_brief(state)
            brief.update({"evidence": [e for e in state["events"] if e["id"] in brief["evidenceIds"]], "profile": state.get("profile", {})})
            db.execute("INSERT INTO summaries(id,workspace,kind,digest,body) VALUES(%s,%s,%s,%s,%s) ON CONFLICT(workspace,kind,digest) DO NOTHING", (identity, workspace, "daily", digest, Jsonb(brief)))
            db.execute("INSERT INTO audit(workspace,revision,event) VALUES(%s,%s,%s)", (workspace, revision+1, "state.saved"))
        return self.load(workspace)

    def save_report(self, workspace, report, records, profile, model):
        body = {"report": report, "evidence": records, "profile": profile, "model": model, "schemaVersion": 1, "reviewStatus": "unreviewed"}
        digest = fingerprint(body)
        identity = fingerprint([workspace, "physician", digest])
        with self.connect() as db:
            db.execute("INSERT INTO summaries(id,workspace,kind,digest,body) VALUES(%s,%s,%s,%s,%s) ON CONFLICT(workspace,kind,digest) DO NOTHING", (identity, workspace, "physician", digest, Jsonb(body)))
        return identity

    def summaries(self, workspace):
        with self.connect() as db:
            return [{"id": r["id"], "kind": r["kind"], "createdAt": r["created_at"].isoformat(), "body": r["body"]} for r in db.execute("SELECT * FROM summaries WHERE workspace=%s ORDER BY created_at DESC,id LIMIT 20", (workspace,))]

    def acknowledge(self, workspace, identity):
        if identity not in {a["id"] for a in self.load(workspace)["alerts"]}:
            raise StoreError(404, "ไม่พบรายการเตือนนี้ค่ะ")
        with self.connect() as db:
            db.execute("INSERT INTO acknowledgements(workspace,alert_id) VALUES(%s,%s) ON CONFLICT DO NOTHING", (workspace, identity))
            db.execute("INSERT INTO audit(workspace,event) VALUES(%s,%s)", (workspace, "alert.acknowledged"))
        return self.load(workspace)
