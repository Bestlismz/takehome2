# ลูกหลาน — ช่วยดูแลคนที่เรารัก

Family members help care for their loved ones. Older adults talk naturally; family members review confirmed observations, what needs attention and what to ask next. This is a local functional prototype, not a production clinical monitoring service.

## Run

Use Python 3.10+ and PostgreSQL 15+.

```sh
uv venv --python python3 .venv
uv pip install --python .venv/bin/python -r prototype/requirements.txt
createdb luklaan_dev
.venv/bin/python prototype/server.py --port 5173
```

The current machine already has a local PostgreSQL service; isolated `luklaan_dev` and `luklaan_test` databases were created for this project. No existing database or PostgreSQL configuration was changed. Default local connection: `dbname=luklaan_dev host=localhost` using the OS user. Set `LUKLAAN_DATABASE_URL` through the process environment for another deployment. The approved ignored repository-root `.env.local` contains the existing OpenAI key. Do not put keys in client JavaScript, logs or Git.

Open http://localhost:5173 . The family overview is `/#care`; the physician summary is `/#summary`. `/care-demo.html` uses clearly labeled fictional data for reviewing alert UX only; its controls never write medical data. `/mascot-preview.html` previews the current mascot poses. The current mascot is approved and retained unchanged.

## Implemented

- Official OpenAI Python SDK `2.54.0`: `client.responses.create` for food estimation/AI summaries and `client.realtime.client_secrets.create` for ephemeral credentials. The main key stays server-side. Browser WebRTC remains the audio/video transport; no SDK is needed to replace `RTCPeerConnection`.
- 58 shared app voice actions plus camera and structured observation tools. Mutations require current-turn spoken confirmation. Same mounted conversation across navigation, minimizing and supplementary panels; microphone mute does not reconnect.
- Four mascot poses driven by listening/thinking/speaking/success, mic/AI audio amplitude, status-cloud feedback and reduced-motion support. No transcript wall or typed chat; conversational replies remain audio.
- PostgreSQL persistence with psycopg 3, a bounded pool (1–6), normalized observation rows, JSONB payloads, workspace/time/kind indexes, revision checks and row locks. Confirmed records only; demo/unconfirmed records and raw audio/images are excluded.
- Confirmed writes create versioned deterministic summaries. Explicit AI summaries read persisted records and save immutable report/evidence/model snapshots. The archive retains source evidence even if observations are later edited.
- Browser outbox retains unsent changes. Stale writes receive a conflict instead of overwriting another tab. Opening the latest version first backs up the unsent draft under `luklaan-recovery-draft` in localStorage.
- Family overview: attention items, measured values, gaps and recent confirmed observations. Physician view: readable brief followed by condition-specific evidence and questions. Nutrition estimates are distinct from device readings. Missing records are not treated as normal health or nonadherence.
- Deterministic in-app alerts for reported measured glucose below 70 mg/dL, BP over 180 systolic or 120 diastolic, explicitly missed/partial medication and reported symptoms after medication. Historical readings are labeled; acknowledgement does not resolve the clinical concern. Rules and source references are in the research note.

## Data boundaries and scale

The HttpOnly SameSite workspace cookie separates local browser workspaces. It is not production authentication, patient identity verification or remote caregiver membership. All pages in this local workspace are accessible on this browser; consent switches remain sharing previews. There is no remote data delivery, SMS, carrier dialer, closed-app push, clinical escalation or hospital integration.

Audio, enabled camera samples and requested meal/summary inputs are sent to OpenAI. Responses calls use `store:false`; this is not a claim about all provider retention. Database records include confirmed health information and therefore require proper identity, consent, restricted runtime roles, backups, retention and operational controls before remote production use.

Current synchronization is a bounded full-state snapshot (5000 observations, 2MB). Before scaling, use per-record writes, paginated history, patient/household authorization, RLS tested with a non-owner role, durable delivery outbox, background summary/reminder workers, rate limits and tracing. Move SQL migrations out of runtime startup for deployments. No supported-user-count or latency guarantee is claimed without load tests. See [research](research/2026-11-04-CARE-BRAND-AND-SCALE.md).

## Verification

```sh
createdb luklaan_test
PATH="$PWD/.venv/bin:$PATH" node --test prototype/tests/*.test.mjs
.venv/bin/python -m unittest discover -s prototype/tests -p 'test_*.py'
```

PostgreSQL tests use isolated generated workspaces in `luklaan_test` and clean up only their own fixtures. SDK tests use official SDK serialization through a mocked HTTP transport, including redacted error handling. Database tests cover restart persistence, household isolation, concurrent conflicts, immutable evidence, deduplication, invalid readings and acknowledgement semantics. Browser checks cover persisted archive and responsive family/physician UI. The latest browser session reached the listening state through the SDK-backed Realtime setup. Real spoken Thai recognition accuracy, physical camera answers and end-to-end latency remain unverified. Live SDK Realtime credential creation and an AI report generated from fictional persisted observations both succeeded; the report snapshot was verified in PostgreSQL. Current automated checks: 98 JavaScript and 44 Python tests passed.

## Voice and knowledge increment

