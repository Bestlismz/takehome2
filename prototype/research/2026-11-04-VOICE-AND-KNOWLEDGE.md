# Voice quality and attributed knowledge

Goal: warm family-like conversation without impersonating an actual relative, and evidence-backed general answers without silently exporting a patient's record.

## Audio decisions

Request supported browser echo cancellation, noise suppression, automatic gain and mono input as **ideal** constraints. Capability values come from actual track settings, not the request; unavailable features stay unknown. No amplitude noise gate: a quiet older speaker must not be cut off. The browser does not isolate one person's identity and cannot promise to remove TV or nearby speech. See https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/noiseSuppression .

Provider-side input noise reduction defaults to far_field for speakerphone/laptop; headset uses near_field. Default semantic VAD with low eagerness lets a slow speaker pause. The noisy profile uses server VAD with threshold .65 and 1300ms silence (a tuning starting point, not measured optimal settings). Both preserve interruption; phone mock mode retains create_response=false. Shared profiles are in audio-profiles.json. Applying a profile sends session.update on the existing channel; it does not replace the peer, stop tracks or unmute input. UI reports a requested change, not proven acoustic improvement. Sources: https://developers.openai.com/api/docs/guides/realtime-vad and https://developers.openai.com/api/reference/resources/realtime/client-events .

Tone: Marin plus Thai session instructions; short natural sentences, slight pauses, one question at a time, no childish performance or unsolicited family titles. Introduce as an AI. Ask the user to repeat unclear input; do not infer health values from noise or treat background speech as confirmation. These are model instructions, not a guaranteed background-speaker detector. Existing current-turn spoken confirmations remain in force.

## Retrieval design

Local RAG retrieves reviewed public snippets from PostgreSQL. GIN topic/full-text indexes and Thai topic aliases support Thai questions. It is lexical retrieval with topic expansion, **not** embedding/vector similarity. Source title, URL, reviewed date and excerpt accompany each result. Unknown topics return an empty result; never fill missing evidence with invented citations. Current seed: NIDDK, AHA and Thailand Department of Health. It contains general knowledge and must not replace the patient's clinician plan.

External adapter uses the official OpenAI SDK Responses API for configured read-only remote MCP tools and configured public vector stores (`file_search`). Docs: https://developers.openai.com/api/docs/guides/tools-connectors-mcp and https://developers.openai.com/api/docs/guides/tools-file-search . Copy knowledge-sources.example.json to the ignored `.runtime/knowledge-sources.json` or set LUKLAAN_KNOWLEDGE_CONFIG to an administrator-owned file. Entries require publicKnowledgeOnly=true; MCP requires HTTPS, explicit readOnlyTools, and an SDK read_only filter. Optional authentication reads the named process environment variable only; it is never returned by the source-status API. No secret was created or written for this feature.

Only explicitly requested external general-knowledge queries use configured tools. No event/profile/audio/image fields are attached. The query boundary rejects obvious contact identifiers and numeric patient readings, but cannot reliably detect every personal name in arbitrary text; prompt restrictions and public-only source administration remain important. This is not a substitute for production consent/authorization or a data-loss-prevention system. Do not configure private hospital documents in a globally shared vector store. Patient-specific sources require household/patient authorization, per-tenant stores/filters and an explicit data-sharing flow before implementation.

Untrusted retrieval text is evidence, never permission to navigate, change records or change treatment. External adapter supplies no application mutation tools. Tool-call errors, pending approval or absent verified calls cannot become a successful retrieved answer. The UI distinguishes configured from verified use. No external MCP health service or vector store is configured by default.

## Acoustic acceptance checks still needed on physical devices

Use the same phrases on a representative iPhone/Android/laptop, with user consent; do not retain recordings by default. Compare quiet room, fan noise, TV speech, nearby conversation, quiet/distant speaker and speakerphone echo. Record false interruptions/minute, missed commands, end-of-turn delay and incorrect confirmation attempts under stated device/distance/noise conditions. Include a five-second pause, a user interruption during AI playback, and a deliberately ambiguous number. Do not use generated noise in a mock transport test as evidence of real acoustic performance.

## Verification performed

46 JavaScript and 25 Python tests passed. The live provider accepted all three audio session configurations. A live Responses request used the official public OpenAI documentation MCP search tool successfully with the read-only filter; this was an in-memory integration test, not a production healthcare source configuration. Browser checks verified profile selection/restoration and the source list without console errors. Acoustic quality, speaker identity rejection and full spoken retrieval still require the physical checks above.
