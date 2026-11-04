# Current implementation: ลูกหลาน, 4 November 2026

This update supersedes earlier prototype boundaries below. The app now uses an original cut-paper mascot, a Python same-origin backend, real OpenAI Realtime WebRTC audio, sampled live-camera image input, structured food/glucose/adherence/symptom observations and seven-day physician summaries. It retains an in-page mock telephone channel; it does not dial carrier numbers. See [current README](README.md), [backend details](BACKEND.md) and [research](research/LUKLAAN-RESEARCH.md).

Three live provider smoke tests returned HTTP200: Realtime credential creation, food estimates and physician narrative. Browser food estimation also completed. Actual microphone/camera conversation remains unverified in the in-app browser because permission timed out. Patient accounts, hospital plan synchronization, a protected server-side medical-record store, clinical nutrition validation and physical phone testing are still outstanding. The current user's key is stored only in the approved ignored root .env.local and is not part of these sources.

The prior design record follows for history.

# อุ่นใจ

ต้นแบบ HTML สำหรับผู้สูงอายุที่ต้องดูแลโรคเรื้อรังที่บ้าน พัฒนาจากเอกสาร AWSxTrue_Hack โดยเน้นการกินยา อาการ และค่าที่วัดระหว่างนัด ไม่ยืนยันตัวเลขสถิติในเอกสาร เพราะต้นแบบไม่ต้องใช้ข้ออ้างเหล่านั้น

## Product decision

หน้าหลักแสดงสิ่งที่ทำได้วันนี้ ผู้สูงอายุกดยืนยันกินยา เปิดกล้อง หรือพูดได้โดยไม่ต้องผ่านแชต การพูดมีข้อความอ่านทวนและปุ่มยืนยันก่อนบันทึก โทนภาษาชวนช่วย ไม่ใช้คะแนนลงโทษหรือสื่อว่าลูกหลานเฝ้าดูตลอดเวลา

ผู้สูงอายุเห็นข้อมูลของตนเองก่อน คนดูแลดู preview ของข้อมูลที่ได้รับอนุญาต แพทย์เห็นเหตุการณ์และแหล่งที่มาในช่วงระหว่างนัด ทั้งสามมุมมองอ่าน event ชุดเดียวกัน

## Functional boundary

| Capability | This prototype | Production work |
| --- | --- | --- |
| Camera | Request real camera, front/rear preference, explicit device selection, capture/review | Physical iOS/Android testing and permission recovery |
| Voice | Browser Thai recognition when supported, Thai speech synthesis, deterministic intents, typed fallback | Thai ASR/TTS quality, streaming backend, interruption handling and clinical evaluation |
| Medication | Example schedule, explicit confirmation, local history | Clinician-approved prescription, timezone-safe scheduler, reliable push notifications |
| Blood pressure and temperature | User enters values from a measuring device; sources labeled | Validated device adapters and clinical workflow |
| Photos | Camera capture attached to local entry | Thai OCR, structured extraction, confidence and user confirmation |
| Caregiver | Local consent controls and preview only | Authentication, invitation, scoped authorization, audit log and delivery acknowledgements |
| Doctor | Report preview and browser Print / Save as PDF | Clinical review, interoperable export and consented delivery |
| Storage | Local browser storage; no server | Encrypted database, retention controls, backups, per-user isolation and access controls |

Ordinary RGB phone cameras do not directly measure core temperature or medically reliable blood pressure. A captured device display is supporting evidence, not a sensor measurement. No automated treatment or dose adjustment is implemented.

## Data contract

```js
HealthEvent = {
  id: string,
  kind: 'dose' | 'bloodPressure' | 'temperature' | 'symptom' | 'photo',
  occurredAt: string, // ISO timestamp
  source: 'manual' | 'voice' | 'demo',
  isDemo: boolean,
  payload: object
}
```

Blood pressure payload contains numeric systolic and diastolic plus mmHg. Temperature contains numeric value plus °C. A dose contains scheduleId and dateKey. Symptoms preserve the user's words. A photo can be included as a local reduced-resolution JPEG. Never infer a dose event from a schedule or camera photo. Event IDs make confirmed entries explicit. A separate camera session owns tracks and stops them on close, route transition and page hide.