Audio profiles: speakerphone (far-field + semantic VAD medium), headset (near-field + semantic VAD medium), noisy environment (far-field + less sensitive server VAD and longer silence). Browser audio processing is requested only when supported. Say “แถวนี้เสียงดัง” to request the noisy profile, or open Profile → การรับเสียงและเสียงรบกวน. Manual mute stays muted; the existing call is retained. Warm Thai turn-taking is configured through the Realtime instructions. Acoustic performance and background-speaker rejection still require real-device tests.

A `knowledge_lookup` Realtime function searches attributed general knowledge. Local PostgreSQL RAG is active, using full text/topic expansion over reviewed public snippets. Say “ลูกหลานใช้ข้อมูลจากไหน” or open Profile → แหล่งข้อมูลที่ลูกหลานใช้ to inspect the source list. Optional MCP and hosted vector-store adapters are implemented but no external health sources or private records are connected. Copy `knowledge-sources.example.json` to the ignored `.runtime/knowledge-sources.json` to configure approved public sources. Do not enter secrets in the example or frontend. See [voice/retrieval research and limits](research/2026-11-04-VOICE-AND-KNOWLEDGE.md).

Live verification of this increment: all three audio profiles were accepted by Realtime credential creation; read-only public OpenAI documentation MCP retrieval succeeded using a generic technical query. This does not connect a healthcare MCP server or a hosted document vector store in the app's production configuration.

## Family almanac design and calendar

Open `/#calendar` for a month and daily agenda combining recurring example medication/calls with personal appointments. Add/edit/cancel appointments, activities and follow-ups persist in PostgreSQL; cancellation retains history. The daily examples do not create prescriptions, bookings or scheduled real calls. Calendar actions are also in the voice catalog with confirmation for mutations. Dates are stored as Gregorian ISO and displayed in Thai/Bangkok time. Arrow keys/Home/End/PageUp/PageDown navigate dates; route motion does not repeat on every date update. Mobile navigation now includes Calendar, with medication accessible from its agenda and desktop menu. The approved mascot remains unchanged.

Home/history/medication/family/physician pages share the almanac typography, thin rules, restrained paper surfaces, consistent buttons and SVG icon family. Research, visual concepts and practical limits: [Family almanac](research/2026-11-04-FAMILY-ALMANAC.md).

## Observable assistant workflows

Voice tools now show a compact activity panel for work in progress, confirmation, success and failure. Health and plan mutations bind confirmation to the exact proposal in a subsequent speech turn, then wait for PostgreSQL acknowledgement. Record deletion removes current observations while keeping previously saved summary evidence. Record timestamps accept explicit offsets; list tools support date/text filters and pagination.

`web_search` uses the official OpenAI SDK hosted search on the backend and returns source links. A manual fallback is available under Profile → sources → search websites. General public questions only; household records are not attached. Optional external MCP and RAG remain separately configured.

See [workflow verification](research/2026-11-04-ASSISTANT-WORKFLOWS.md) and [web and conversation research](research/2026-11-04-WEB-AND-CONVERSATION.md). This is a localhost production simulation, not an authenticated, deployed clinical service.

Medication checks now use `medication_lookup` with public label fields and cited web retrieval. Generic medicine names and printed strengths pass the public-query boundary. Optional null search-source fields no longer crash retrieval. Realtime waits for the current response to finish before requesting a tool-result reply, and sends the first available camera frame after opening it. Live synthetic Thai audio completed a medicine-search and audio-reply round trip; physical label-reading accuracy is still unverified. See [medicine search fix](research/2026-11-04-MEDICINE-SEARCH-FIX.md).

Voice delivery is centralized in `voice_style.py`; greeting and fixed readback guidance reach the browser with the Realtime session setup. Phone scripts use the same informal Thai style, while preserving explicit confirmation. Speaker/headset semantic turn detection now uses medium eagerness. A live greeting sample completed; subjective naturalness across free conversation still needs user listening evaluation. See [voice update](research/2026-11-04-NATURAL-VOICE.md).

The home screen now prioritizes one conversation entry and two navigation shortcuts. The journal defaults to personal records with search, category selection, Bangkok-day grouping and optional examples; those view controls are also available through `history.filter`. Camera-live status overlays are visually removed while the header retains data-use context and screen readers retain status updates. See [UX verification](research/2026-11-04-EASIER-UX.md). `/camera-preview.html` is a clearly labeled layout-only fixture that never opens hardware or calls AI.

## Voice control and visible tasks

The app registry exposes 62 validated commands plus camera, health observation, and retrieval tools. The activity panel shows the actual target, page, confirmation, persistence attempt, and result. Calendar drafts and stored summaries can be inspected and operated through voice. Read the [spoken test script](VOICE-TEST-SCRIPT.md) and [coverage and limits](research/2026-11-04-VOICE-CONTROL-COVERAGE.md). Registry coverage does not guarantee recognition of every utterance.

## Settings and English

Open Settings to choose Thai or English, larger text, and a speaker, headphones, or noisy-surroundings audio profile. The language choice persists in PostgreSQL. Voice commands include “Switch to English” and “เปลี่ยนเป็นภาษาไทย”. Switching during a call updates the existing Realtime session. Owned UI text and display dates change language; personal notes and archived reports keep their original wording. New AI summaries and meal explanations use the selected language.

English audio smoke check with the approved local API setup: `.venv/bin/python prototype/scripts/preview_voice.py --language en --output /tmp/luklaan-english.wav`. This opt-in check makes a paid provider call and does not record a microphone.
