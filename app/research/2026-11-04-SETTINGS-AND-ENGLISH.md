# Settings and English

Settings now groups language, reading comfort, audio input, and data information. Thai and English use the same routes, semantic commands, and stored health records.

## Implementation choice

Explicit translation of owned string literals and static template pieces preserves interpolated user content. A whole-page DOM translator was rejected because it could translate personal notes and alter their meaning. The organizing model is a language choice of th or en, a reviewed English dictionary, and a separate bilingual Settings view. This follows Model the Domain.

The language preference is stored with the workspace in PostgreSQL. Display dates use the selected locale and Asia/Bangkok. Switching an active call updates its instructions and transcription language without replacing its peer, camera video, or stream. Historical notes and archived reports remain in their original language. New generated summaries and meal explanations use the selected language.

## Throughput checkpoint

- Blocking first steps. Establish locale APIs and inspect persistence before translating consumers.
- Independent workstreams. Main app translation, auxiliary views, and backend voice support had separate owners. The parent owned Settings and integration.
- Shared mutable state. app.js changes used separate functions and surgical patches. Test database fixtures were isolated from user data.
- Smallest safe decomposition. Share translation and locale helpers. Keep UI text independent from health record payloads.

## Verification

Prove It Works drove checks against rendered screens and stored settings. All 98 JavaScript and 44 Python tests pass. Tests cover exact static translation, unchanged Thai personal notes, safe escaping, calendar and summary renderers, English confirmations, same-peer language updates, preserved camera identity, and PostgreSQL language persistence.

The browser was checked on all six main routes in English. The only remaining Thai content in the journal, family, and summary was the original personal symptom note. English was retained after reload. Larger text and headphones choices were also retained after reload, then restored to their prior values. Settings had no horizontal overflow at 320 and 390 pixels. Temporary viewport overrides were reset.

A live Realtime audio check completed with the English greeting, "Hello, I'm your Luklarn AI assistant. How are you feeling today?" It generated audio through the official SDK without recording a microphone. Physical English speech recognition and acoustic performance were not evaluated in this task.

Calls and remote sharing remain demonstrations. Operating system microphone and camera permissions remain user-controlled. No commit or push was requested.
