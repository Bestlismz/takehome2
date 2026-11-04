"""Versioned medication review, caregiver handover, and revocable summary access."""
import copy
import hashlib
import hmac
import os
from pathlib import Path
import secrets
import threading
import uuid

from psycopg.types.json import Jsonb
from health_store import StoreError, stamp


def text(value, name, maximum=500, required=True):
    if not isinstance(value, str) or len(value.strip()) > maximum or (required and not value.strip()):
        raise StoreError(400, f"ตรวจข้อมูล {name} อีกครั้งค่ะ")
    return value.strip()


def draft_plan(body, version):
    medications = body.get("medications")
    uncertainties = body.get("uncertainties", [])
    if not isinstance(medications, list) or not 1 <= len(medications) <= 40:
        raise StoreError(400, "ต้องมีรายการยาที่ตรวจสอบได้ 1–40 รายการค่ะ")
    if not isinstance(uncertainties, list) or len(uncertainties) > 40:
        raise StoreError(400, "รายการข้อมูลไม่ชัดเจนไม่ถูกต้องค่ะ")
    parsed = []
    for item in medications:
        if not isinstance(item, dict) or not isinstance(item.get("uncertain"), bool):
            raise StoreError(400, "ระบุความไม่แน่นอนของรายการยาด้วยค่ะ")
        parsed.append({"name": text(item.get("name"), "ชื่อยา", 200, False),
                       "dose": text(item.get("dose"), "ขนาดยา", 200, False),
                       "instructions": text(item.get("instructions"), "วิธีใช้", 500, False),
                       "uncertain": item["uncertain"]})
    return {"id": str(uuid.uuid4()), "version": version,
            "title": text(body.get("title"), "ชื่อเอกสาร", 160),
            "sourceText": text(body.get("sourceText", ""), "ข้อความต้นทาง", 10000, False),
            "medications": parsed, "uncertainties": [text(value, "ข้อมูลไม่ชัดเจน", 500) for value in uncertainties],
            "status": "draft", "createdAt": stamp()}


