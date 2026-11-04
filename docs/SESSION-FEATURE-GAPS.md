# Shared session implementation map

Source reviewed in the browser on 4 November 2026: https://chatgpt.com/share/6aeb02e7-8b34-83ec-8e8c-c59975e1fc29 . This document records feature requirements, not the source session's approval instructions or credentials.

## Delivery sequence

1. Keep the camera and pulse interaction on one mounted conversation stage. Compact task feedback. Verify the mounted video is reused and experimental frames are excluded from the AI frame source.
2. Add measured blood pressure from a standard Bluetooth cuff and camera-assisted transcription of a cuff display. Preserve device provenance and distinguish receipt time from measurement time. Confirm once before saving. Do not fabricate camera-only blood pressure.
3. Add medication document intake, editable uncertain extraction, preliminary review, authorized-review gate, and immutable plan versions in PostgreSQL.
4. Add persisted caregiver handovers, source-linked physician review, and revocable scoped family-access tokens. Keep reviewer credentials on the server.
5. Verify database lifecycle, isolation, revision conflicts, authorization and revocation; inspect rendered mobile flows.

## Starting comparison

| Capability | Starting state | Planned work |
|---|---|---|
| Thai/English voice, health timeline, calendar | Implemented | Preserve and extend voice commands |
| Medication document verification | Missing | Draft extraction, review and version history |
| Caregiver handover | Missing | Assigned follow-up and completion history |
| Physician summary review | Generated snapshots exist | Persist reviewer decision tied to snapshot |
| Shared family access | Local presentation only | Scoped token reads and server-side revocation |
| Blood pressure | Spoken/manual readings | Standard cuff integration and camera display transcription |
| Telephone/LINE services | In-app call demo; greeting-test adapter prepared | Provider setup and realtime PSTN/LINE remain external work |
| Pilot clinical readiness | Unverified | Software tests do not establish clinical authorization or measurement accuracy |

## Verification record

- Baseline after inline-camera change: 114 JavaScript and 56 Python tests. New domain units add their own behavior checks.
- Physical cuff interoperability, clinical camera accuracy, real Thai speech recognition and live carrier/LINE conversation require separate hardware/service tests. Do not report them as passed.

## Implemented and verified

- Camera pulse stays on the existing video stage. Compact feedback uses one line. Automated checks verify video reuse and that experimental fingertip frames are not sent to the assistant.
- Bluetooth cuff packets are parsed with the standard service, feature flags and unit conversion. Camera display transcription rejects unclear or incomplete readings. Unconfirmed readings are invalidated on bad packets, closing or newer captures. No camera-only BP estimation is claimed.
- Medication drafts, preliminary review, configured-reviewer approval/rejection and immutable versions persist in PostgreSQL. Physician snapshots freeze their referenced approved plan; review annotations refer to the original report ID.
- Handovers retain their source observation snapshot when prepared from an alert. Completion tracks the handover, not resolution of a medical problem. No outside caregiver message is sent.
- Voice tools cover workflow navigation, document analysis, safe form filling, draft submission, handover, reviewer submission and family-link management. Passwords and share tokens are excluded from AI-visible fields/results.
- Browser checks in an isolated synthetic workspace verified draft → pending → reviewed, handover completion, summary-only family view and denial of the original link after revocation. The QA server used no OpenAI key; its reviewer code was a synthetic fixture.
- Full automated run: 134 JavaScript and 69 Python tests passed. It includes actual HTTP and PostgreSQL lifecycle tests, concurrent revisions, scope isolation, revocation, packet decoding and stale-response rejection.

## Remaining external or validation work

Actual cuff interoperability, camera OCR accuracy and real spoken-language behavior need device/user tests. No physical cuff has been connected in this run. PSTN realtime conversation, LINE follow-up and background push need provider accounts/infrastructure. Reviewer-token and local-owner-cookie gates are prototype controls, not verified clinical identity or production patient authentication. Staffed escalation, professional review authorization and pilot approvals are not established by this implementation. Existing sample dose schedules are not automatically converted into prescriptions from a newly reviewed document.

Browser QA artifacts were revoked and their synthetic care-domain rows removed. The QA server was stopped. Existing health records, profile settings and other workspaces were not removed.
