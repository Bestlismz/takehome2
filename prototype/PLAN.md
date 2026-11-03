# Aunjai prototype

- [x] Scope the decision the prototype exists to make: which layout, which interaction, which density, or for an empirical fork which behavior, timing, or approach.
- [x] Gather references when the design space is open.
- [x] Build throwaway in an isolated scratch dir, separate from production source.
- [x] When comparing alternatives, build them behind one switcher. Skip visual alternatives because the task-first direction has been selected from two independent architecture sketches.
- [x] Verify on the matching surface.
- [x] Present alternatives, tradeoffs, and a recommendation.

## Architecture

Ground: the working directory contains no app source. Existing tracked deletions predate this task and are left untouched. All work lives under prototype/.
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
