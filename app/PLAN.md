# Aunjai prototype

- [x] Scope the decision the prototype exists to make: which layout, which interaction, which density, or for an empirical fork which behavior, timing, or approach.
- [x] Gather references when the design space is open.
- [x] Build throwaway in an isolated scratch dir, separate from production source.
- [x] When comparing alternatives, build them behind one switcher. Skip visual alternatives because the task-first direction has been selected from two independent architecture sketches.
- [x] Verify on the matching surface.
- [x] Present alternatives, tradeoffs, and a recommendation.

## Architecture

Ground: the working directory contains no app source. Existing tracked deletions predate this task and are left untouched. All work lives under app/.
Sketch: compared voice-first and task-first navigation with two independent design agents. Selected task-first because a completed dose needs one tap, with a persistent voice action. Adopted readback and explicit confirmation from voice-first.
Data: one local event collection with id, kind, occurredAt, source, isDemo, payload. Medication schedules are separate. Consent is local prototype preference, never a claim of remote sharing.
Implement: vanilla HTML/CSS/ES modules, browser SpeechRecognition and speechSynthesis, getUserMedia with camera lifecycle cleanup. No backend, synthetic diagnosis, device connection, or remote notification.
Scrap: no production framework or clinical inference belongs in this interaction prototype.

## Design tokens

Ivory #f7f7f0, surface #ffffff, forest #244b3f, sage #e5ecdf, peach #f7e5d6, orange #bb693e. Thai Sarabun body with Manrope numerals and English, core copy 20px, smaller supporting chrome 14–16px, interactive height 48–60px. Cards 20–24px radius. Navigation has icon and label. Reduced motion supported.

## Throughput checkpoint

Build one complete home screen, then reusable record/voice/camera dialogs, then medication/history/caregiver/report screens. Verify each user-visible unit before final handoff. Core constraints are honest source labels, no automatic drug advice, no external sharing, and confirmation before saving a voice interpretation.

## Final checkpoint

The user rejected the initial decorative sage/peach direction. Replaced it with a near-white editorial layout and a floating glass dock. Current reference is assets/refined-concept.png. Home omits invented trend sparklines for temperature because there is only one sample temperature. Added real local voice tool dispatch and microphone-amplitude-driven sphere motion. Browser checks covered 320px and 390px mobile widths, 1440px desktop, large type, BP persistence, symptom readback, medication undo, caregiver scope preview, tool navigation/report and retaining a form draft when returning from camera. The in-app browser displayed a live 1280x960 camera feed. Physical phone front/rear and live Thai speech recognition remain unverified. No app errors were returned in the final browser console check.

## Follow-up, continuous call

- Re-read updated Google Doc including expanded phone-first opportunity and pain points.
- Keep the requested camera-enabled mobile app; document basic-phone calls as a separate backend delivery channel.
- Replace separate camera/voice dialogs with a single conversation and an inline video region.
- Start microphone on entering the conversation, restart after silence/tool completion/TTS, and preserve explicit pause/end behavior.
- Add camera-close and end-call voice tools, in-conversation health readback and confirmation, and cancellation of superseded camera replies.
- Verification: 5 voice lifecycle regression cases passed using mocked speech APIs. Browser UI verified unchanged conversation title and URL during camera open/close, and health readback followed by confirmation with the dialog still open. Real microphone and camera permissions did not become available in this verification session, so physical hands-free audio/video remains unverified for this update.

## Phone-first, voice-only, monochrome revision

Added call-plan settings and normal-phone incoming-call previews for medication and symptoms. The call model confirms recipient availability, collects spoken answers, reads back a summary and requires spoken confirmation. Missed calls never become missed-dose events. Demo calls are labeled and persisted separately from actual dose confirmations.

The user then required minimal premium styling without green and voice-only replies. Replaced the palette with near-white, graphite and silver, retaining muted red only for declining/hanging up. Removed call answer buttons, typed conversation forms and exposed sample answers from the live call flow. Reduced the home call-plan entry to one tappable row. Added incoming halo/icon motion, restrained content transitions, press feedback and in-session camera reveal motion, all with reduced-motion support.

Verification: 10 regression cases passed, including an entire voice-answer medication/symptom/confirmation journey using mocked speech. Browser DOM inspection confirmed zero text inputs and only microphone/end-call controls during the phone conversation. Computed styles confirmed monochrome incoming backgrounds and the phone-halo animation. Browser speech-service connectivity still failed during physical verification, so real speech recognition and carrier calling remain unverified/unconnected respectively.

## Shared conversation canvas revision

Replaced the expanding inline camera block with a persistent fixed-size stage. Camera and voice share the same DOM and session. Video fades in only after a browser frame is available; the orb moves to the corner using transform. Closing uses a transient local freeze frame, stops camera tracks immediately, and cannot clear a newly reopened stream. Camera opening does not hold voice processing while waiting for permission.

Removed the extra camera toolbar, large tool status card, sample vision section and duplicated instructions. One dock contains microphone, camera and hang-up controls; camera switching stays in the canvas. Supporting mobile text was enlarged after visual inspection.

Verification: 14 automated tests passed, including four stage/frame lifecycle cases. At a 390×844 browser viewport, stage, dock and dialog bounds were identical before and during camera loading; the dialog did not overflow. Browser permission timed out in this session, so live camera transition and physical-device smoothness remain unverified. No browser console errors were returned. The existing frontend remains; no Next.js or Python API migration was performed.

## Home refinement

Followed the silver home concept in assets/home-silver-concept.png. The greeting spans both columns; voice is the main action in a dimensional silver panel with a floating orb. Reading tiles precede the medication row. The right column combines the latest BP reading, chart and caregiver in one surface. Existing actions, sources and demo labels are retained. Home styling is scoped in home.css so conversation controls retain their layout.