class CareWorkflow:
    MUTATIONS = {"plan.draft", "plan.submit", "plan.review", "handover.add", "handover.complete",
                 "report.review", "access.create", "access.revoke"}

    def __init__(self, store):
        self.store = store
        self.initialized = False
        self.lock = threading.Lock()

    def initialize(self):
        with self.lock:
            if self.initialized:
                return
            with self.store.connect() as db:
                # Serialize first-time DDL across server workers sharing a database.
                db.execute("SELECT pg_advisory_xact_lock(19877321)")
                db.execute((Path(__file__).parent / "migrations" / "002_care_workflow.sql").read_text())
            self.initialized = True

    def _authorize_reviewer(self, body):
        configured = os.environ.get("LUKLAAN_CLINICIAN_REVIEW_TOKEN", "")
        supplied = body.get("reviewerToken")
        if not configured or not isinstance(supplied, str) or not hmac.compare_digest(configured.encode(), supplied.encode()):
            raise StoreError(403, "ต้องใช้รหัสผู้ทบทวนที่ตั้งค่าบนเซิร์ฟเวอร์ก่อนค่ะ")
        return text(body.get("reviewer"), "ชื่อผู้ทบทวน", 100)

    @staticmethod
    def _item(items, identity):
        for item in items:
            if item["id"] == identity:
                return item
        raise StoreError(404, "ไม่พบรายการนี้ในพื้นที่ครอบครัวค่ะ")

    def _load(self, db, workspace):
        row = db.execute("SELECT * FROM care_workflows WHERE workspace=%s", (workspace,)).fetchone()
        doc = copy.deepcopy(row["body"])
        doc["revision"] = row["revision"]
        doc["reviewerConfigured"] = bool(os.environ.get("LUKLAAN_CLINICIAN_REVIEW_TOKEN", ""))
        doc["audit"] = [{"id": item["id"], "revision": item["revision"], "operation": item["operation"],
                         "targetId": item["target_id"], "createdAt": item["created_at"].isoformat()}
                        for item in db.execute("SELECT * FROM care_workflow_audit WHERE workspace=%s ORDER BY id DESC LIMIT 100", (workspace,))]
        doc["grants"] = [{"id": str(item["id"]), "label": item["label"], "scope": item["scope"],
                          "createdAt": item["created_at"].isoformat(), "revokedAt": item["revoked_at"].isoformat() if item["revoked_at"] else None}
                         for item in db.execute("SELECT * FROM care_access_grants WHERE workspace=%s ORDER BY created_at DESC", (workspace,))]
        doc["summaryOptions"] = [{"id": item["id"], "kind": item["kind"], "createdAt": item["created_at"].isoformat()}
                                 for item in db.execute("SELECT id,kind,created_at FROM summaries WHERE workspace=%s ORDER BY created_at DESC LIMIT 20", (workspace,))]
        counts = {item["kind"]: item["n"] for item in db.execute("SELECT kind,count(*) AS n FROM observations WHERE workspace=%s GROUP BY kind", (workspace,))}
        doc["metrics"] = {"confirmedCount": sum(counts.values()), "byKind": counts,
                          "missing": [kind for kind in ("bloodPressure", "glucose", "adherence") if not counts.get(kind)]}
        return doc

    def _shared_read(self, body):
        token = body.get("token")
        if not isinstance(token, str) or not 32 <= len(token) <= 128:
            raise StoreError(403, "ลิงก์นี้ใช้ไม่ได้หรือถูกยกเลิกสิทธิ์แล้วค่ะ")
        digest = hashlib.sha256(token.encode()).hexdigest()
        with self.store.connect() as db:
            grant = db.execute("SELECT * FROM care_access_grants WHERE token_hash=%s AND revoked_at IS NULL", (digest,)).fetchone()
            if not grant:
                raise StoreError(403, "ลิงก์นี้ใช้ไม่ได้หรือถูกยกเลิกสิทธิ์แล้วค่ะ")
            doc = self._load(db, grant["workspace"])
            plan = next((item for item in doc["plans"] if item["id"] == doc.get("activePlanId")), None)
            return {"scope": grant["scope"], "activePlan": {key: plan[key] for key in ("title", "version", "medications")} if plan else None,
                    "summary": {"confirmedCount": doc["metrics"]["confirmedCount"], "missing": doc["metrics"]["missing"]},
                    "sharedAt": grant["created_at"].isoformat()}

    def handle(self, workspace, body):
        if not isinstance(body, dict):
            raise StoreError(400, "รูปแบบคำขอไม่ถูกต้องค่ะ")
        operation = body.get("operation", "load")
        if not isinstance(operation, str) or operation not in self.MUTATIONS | {"load", "status", "access.read"}:
            raise StoreError(400, "ไม่พบการทำงานนี้ค่ะ")
        self.initialize()
        if operation == "access.read":
            return self._shared_read(body)
        try:
            workspace = str(uuid.UUID(str(workspace)))
        except (ValueError, TypeError):
            raise StoreError(401, "เปิดพื้นที่ครอบครัวก่อนค่ะ") from None
        expected = body.get("expectedRevision")
        if operation in self.MUTATIONS and (isinstance(expected, bool) or not isinstance(expected, int) or expected < 0):
            raise StoreError(400, "เปิดเวอร์ชันข้อมูลล่าสุดก่อนแก้ไขค่ะ")
        token = None
        grant_id = None
        with self.store.connect() as db:
            db.execute("INSERT INTO workspaces(id) VALUES(%s) ON CONFLICT DO NOTHING", (workspace,))
            empty = {"plans": [], "handovers": [], "reviews": [], "activePlanId": None}
            db.execute("INSERT INTO care_workflows(workspace,body) VALUES(%s,%s) ON CONFLICT DO NOTHING", (workspace, Jsonb(empty)))
            row = db.execute("SELECT * FROM care_workflows WHERE workspace=%s FOR UPDATE", (workspace,)).fetchone()
            if operation in {"load", "status"}:
                return self._load(db, workspace)
            if row["revision"] != expected:
                raise StoreError(409, "ข้อมูลเปลี่ยนจากอีกหน้าต่างแล้ว เปิดฉบับล่าสุดก่อนค่ะ")
            doc = copy.deepcopy(row["body"])
            target = None
            if operation == "plan.draft":
                if len(doc["plans"]) >= 200:
                    raise StoreError(400, "พื้นที่นี้มีแผนยาครบจำนวนที่รองรับแล้วค่ะ")
                plan = draft_plan(body, max((p["version"] for p in doc["plans"]), default=0) + 1)
                doc["plans"].append(plan)
                target = plan["id"]
            elif operation == "plan.submit":
                plan = self._item(doc["plans"], body.get("id"))
                if plan["status"] != "draft" or body.get("caregiverReviewed") is not True:
                    raise StoreError(409, "ตรวจร่างแผนก่อนส่งทบทวนค่ะ")
                plan.update(status="pending_review", caregiverReviewedAt=stamp())
                target = plan["id"]
            elif operation == "plan.review":
                reviewer = self._authorize_reviewer(body)
                plan = self._item(doc["plans"], body.get("id"))
                decision = body.get("decision")
                if plan["status"] != "pending_review" or not isinstance(decision, str) or decision not in {"approved", "rejected"}:
                    raise StoreError(409, "แผนนี้ไม่ได้รอทบทวนหรือผลทบทวนไม่ถูกต้องค่ะ")
                if decision == "approved" and (plan["uncertainties"] or any(item["uncertain"] or not all(item[key] for key in ("name", "dose", "instructions")) for item in plan["medications"])):
                    raise StoreError(409, "ข้อมูลยาไม่ชัดเจน ต้องสร้างร่างที่แก้ไขแล้วก่อนเปิดใช้ค่ะ")
                plan.update(status=decision, reviewedAt=stamp(), reviewer=reviewer,
                            reviewNote=text(body.get("note", ""), "บันทึกทบทวน", 1000, False), authorization="configured-reviewer-token")
                if decision == "approved":
                    doc["activePlanId"] = plan["id"]
                target = plan["id"]
            elif operation == "handover.add":
                if len(doc["handovers"]) >= 500:
                    raise StoreError(400, "รายการส่งต่องานครบจำนวนที่รองรับแล้วค่ะ")
                handover = {"id": str(uuid.uuid4()), "text": text(body.get("text"), "สิ่งที่ส่งต่อ", 2000),
                            "assignee": text(body.get("assignee"), "ผู้รับช่วง", 100), "status": "open", "createdAt": stamp()}
                evidence_id=body.get("evidenceId")
                if evidence_id is not None:
                    identity=text(evidence_id,"รหัสบันทึกต้นทาง",160)
                    evidence=db.execute("SELECT body FROM observations WHERE workspace=%s AND id=%s",(workspace,identity)).fetchone()
                    if not evidence:
                        raise StoreError(404,"ไม่พบบันทึกต้นทางในพื้นที่ครอบครัวค่ะ")
                    handover["evidenceId"]=identity
                    handover["evidence"]=evidence["body"]
                doc["handovers"].append(handover)
                target = handover["id"]
            elif operation == "handover.complete":
                item = self._item(doc["handovers"], body.get("id"))
                if item["status"] != "open":
                    raise StoreError(409, "รายการนี้รับช่วงแล้วค่ะ")
                item.update(status="completed", completedAt=stamp())
                target = item["id"]
            elif operation == "report.review":
                reviewer = self._authorize_reviewer(body)
                identity = text(body.get("id"), "รหัสรายงาน", 160)
                if not db.execute("SELECT id FROM summaries WHERE id=%s AND workspace=%s", (identity, workspace)).fetchone():
                    raise StoreError(404, "ไม่พบรายงานฉบับนี้ในพื้นที่ครอบครัวค่ะ")
                if not isinstance(body.get("decision"), str) or body["decision"] not in {"reviewed", "needs_revision"}:
                    raise StoreError(400, "ระบุผลทบทวนรายงานค่ะ")
                item = {"id": str(uuid.uuid4()), "summaryId": identity, "decision": body["decision"], "reviewer": reviewer,
                        "note": text(body.get("note", ""), "บันทึกทบทวน", 1000, False), "createdAt": stamp(), "authorization": "configured-reviewer-token"}
                if len(doc["reviews"]) >= 1000:
                    raise StoreError(400, "ประวัติทบทวนรายงานครบจำนวนที่รองรับแล้วค่ะ")
                doc["reviews"].append(item)
                target = identity
            elif operation == "access.create":
                if body.get("scope") != "family_summary":
                    raise StoreError(400, "รองรับเฉพาะสิทธิ์อ่านสรุปครอบครัวค่ะ")
                if db.execute("SELECT count(*) AS n FROM care_access_grants WHERE workspace=%s AND revoked_at IS NULL", (workspace,)).fetchone()["n"] >= 20:
                    raise StoreError(400, "มีลิงก์ที่ยังเปิดใช้อยู่ครบจำนวนแล้วค่ะ")
                token, grant_id = secrets.token_urlsafe(32), str(uuid.uuid4())
                db.execute("INSERT INTO care_access_grants(id,workspace,token_hash,scope,label) VALUES(%s,%s,%s,%s,%s)",
                           (grant_id, workspace, hashlib.sha256(token.encode()).hexdigest(), "family_summary", text(body.get("label"), "ชื่อลิงก์", 100)))
                target = grant_id
            elif operation == "access.revoke":
                try:
                    identity = str(uuid.UUID(str(body.get("id"))))
                except ValueError:
                    raise StoreError(404, "ไม่พบลิงก์นี้ค่ะ") from None
                result = db.execute("UPDATE care_access_grants SET revoked_at=now() WHERE id=%s AND workspace=%s AND revoked_at IS NULL RETURNING id", (identity, workspace)).fetchone()
                if not result:
                    raise StoreError(404, "ไม่พบลิงก์ที่เปิดใช้นี้ค่ะ")
                target = identity
            revision = expected + 1
            db.execute("UPDATE care_workflows SET revision=%s,body=%s,updated_at=now() WHERE workspace=%s", (revision, Jsonb(doc), workspace))
            db.execute("INSERT INTO care_workflow_audit(workspace,revision,operation,target_id) VALUES(%s,%s,%s,%s)", (workspace, revision, operation, target))
            result = self._load(db, workspace)
            if token:
                result.update(accessToken=token, grantId=grant_id)
            return result
