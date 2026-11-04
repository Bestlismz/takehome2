# Care coordination

The implemented flow follows the medication-verification, handover, family-access and doctor-review requirements in the [shared session](https://chatgpt.com/share/6aeb02e7-8b34-83ec-8e8c-c59975e1fc29).

## Open the features

Open **คนที่เรารัก → แผนยา ส่งต่องาน และสิทธิ์**, **ยาของฉัน → เอกสารยาและแผนที่ตรวจสอบ**, or **สรุปให้แพทย์ → ทบทวนรายงานฉบับที่เก็บไว้**. Each area is also available through voice commands.

1. Select a medicine-document image or enter its text. Analysis uses the official OpenAI SDK through the server. Images are resized before transmission and are not stored in PostgreSQL.
2. Inspect and edit the extracted draft. Unknown drug names, doses or instructions stay uncertain; the AI does not fill them from general knowledge.
3. Save a new immutable plan version and mark that it was checked against the source before submitting it for review.
4. Review requires the optional server-side `LUKLAAN_CLINICIAN_REVIEW_TOKEN` and a reviewer label. Without configuration or with unresolved medication fields, approval is blocked. Rejected versions remain in history; corrections create a new version.
5. Handovers retain the assignee, note, completion state and audit history. Report reviews refer to a stored report snapshot and do not rewrite the original report.
6. Family links have a fixed summary-only scope. Only token hashes are stored. The link is displayed once locally, is not returned through voice tools, and can be revoked. Shared pages recheck access every 15 seconds and when made visible. Previously downloaded information cannot be recalled from a recipient.

## Storage and concurrency

`migrations/002_care_workflow.sql` is initialized lazily alongside the existing PostgreSQL store. Workflow revisions are independent of the health-journal revision. Mutations require the expected workflow revision; conflicts reload server state instead of overwriting it. Audit entries are stored separately from the current document. Workspace foreign keys and scoped token queries enforce separation.

## Prototype boundaries

The configured reviewer token is a server credential gate, not verification of a professional license or a production identity system. Replace local workspace cookies and shared reviewer credentials with appropriate account, role and institutional identity controls before clinical deployment. Existing medicine schedules remain explicitly labelled examples; approval does not automatically prescribe doses or alter those schedules. Shared access is read-only, not an account login. No automatic caregiver messages, staffed clinical escalation service, LINE follow-up or realtime AI PSTN conversation is implied.

## Voice examples

- "เปิดงานดูแลต่อเนื่องส่วนแผนยา"
- "อ่านช่องที่กำลังกรอกอยู่" then ask to fill the specific medicine fields. Reviewer passwords and device/file permission prompts must be entered directly.
- "ช่วยอ่านเอกสารที่เลือกไว้" then inspect the draft.
- "เก็บร่างแผนยานี้" followed by one "ยืนยันค่ะ".
- "ส่งต่องานให้พิมพ์ว่า ช่วยถามอาการหลังอาหารเย็น" followed by one confirmation.
- "อ่านสถานะงานส่งต่อ" and "รับทราบงานรายการนี้แล้ว".
- "เปิดสิทธิ์ครอบครัว" and "สร้างลิงก์อ่านสรุปให้พิมพ์". The link stays on screen.
- "เพิกถอนลิงก์ของพิมพ์" followed by one confirmation.

The AI must inspect existing IDs before changing a stored item. Repeated confirmation is unnecessary unless the proposed data changes or a safety/validation failure prevents execution.