Voice lifecycle is idle, listening, reviewing, saved or error. Camera lifecycle is closed, requesting, live, captured or error. A generation token rejects late camera responses after close. Browser permission and storage failures produce actionable messages.

## Production API sketch

- GET /v1/me/today returns authorized schedule instances and readings.
- POST /v1/events accepts a discriminated event and idempotency key.
- POST /v1/voice/sessions creates a short-lived authenticated audio session.
- POST /v1/attachments issues a scoped upload URL, never a public photo URL.
- POST /v1/reports builds a patient-reviewed report from an authorized date range.
- POST /v1/caregiver-invitations and PATCH /v1/sharing-consents separate an invitation from authorization.

Keep authorization on the server for every patient resource. Caregiver preview in this prototype is not authorization. Use native app adapters for HealthKit, Android Health Connect, Bluetooth devices, local notifications and secure storage. Keep the event contract shared across clients. A web prototype can be reused as an interaction specification for Flutter, React Native or native clients.

## References and adopted patterns

- Source brief: https://docs.google.com/document/d/1eZrkTrX7iKYR0eC-Wts6rZdmXozrkSHMklZ8QXb_Vj8/edit
- Medisafe Medfriend supports family assistance after missed reminders. Adopt a supportive family role with explicit consent. https://app.medisafe.com/tips/med-friend-in-need-is-med-friend-indeed/
- OMRON connect supports measurement history and health report sharing. Adopt explicit measurement sources and an exportable chronological report. Device support varies by market. https://www.omron-healthcare.co.uk/omronconnect-support
- ElliQ describes proactive conversations and reminders. Adopt an approachable voice action without pretending the assistant is a clinician. https://elliq.com/pages/faqs
- FDA warns about unauthorized blood pressure measurement devices. Do not substitute a generic camera for an evaluated device. https://www.fda.gov/medical-devices/safety-communications/do-not-use-unauthorized-devices-measuring-blood-pressure-fda-safety-communication
- Browser speech recognition has limited availability and may use a remote browser-provider service. The UI requests a microphone only after the user's action. https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- Camera requires a secure context and permission. Stop the existing track before switching facing mode. https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

## Open-source integration candidates

These are researched extension points, not installed integrations.

| Component | Candidate | License | Integration note |
| --- | --- | --- | --- |
| Thai speech recognition | faster-whisper | MIT | Self-host audio transcription; evaluate Thai elderly speech and model licenses separately. https://github.com/SYSTRAN/faster-whisper |
| Thai OCR | Tesseract with Thai traineddata | Apache 2.0 engine | Read monitor displays or labels, present extracted values for confirmation. Verify accuracy and model assets. https://github.com/tesseract-ocr/tesseract |

Do not infer drug identity or dosing from an OCR result alone. Real-time speech generation, device measurement validation and clinical escalation need dedicated integration and evaluation.

## Revised visual direction

The user rejected the first sage/peach dashboard as generic AI styling. The current target is `assets/refined-concept.png`, generated with the built-in image tool. The final prompt requests a quiet Oura/Apple Health-inspired mobile home and voice screen, near-white #fafaf8, charcoal #242d27, IBM Plex Sans Thai, open metric rows and a floating frosted-glass control dock. No decorative planets, orbital lines, background blobs or health scores. The sphere is the voice activity control, not decoration.

Reference patterns checked on 3 November 2026:

- Oura separates today's relevant actions from health history. https://ouraringhelp.zendesk.com/hc/en-us/articles/360058599753-How-to-Use-the-Oura-App
- Withings puts measurement logging and a measurement timeline in its Home experience. https://support.withings.com/hc/en-us/articles/39368966174481-Withings-App-Home-tab
- Apple explains Liquid Glass as a dynamic interface material. Use the idea for navigation and controls while preserving clear content surfaces. https://developer.apple.com/videos/play/wwdc2025/219/

## Voice tools and live video

`voice-tools.js` is the tool allowlist. Thai recognition and typed input both enter the same dispatcher. Supported tool calls are camera.open, camera.switch, camera.capture, history.open, medication.open, care.open, today.open and report.preview. A tool reports success only after its handler completes. Camera permission failure produces an error, not a successful tool result. A measurement or symptom is read back before a separate confirmation can create an event. No voice tool sends a message or changes a prescription.

