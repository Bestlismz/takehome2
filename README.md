# ลูกหลาน · Luklaan

<img src="app/assets/luklaan-mascot.png" alt="Luklaan mascot" width="112">

**ลูกหลานช่วยดูแลคนที่เรารัก** ผู้สูงอายุเล่าเรื่องกิน ยา อาการ และค่าจากเครื่องวัดด้วยเสียง ครอบครัวทบทวนสิ่งที่ต้องติดตาม และเตรียมสรุปก่อนพบแพทย์ได้ในแอปเดียว รองรับภาษาไทยและอังกฤษ

Luklaan is the main application in this repository. The earlier AI-Ops take-home project is preserved separately in [archive/aiops-takehome](archive/aiops-takehome/README.md).

## Run locally

Requires Python 3.13, Node.js 22, PostgreSQL 15+, and [uv](https://docs.astral.sh/uv/).

```sh
make setup

# First-time database setup only.
createdb luklaan_dev
createdb luklaan_test

# Create a local configuration file only when one does not already exist.
test -f .env.local || cp .env.example .env.local

make dev
```

Open [localhost:5173](http://localhost:5173). Add your `OPENAI_API_KEY` to the ignored root `.env.local` to use live AI features. The app loads without a key, but live conversation, search, and generated AI reports need API access. Existing local keys and PostgreSQL records do not need to move.

The native database default is `dbname=luklaan_dev host=localhost`, using the current OS user. Set `LUKLAAN_DATABASE_URL` in `.env.local` to use another PostgreSQL instance. No real key belongs in source code or `.env.example`.

## Run with Docker

```sh
make up
make health
make logs
make down
```

This starts Luklaan and PostgreSQL. The web port is published on `127.0.0.1:5173`; PostgreSQL stays on the container network. `make down` keeps database data. Docker uses its own `luklaan-data` volume, separate from native PostgreSQL databases.

If the native app already uses port 5173, choose another port:

```sh
LUKLAAN_PORT=5174 make up
LUKLAAN_PORT=5174 make health
```

Docker reads the optional root `.env.local` at runtime. It does not put that file in the image. `LUKLAAN_DB_PASSWORD` configures the local Docker database password; this does not change any native PostgreSQL account. Serve remote installations through an explicitly configured HTTPS origin and complete the account and access-control work described in [backend notes](app/BACKEND.md).

## What works now

- Thai and English voice conversation through the official OpenAI SDK and browser WebRTC, with an animated mascot and audio-input profiles.
- Front and rear camera use within the same conversation, with periodic images available to the assistant.
- 62 application commands for navigation, records, calendar, settings, reports, and visible task progress.
- Confirmed health records for blood pressure, temperature, glucose, symptoms, medicine adherence, and estimated meal nutrition.
- Searchable journal, personal calendar, family overview, alerts, and versioned physician summaries backed by PostgreSQL.
- Public web and medicine search with source links, plus reviewed local retrieval documents and optional external source adapters.
- Responsive settings, larger text, and a compact journal layout.

Carrier calls and remote family sharing are demonstrations. Camera images do not measure blood pressure, glucose, or body temperature. The current workspace cookie is local workspace separation, not production patient authentication. See [implemented behavior and limits](app/README.md) and the [spoken test script](app/VOICE-TEST-SCRIPT.md).

## Test

```sh
make test
```

Tests use isolated fixtures in `luklaan_test`; they do not need an OpenAI key. CI runs the JavaScript and Python suites, builds the application image, and verifies that the image serves the app and loads a PostgreSQL workspace. CI does not claim a production deployment or commit deployment markers back to this repository.

Live provider checks are optional and use the approved local API configuration:

```sh
.venv/bin/python app/scripts/verify_voice_tool_routing.py
.venv/bin/python app/scripts/verify_medication_search.py --audio
```

## Project layout

| Path | Purpose |
| --- | --- |
| `app/` | Main web application and Python API server |
| `app/migrations/` | PostgreSQL schema |
| `app/tests/` | Browser-logic, API, SDK-contract, and database tests |
| `app/research/` | Product, design, and technical research |
| `docs/` | Repository structure and migration record |
| `Dockerfile`, `docker-compose.yml` | Luklaan image and local app/database stack |
| `.github/workflows/ci.yml` | Luklaan test and image checks |
| `archive/aiops-takehome/` | Preserved previous project, outside the main runtime |

Development details are in [app/README.md](app/README.md). The repository promotion is recorded in [docs/PROJECT-PROMOTION.md](docs/PROJECT-PROMOTION.md).
