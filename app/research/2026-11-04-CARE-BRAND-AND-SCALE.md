# ลูกหลาน — ช่วยดูแลคนที่เรารัก

Research date: 4 November 2026. User clarification: family members care for their loved ones. The buyer/organizer is the family; the daily conversational user is the older adult. This is a positioning hypothesis to validate, not a claim of product-market fit.

## Product and brand decisions

ElliQ demonstrates proactive conversation, wellness check-ins and companionship for older adults: https://elliq.com/pages/faqs . Apple Health demonstrates explicit, granular sharing of health data and notifications: https://support.apple.com/en-ie/guide/iphone/iph5ede58c3d/27/ios/27 . Adopt one simple spoken check-in for the older adult and an actionable overview for family. Do not imply the AI is a real relative or that a family member has received a message when no delivery exists.

Brand promise: ลูกหลาน ช่วยดูแลคนที่เรารัก. Emotional benefit: even when family cannot be there, the little things do not have to be forgotten. Functional proof: confirmed observations, readable summaries with evidence, and alerts with an explicit acknowledgement state. No reassurance score from missing records. Avoid infantilizing older adults or dressing an unqualified companion as a physician.

Initial segment hypothesis: adult children supporting a parent living independently with diabetes/hypertension. Acquisition experiment: introduce via family caregiver communities and clinic discharge/appointment workflows; compare activation (first consented check-in), retention (weekly confirmed check-ins) and useful caregiver follow-up, not conversation duration alone. Interview 5–8 family/older-adult pairs and 3 clinicians before asserting demand. Test price and willingness to pay; no invented market sizing.

## UX

W3C identifies vision, dexterity and cognitive needs of older users: https://www.w3.org/WAI/older-users/ . Keep touch controls large, text legible, the same conversation mounted across navigation, user/AI speech interruptible, and loading/error/confirmation distinguishable. Thought-cloud animation conveys processing only; it must not pretend to display private reasoning. No transcript wall: conversation replies stay audio. Motion is finite or audio-driven with reduced-motion support.

SBAR is a communication framework (Situation, Background, Assessment, Recommendation/Request): https://www.ahrq.gov/teamstepps-program/curriculum/communication/tools/sbar.html . Adapt a front-page brief to situation, observed facts, missing context and questions for clinician review. This app cannot perform an independent clinical assessment. Preserve time, unit, provenance, confirmation and evidence IDs. FHIR Composition informs structured narrative plus referenced evidence: https://www.hl7.org/fhir/composition.html . This is not a conformant FHIR export or a physician-attested report.

## Alerts

Use deterministic rules, not unconstrained model triage. NIDDK describes glucose below 70 mg/dL as low for many people with diabetes: https://www.niddk.nih.gov/health-information/diabetes/overview/preventing-problems/low-blood-glucose-hypoglycemia . AHA advises action for readings above 180 systolic and/or 120 diastolic, with emergency services for relevant acute symptoms: https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/when-to-call-911-for-high-blood-pressure . Display values and source record, distinguish old events from current urgency, do not claim diagnosis, and never silently resolve risk when acknowledged. Do not infer medication nonadherence from absent data. No auto-call or push delivery is implemented; in-app acknowledgement is not clinical resolution.

## SDK and storage

Official SDK: https://github.com/openai/openai-python . Use OpenAI.responses.create and OpenAI.realtime.client_secrets.create. Keep the API key server-side, ephemeral secrets only in browser. WebRTC transport stays in browser; the Python SDK does not replace RTCPeerConnection: https://developers.openai.com/api/docs/guides/realtime-webrtc . Bound timeouts/concurrency and safe error text; no blanket retries on persistent writes.

The user selected PostgreSQL. Implement it directly with psycopg 3, a bounded connection pool (1–6), normalized observation rows, JSONB payloads, composite workspace/record identity and indexes on workspace/time/kind. PostgreSQL row locks serialize writes within a workspace, while revision comparisons reject stale writes: https://www.postgresql.org/docs/current/explicit-locking.html . Persist confirmed observations/settings, a deterministic brief after writes, immutable AI report snapshots and acknowledgement/audit records. Snapshots retain their source observations even after edits. The API reads persisted records for AI summaries rather than trusting a client-supplied report body.

Local runtime uses the existing local PostgreSQL service with a newly created isolated luklaan_dev database. Tests use luklaan_test. No existing database or shared server configuration is altered. The default DSN has no password; hosted credentials belong in an approved secret destination. DB tables are scoped by workspace UUID from an HttpOnly SameSite cookie. This is local workspace separation, not verified family membership or a production login.

Scale path: add household/patient membership with server authorization before remote rollout; use a non-owner runtime role and tested RLS policies (owners/superusers can bypass RLS): https://www.postgresql.org/docs/current/ddl-rowsecurity.html . Use encrypted backups/restore drills, retention/consent controls, durable delivery outbox, summary/reminder workers, per-user request limits and tracing. Replace full-state synchronization (currently bounded to 5000 observations/2MB) with paginated event queries and per-record writes before larger accounts. Pool connections behind PgBouncer if measured demand requires it, keep Realtime interaction separate from background jobs, and measure p95 latency at a stated concurrent workload before claiming capacity. In-app alerts are not SMS/push/clinical escalation.

## Mascot exploration

Three generated concepts are presented for review only. The user reiterated the family-care purpose rather than selecting a mascot. Keep current production assets until a visual is selected. Consider a distinctive familial relationship motif over medical authority: the same two companions connected by scarf/gesture, expressive listening/thinking/speaking poses, optional glasses/outfit as identity, not a clinical credential.