The browser microphone analyser computes RMS from time-domain samples and passes a 0–1 level to the sphere. The sphere's size and cloud motion respond while listening. Browser speech synthesis start/end events control speaking motion. TTS animation follows voice activity, not a measured output waveform, because browser speech synthesis does not expose its audio samples. Stop, close, page hide and route transitions release microphone and camera resources. The camera uses a generation token to discard late permission results and stops tracks before switching.

For production visual conversation, maintain one authenticated session over WebSocket or WebRTC for audio, transcripts, vision frames and tool results. Sample downscaled frames from the live video with timestamps and a bounded queue, for example 1 frame per second as an initial design parameter to evaluate, not a measured requirement. Associate each spoken question with recent frames and expose a visible camera-active indicator. The backend should return recognized text, a spoken reply or audio stream, and structured allowlisted tool calls. Camera selection stays on the client. Validate consent and scoped authorization before transferring any audio or image. Do not infer medical readings, pill identity or dosing from uncertain video output. Preserve a typed/manual correction path.

## Continuous conversation update, 3 November 2026

Re-read the source Google Doc at revision `AHj4eMSdsD2cXHN3-dquWtsjgscCgK6nDCsfw2EA93NMg1d-DWlhTzoZamXbAN7QuHtkC6cK_2NHzbzO7RpiT6vVewIgFlp9PQPRZrIQugk`. The expanded Tae problem statement, pain points, gaps and opportunity sections emphasize a voice agent that calls a basic telephone, the gaps between appointments, and avoiding digital-skill requirements. Statistics in that brief remain source claims, not independently validated product evidence.

The user still requests a mobile app with live camera. Apply the brief's low-effort interaction to one continuous call within the app. A basic telephone channel is an additional production delivery path, not a capability of this browser prototype. It requires telephony integration, identity/consent handling, call scheduling and delivery monitoring. Browser voice and video continue to require an internet-capable device and supported browser services.

The current interaction starts the microphone when the user enters the conversation. The initial app gesture and browser/OS permission cannot be bypassed. After that, recognition resumes automatically after silence, tool completion and spoken replies. A microphone-pause control and ending the conversation stop automatic resumption. The prototype pauses listening during its own synthesized speech to avoid transcribing its answer. Simultaneous interruption/barge-in requires a production audio transport with echo cancellation; it is not claimed here.

Camera opening, closing, capture and switching operate inside the same conversation dialog. They keep its title, URL, transcript, pending health record and active voice session. Opening the camera reveals an inline video region. Closing it removes only the video stream. A camera permission error leaves the conversation available. Capturing a photo keeps the live video and displays a separate captured preview. Health values and symptoms are read back and can be confirmed by saying “ยืนยัน” without opening a form. Missing readings prompt a spoken follow-up. No unsupervised medication changes or camera-derived measurements are introduced.

`VoiceSession` owns session activity, the recognition turn, tool-processing suspension, synthesized speech, audio-meter tracks and automatic resumption. `camera.close` and `conversation.end` are distinct allowlisted tools. Permission denial stops repeated permission requests, and bounded network retries avoid an endless reconnect loop. Superseded camera tool requests cannot overwrite the latest reply or speak into a newly opened conversation.

Regression checks are in `tests/voice-session.test.mjs`. They cover automatic listening after silence, tool completion followed by speech and another recognition turn, explicit microphone pause, permission denial, and distinct camera-open/camera-close/end-call commands. These checks use mocked browser speech APIs and do not establish physical-device recognition accuracy.

## Phone channel and final visual direction

The product includes proactive calls to a normal telephone number for medication reminders and symptom follow-up, including when the app is not open. The prototype now includes a call plan, simulated incoming call, voice-only connected call, missed/deferred/wrong-recipient states and a post-call summary. This is a required product channel, not an optional chat notification.

The current theme is monochrome: near-white, graphite and silver. Green has been removed. Muted red identifies declining or ending a call. The home call-plan entry is one tappable row. The incoming screen exposes accept/decline; after acceptance, controls are limited to microphone pause and hang-up. It has no answer choices, text input or chat bubbles. The assistant introduces itself as automated, confirms the recipient and willingness to talk, asks one question at a time, reads the answers back and waits for spoken confirmation. A voice correction restarts the relevant questions. Unrecognized answers prompt a spoken clarification.

