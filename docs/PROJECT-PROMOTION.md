# Promote Luklaan to the main project

Done means root README, Makefile, dependencies, Docker stack and CI refer to Luklaan; app code lives in app; old AI-Ops files live under archive; all application tests pass; existing workspace data and ignored credentials remain unchanged; localhost:5173 and a clean Docker deployment serve the app.

1. Capture hashes and archive legacy files. Verify the move preserves bytes.
2. Move prototype to app and update ignored runtime paths. Restart the local app and verify its real API and UI.
3. In separate file ownership, implement root runtime commands and Docker, and the application CI. Parent updates docs and runnable path references.
4. Run all tests, build and exercise an isolated Docker app/PostgreSQL stack, inspect secrets exclusion, and review the combined diff independently.
5. Commit and publish the project promotion to main, preserving remote commits.

A flat root containing every browser asset and backend file was rejected. app keeps the static serving boundary narrow and preserves the existing root .env.local location. Root becomes the product entry point through README, requirements, commands and build configuration.

## Verified result

- The initial move preserved all 136 captured file hashes. The committed baseline is in project-promotion-baseline.json.
- Root make help and make test target Luklaan. All 99 JavaScript and 47 Python tests pass after the move.
- The root Docker image built and ran as UID 10001. Its filesystem contains no .env files, tests, or archived project.
- An isolated stack on localhost:5174 served the app, saved a fictional calendar entry to PostgreSQL, and returned the entry and selected language after app restart. The smoke stack used no OpenAI key.
- The original native server on localhost:5173 still serves the same app from app/server.py. Its database and root ignored credential file stayed in place.
- An independent read-only review found no actionable path, Docker, origin, persistence, or CI regressions.

CI now tests and builds Luklaan. No actual public production environment was configured, so the former workflow's deployment-marker commits are not continued.
