# Backend: OpenAI SDK + PostgreSQL

Run instructions and limitations: [README](README.md). Schema: [001_health.sql](migrations/001_health.sql). Repository: [health_store.py](health_store.py). SDK adapter: `request_openai()` in [server.py](server.py).

- `POST /api/realtime/session`: SDK-created ephemeral credential; no persistent key in browser.
- `POST /api/analyze-meal`: structured SDK Responses output, estimates only.
- `POST /api/workspace`: load/save confirmed observations/settings or acknowledge alert; server-issued workspace cookie, body revision required for save. 409 on stale writes. Bound pool and parameterized SQL.
- `POST /api/physician-summary`: reads saved workspace observations/profile, builds structured output via SDK and persists immutable report/evidence/model snapshot. Incoming client `events` are not the report's source of truth.
- `POST /api/summary-history`: newest 20 snapshots for current workspace.
- `GET /api/health`: configuration presence and model names only; never secrets.

The same-origin loopback HTTP server denies unexpected Host/Origin and non-JSON API bodies, limits request bodies and denies backend/env/SQL files as static assets. It is a local development server, not a scalable production HTTP gateway. Cookie workspace IDs are a local isolation mechanism, not user authentication. PostgreSQL account/household authorization, runtime least privilege and hosted TLS remain deployment work.

Persistent tables: workspaces/settings/revisions, observations, summaries, acknowledgements and audit. Summary snapshots retain evidence. Acknowledgement does not remove an alert or claim treatment. No audio/video blobs are stored. Retry or recovery state is explicit in the UI; no false success on a failed DB write.

PostgreSQL pooling: minimum 1, maximum 6, queue limit 16, 8-second checkout/statement budgets. OpenAI concurrency maximum 4, 50-second SDK timeout and one retry. Scale with per-record APIs/pagination, an app worker tier, PgBouncer when measured, background durable queues and observability; do not claim current capacity without load testing.

Voice: POST /api/audio-profile returns validated shared input settings. Session creation accepts audioProfile; no new connection is required to request a profile update.

Knowledge: POST /api/knowledge/sources reports actual public source/configuration metadata; POST /api/knowledge/search accepts query and optional external=true, never a record/profile. Default PostgreSQL retrieval returns excerpts and provenance. Optional configured read-only MCP/file_search runs through the SDK. No personal healthcare MCP or vector store is configured. See research/2026-11-04-VOICE-AND-KNOWLEDGE.md for query privacy limitations and physical audio checks.