The latest voice-only requirement supersedes earlier typed-fallback and example-answer controls in the conversation design. The app's separate manual health forms remain available, but phone and assistant conversations do not use typing as a substitute for replying. If the browser speech service is unavailable, the screen shows a retry/permission status and allows ending the call; it does not silently switch to typed responses.

Motion is tied to purpose: incoming call halo and icon movement draw attention; fluid sphere motion indicates listening/speaking; content transitions clarify a change of call state; press scaling and elevation provide touch feedback. Camera reveal and orb resizing remain inside the same app conversation. All decorative and state-transition motion respects reduced-motion preferences.

Call records use `kind: call`, explicit disposition, separate self-reported answers, a confirmation flag and demo provenance. A missed or declined call has no medication answer. Completing a simulated call creates only a demo call event, never an actual dose confirmation. Reports can include the labeled demo call record. The plan and retry times are saved locally for demonstration and do not create scheduled jobs or provider calls.

Production telephone delivery requires an outbound dialer and telephony media transport, scheduling in the patient's time zone, recipient/consent handling, speech recognition and synthesis, tool execution, retries with idempotency, and consented caregiver visibility. The carrier call must not depend on the app being open. Actual calls, SMS, emergency dispatch and caregiver messages have not been connected or sent. Video understanding remains a separate unconnected app capability.

Validation includes 10 automated cases across voice lifecycle and phone-call state transitions. A complete medication/symptom/review/confirmation journey is tested through spoken-transcript events with no answer buttons or text input. These tests mock speech APIs and do not establish real Thai recognition quality. Browser inspection verified no text inputs and only microphone/end-call controls in the connected phone UI. The in-app browser's speech service remained unavailable during the final device check; a physical phone/carrier call has not been tested.

## Persistent voice/video stage

The conversation uses one fixed-size canvas rather than inserting a camera section above the voice controls. The video node stays mounted. When its first frame arrives, opacity reveals the camera and transform moves the same companion orb into a corner. Closing returns to the orb without changing the stage or dock bounds. The only persistent controls are microphone, camera and hang-up; camera switching appears over live video. Capture remains a voice tool and shows only a small saved-image thumbnail. Extra camera toolbars, demo examples and tool-result cards have been removed.

Camera permission requests run independently of the recognition turn. Spoken acknowledgments still temporarily pause recognition during synthesized speech. Browser and OS permission are required. The transition uses CSS opacity/transform, honors reduced motion and cancels stale stream cleanup on reopening. This revision changes the existing browser frontend; it does not add a Next.js app or Python API.

Four new automated cases cover persistent stage identity, closing/reopening cleanup, permission-error recovery and first-frame readiness (14 total cases). Browser geometry checks at 390×844 confirmed unchanged stage, dock and dialog bounds during opening. The camera permission request timed out in this verification session; real live-video motion and device performance still need physical testing. General vision inference and telephone delivery remain unconnected.

## Voice-first mascot increment

Shared 45-action voice catalog; current-turn confirmation for mutations; persistent conversation dock and separate panels; mute without reconnection; original mascot icons and four interactive sprite poses with reduced-motion support. See README for verification and browser permission limits.

## 4 November 2026: family care, SDK and PostgreSQL

The user clarified the purpose: **ลูกหลาน ช่วยดูแลคนที่เรารัก**. The family organizes care; the older adult speaks naturally. Current implementation uses the official OpenAI Python SDK and PostgreSQL directly (SQLite was considered and rejected at the user's request). Confirmed observations, deterministic summary snapshots, explicit AI reports/evidence, acknowledgements and audit records are persisted. Family overview emphasizes attention, gaps and next questions; physician brief preserves evidence and distinguishes estimates. Status clouds communicate listening/thinking/speaking without transcribing the conversation. Three mascot concepts are for selection only; the current production mascot remains unchanged. Historical descriptions of browser-only storage above are superseded by README/BACKEND. Remote sharing, actual calls, background alerts, clinical validation and production identity are still outstanding.
