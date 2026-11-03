# อุ่นใจ

Interactive mobile-first prototype for older adults, caregivers and appointment summaries. The current design uses a quiet white interface, readable dark type and a frosted floating control dock. A silver voice sphere responds to microphone energy when browser audio permissions are available, and animates during browser speech playback.

Run from this folder:

```sh
python3 -m http.server 5173 --bind 127.0.0.1
```

Open [the prototype](http://localhost:5173). No build, package installation, API key or backend is needed. Use a current browser that supports SpeechRecognition for speech commands. Browser speech services can require network access. Google Fonts loads IBM Plex Sans Thai and Manrope, with system fallbacks.

Camera and microphone require permission and a secure context. A real phone needs an HTTPS origin; opening a Mac's LAN HTTP address on a phone is insufficient for camera access. Physical front/rear switching depends on the cameras the browser exposes. Permission requests time out with a retry state. Conversations require a functioning speech service.

## Try the flows

1. On the home screen, tap “ลองให้อุ่นใจโทรมา”. Keep this page open: a five-second countdown leads to a simulated incoming call, with a synthesized ringtone when browser audio is allowed. Cancel during countdown or accept/decline when it rings. An unanswered preview becomes a missed demo call after 30 seconds. This is an in-page preview, not an OS call or background notification.
2. Tap the “อุ่นใจโทรมาดูแล” row to inspect the example call plan and choose a medication or symptom call preview. The real product should call a normal telephone number even when the app is closed. The preview never dials a number.
2. Accept the simulated incoming call. The assistant introduces itself and asks whether the intended recipient is available. Answer by voice. After acceptance, only microphone pause and hang-up controls remain; there are no answer buttons or text fields.
3. Say “ใช่ สะดวกคุย”, answer the medication question, describe symptoms and say “ยืนยัน” after the spoken readback. A sample call summary is stored with demo provenance. It does not mark an actual dose taken.
4. In the call-plan dialog, preview a missed call. A missed call is not interpreted as a missed dose or a health symptom.
5. For app voice/video, tap “พูดกับอุ่นใจ” once and say “เปิดกล้องหลัง”, “สลับกล้อง”, “ปิดกล้อง” or “ความดัน 128 ต่อ 78”. The microphone resumes between replies. Phone and app conversations both require voice replies.
6. Browser permission and speech-service support are necessary. The current in-app browser can fail to connect to its recognition service. The UI offers retry or ending the call, not a typed conversation. General AI conversation, live vision understanding and carrier calls remain unconnected.

Run the regressions:

```sh
node --test tests/*.test.mjs
```

## Files

- `app.js` composes screens, dialogs, local state and tool handlers.
- `data.js` owns event creation, sample readings and local persistence.
- `media.js` owns camera and voice lifecycles, microphone RMS analysis and supported Thai command interpretation.
- `voice-tools.js` declares the tool allowlist and dispatch boundary. An AI provider can produce this structured call format later.
- `styles.css` contains the monochrome graphite/silver theme, glass controls, incoming-call motion, sphere animation, touch feedback and responsive layout. Reduced motion is respected.
- `call-ringtone.js` synthesizes the demo ringtone with Web Audio and stops its tones when the call leaves the incoming state.
- `phone-calls.js` owns call-plan UI, incoming/connected/summary rendering, voice-only phone-call state transitions and demo call records.
- `conversation-stage.js` and `conversation.css` keep voice and video in one fixed-size canvas. The same video element fades in after its first frame; the orb moves into the corner. One control dock replaces the separate camera toolbar, status cards and example section.
- `PRODUCT.md` documents the feature boundary, researched sources and production architecture.
- `pages.css` styles health history, medication, caregiver controls and shared form surfaces.
- `home.css` styles the home dashboard: silver voice panel, floating orb, reading tiles and combined health/caregiver panel.
- `assets/home-silver-concept.png` is the latest home reference. Earlier concepts are retained as design exploration.

## What is still a prototype

Voice commands use deterministic Thai intent matching. They execute real local UI tools, but this is not a connected general-purpose AI agent. Open-ended conversation, video understanding, OCR, Bluetooth medical devices, remote notifications and shared accounts require backend/native integrations. Live camera pixels are not sent to a vision model. Example visual answers do not analyze the current image. The app does not measure blood pressure or body temperature through an ordinary camera.

The local store is for demonstration, not protected medical records. The supplied person, plan and seed readings are examples. Do not use this prototype as a clinical device or treatment plan.

The shared-stage revision retains the existing browser frontend. A framework migration is not required to remove layout shifts. Production speech, vision and telephone integrations still need an authenticated backend.

## Validation

Browser UI validation covered manual BP entry and persistence after reload, a voice-interface symptom proposal and confirmation, real tool dispatch to history and report, camera permission recovery, medication confirmation/undo, caregiver preview and mobile/desktop layout. The in-app browser displayed a live Mac camera feed. Physical phone front/rear switching and spoken Thai recognition still need device testing and browser/OS permission. The microphone meter is implemented with Web Audio RMS; an automated real-audio recording was not used to validate it.