Verified desktop at 1440×1050, mobile at 390×844 and large type at 320×760. No horizontal page overflow was found on either mobile check. Opened call-plan settings and the existing voice/video session from the redesigned home, then ended the test session. No browser warnings or errors were recorded. Syntax and diff checks passed. No speech, camera or telephony backend was added in this visual revision.

## Remaining pages and conversation parity

Applied the silver/graphite system to history, medication, caregiver and form surfaces. History now presents the latest recorded readings above segmented filters and a readable event list. Medication emphasizes schedule times and confirmation controls. The caregiver preview has a graphite identity panel while consent remains a distinct local-only preview.

App conversations now use the same stage height, orb size, status typography, button sizes and hierarchy at desktop and phone widths. Short screens reduce the stage and move the orb above the caption. Simulated telephone conversations reuse conversationStageMarkup with cameraEnabled:false and the same header/control styles, exposing only microphone and hang-up. App conversations retain camera controls.

Validation: all 14 existing automated cases passed after the shared phone stage change. Browser screenshots inspected history, medication and caregiver at 1440×1000 and 390×844. All three pages also had no horizontal document overflow in large-text mode at 320×568. History filtering returned the expected single temperature event; toggling caregiver preview revealed records and was restored to its previous state. At 1440px and 390px, app stage height was 400px, control icons 48px and status text 14px; the mobile dialog did not scroll internally. The simulated phone stage exposed two controls, no camera controls and no text inputs. Browser console returned no warnings/errors. Real speech service connectivity remains intermittent, and physical phone testing has not been performed.

## Visible mock incoming call

Added an explicit home action that schedules a simulated medication call in five seconds, shows a cancellable countdown and opens the incoming-call overlay automatically. The settings panel offers the same delayed action plus the existing immediate purpose-specific previews. A Web Audio ringtone is unlocked by the initiating gesture and stopped on acceptance, decline, closing or timeout. The page must remain open; there is no OS notification, background worker, carrier call or execution of the saved daily plan.

After 30 seconds without an answer, the demo records an unanswered call with no health answers. Existing daily call-plan settings remain demonstration data. All 16 automated cases passed, including delayed arrival, unanswered disposition, cancellation and cleanup. Browser verification showed the countdown, automatic incoming overlay, acceptance into the shared conversation and countdown cancellation at a 390px viewport. Ringtone playback is implemented but physical speaker output was not independently measured.

## ลูกหลาน: research, art and actual AI integration, 4 November 2026

Re-read the latest source document. Research and references are captured in research/LUKLARN-RESEARCH.md. Compared cut-paper editorial character design with clay/glass; selected original two-character paper mascot, terracotta/butter/cobalt accents, large tactile controls and reduced motion. New home, shared conversations and existing pages retain a consistent system. Added a distinct physician page and print view.

Architecture compared backend PCM proxy with browser WebRTC and chose short-lived Realtime client credentials from a same-origin Python server (now using the official OpenAI SDK). The permanent API key is in the user-approved ignored root .env.local, mode600. The server serves only frontend files, blocks private paths and foreign origins, bounds request bodies and redacts upstream failures. Images are sent only with enabled camera; provider image conversation items are limited to the latest two. Replies are actual provider audio; static mock phone ringing remains local.

Structured observations separate measured glucose/BP, user-reported medication adherence, symptoms after medication and estimated nutrition. Explicit confirmation is required; negation, old turn transcripts, old sessions and superseded meal requests cannot save records. Confirmed schedule-specific taken reports update medication reminders. Seven-day Bangkok summaries exclude demo, future, unconfirmed and old records, retain missing data, and never infer diabetes control. The clinician plan remains user-reported provenance.

Validation passed: 31 JavaScript tests, 8 Python tests, syntax and diff checks. Live API smoke returned200 for Realtime credentials, meal estimates and physician narrative using synthetic test data; physician evidence IDs matched supplied records. Browser meal UI returned ranges and confirmation without saving the synthetic meal. Home had no horizontal overflow at320px, original mascot loaded, and mobile physician entry opened the report. Browser microphone permission timed out, so end-to-end audio/video latency, physical phone camera switching and speech accuracy remain unverified. Nutrition smoke exposed a poor rice-ladle assumption; added a verified Thai Department of Health serving reference and capped confidence atmedium rather than treating API success as accuracy validation.

Persistent medical-record storage, remote caregiver access, carrier telephony, hospital synchronization and clinical validation remain separate production work. No push was performed for this update.

## Voice-first mascot increment

Shared 45-action voice catalog; current-turn confirmation for mutations; persistent conversation dock and separate panels; mute without reconnection; original mascot icons and four interactive sprite poses with reduced-motion support. See README for verification and browser permission limits.

## 4 November 2026: family care, SDK and PostgreSQL

The user clarified the purpose: **ลูกหลาน ช่วยดูแลคนที่เรารัก**. The family organizes care; the older adult speaks naturally. Current implementation uses the official OpenAI Python SDK and PostgreSQL directly (SQLite was considered and rejected at the user's request). Confirmed observations, deterministic summary snapshots, explicit AI reports/evidence, acknowledgements and audit records are persisted. Family overview emphasizes attention, gaps and next questions; physician brief preserves evidence and distinguishes estimates. Status clouds communicate listening/thinking/speaking without transcribing the conversation. Three mascot concepts are for selection only; the current production mascot remains unchanged. Historical descriptions of browser-only storage above are superseded by README/BACKEND. Remote sharing, actual calls, background alerts, clinical validation and production identity are still outstanding.
