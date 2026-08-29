# Bangkok PM2.5 Analysis Dashboard — Design Specification

Date: 2026-08-29

## Goal

Build a deployable proof of concept that helps people compare modeled PM2.5 conditions across all 50 Bangkok districts on an interactive map. The product must show the estimated concentration in `µg/m³`, explain health implications, and make the model resolution and data provenance explicit.

## Scope

The proof of concept includes:

- A Next.js frontend with an OpenStreetMap map.
- Markers for all 50 Bangkok districts, positioned at maintained district-center coordinates.
- Current modeled PM2.5 concentration, a 24-hour trend, and a five-day outlook.
- A searchable district list synchronized with map selection.
- Risk classification, plain-language health guidance, update time, and attribution.
- A Python FastAPI service that retrieves, validates, caches, and analyzes Open-Meteo/CAMS air-quality data.
- A Conda environment for local Python development.
- Dockerfiles and Docker Compose for deployment.

The proof of concept does not include user accounts, alerts, a historical database, sensor ingestion, administrative boundaries, or production-scale tile hosting.

## Data Semantics and Limitations

Open-Meteo's Air Quality API provides modeled CAMS PM2.5 estimates at approximately 11 km resolution. Every district value is therefore an area estimate sampled at the maintained district-center coordinate, not a measurement from a monitor located in that district. Nearby districts can legitimately receive identical or nearly identical values.

The interface must always show this limitation near the analysis and must never label the values as live monitoring-station readings. The display unit is `µg/m³`.

The API requests current PM2.5 and hourly PM2.5 data for the available forecast period. The backend derives:

- Current concentration from the upstream current value.
- Twenty-four-hour trend from the next 24 hourly values.
- Daily outlook from the mean and maximum of each available local calendar day, limited to five days.
- A display status and health message using one documented PM2.5 concentration scale.

For the proof of concept, the display scale uses the PM2.5 bands documented by Open-Meteo for the European Air Quality Index: good `0–5`, fair `>5–15`, moderate `>15–50`, poor `>50–90`, very poor `>90–140`, and extremely poor `>140 µg/m³`. The interface calls these “PM2.5 levels,” not an overall AQI, because only PM2.5 is being presented.

Required attribution appears in the product and README:

- Air-quality data: Open-Meteo and CAMS.
- Map data and tiles: OpenStreetMap contributors.

## Architecture

The system has two independently testable applications:

1. `web`: a Next.js application responsible for the map, charts, district search, selection state, responsive layout, and accessible presentation.
2. `api`: a FastAPI application responsible for district metadata, upstream requests, cache behavior, analysis, and a stable JSON contract.

The browser calls only the FastAPI service for air-quality data. This keeps upstream semantics and analysis rules out of the frontend. Leaflet loads OpenStreetMap raster tiles directly in the browser for normal interactive viewing and retains visible attribution.

The proof of concept uses an in-memory time-to-live cache. A database is intentionally excluded because the product does not claim to provide historical observations. The cache has two windows:

- Fresh TTL: 15 minutes. A fresh entry is returned without an upstream call.
- Stale fallback: 6 hours. If Open-Meteo fails, an older cached entry may be returned with `stale: true` and its original retrieval time.

Cache entries disappear when the API container restarts; that is acceptable for this proof of concept.

## API Contract

### `GET /health`

Returns service status without calling an upstream provider.

### `GET /api/districts`

Returns the maintained list of all 50 Bangkok districts:

- Stable district identifier.
- Thai name.
- English name.
- Latitude and longitude of the representative district-center coordinate.

### `GET /api/pm25/bangkok`

Returns summaries for all 50 districts. The backend batches coordinates into the supported Open-Meteo request format and applies bounded concurrency if batching must be split. The response includes:

- Source and model metadata.
- Model-resolution notice.
- Retrieval and upstream update timestamps.
- `stale` state.
- One summary per district with current concentration, status, color key, and representative coordinate.

### `GET /api/pm25/district/{district_id}`

Returns detailed analysis for one known district:

- District metadata.
- Current concentration, status, and health guidance.
- Twenty-four hourly points.
- Up to five daily mean/maximum points.
- Source, timestamps, model notice, and stale state.

Unknown identifiers return `404`. Invalid upstream payloads return a structured `502` unless a stale cache entry is available. Unexpected server errors use a generic public message and retain diagnostic detail in server logs.

## Frontend Experience

### Desktop

The opening viewport is a focused dashboard rather than a marketing page:

- A compact header with product name, data update time, and refresh control.
- A dominant Bangkok map on the left.
- A district analysis panel on the right.
- A search field and compact scrollable list for locating any of the 50 districts.

Each map marker shows the PM2.5 concentration through its color and a concise numeric label where map density allows. Hover or focus reveals the Thai district name and concentration. Selecting a marker, search result, or list row uses the same selection state, centers the map, and updates the analysis panel.

The default selected district is Pathum Wan. Clustering may be used at low zoom to keep 50 markers legible; expanding a cluster must reveal individual district markers.

The analysis panel contains, in this order:

1. District name and `current PM2.5` value in `µg/m³`.
2. PM2.5 level and short health guidance.
3. Model-resolution notice.
4. Twenty-four-hour line chart.
5. Five-day mean/maximum outlook.
6. Source attribution and timestamps.

A visible map legend maps marker colors to the six PM2.5 levels.

### Mobile

The header remains compact. The map appears first at a stable, useful height, followed by search and the selected-district analysis. Controls must remain reachable without horizontal scrolling, and selecting a district must not reset the user's page position unexpectedly.

### Accessibility

- Every map action has an equivalent searchable/list interaction.
- Color is never the only status signal; level text and numeric concentration accompany it.
- Interactive controls support keyboard focus and meaningful accessible names.
- Charts include textual summaries and readable labels.
- Motion respects `prefers-reduced-motion`.

## Loading, Empty, and Error States

- Initial load: retain the map frame and show lightweight skeletons for values and charts.
- User refresh: retain existing data while indicating refresh progress.
- Stale fallback: retain the full experience, display a prominent “data may be delayed” notice, and show the retrieval timestamp.
- No cached data and upstream failure: keep the map and district navigation usable, replace numeric analysis with a retryable error state, and avoid fabricated values.
- Missing value for one district: show “unavailable” for that district without failing the remaining 49 districts.
- Map tile failure: keep district search and analysis usable and show a small map-specific error.

## Deployment and Local Development

The repository provides:

- A root `environment.yml` defining the Python version and API dependencies for `conda env create -f environment.yml`.
- Separate `web` and `api` directories.
- A production-oriented Dockerfile for each service.
- A root `docker-compose.yml` that builds both services, exposes the web and API ports, configures the browser-visible API base URL, and adds health checks.
- A `.env.example` for deploy-time origins, ports, cache values, and upstream URL overrides.

The API allows only configured frontend origins. Container processes run as non-root users where the framework permits. No API key is required for the selected upstream data source.

## Testing and Verification

### Backend

- Unit tests for status boundaries, daily aggregation, null handling, and timestamp selection.
- Contract tests for all endpoints.
- Mocked upstream tests for batching, fresh cache, stale fallback, malformed payloads, partial district data, and timeouts.
- A test asserting that the district catalog contains exactly 50 unique identifiers and valid coordinates.

### Frontend

- Component tests for formatting, status display, district search, selection synchronization, stale/error notices, and accessible labels.
- A browser test that loads all 50 districts, selects a marker/list entry, and confirms the numeric value and charts update.
- Responsive verification at desktop and mobile widths.

### Deployment

- Next.js production build and lint/type checks.
- Python formatting/static checks and test suite.
- Docker Compose build and health-check verification.
- Manual browser verification of map loading, visible attribution, district selection, refresh behavior, stale/error presentation, and no horizontal overflow.

## Proof-of-Concept Success Criteria

The concept is proven when a user can open the deployed site, see all 50 Bangkok districts represented on an interactive map, find and select a district, read its current modeled PM2.5 concentration in `µg/m³`, understand the associated level and model limitation, inspect its 24-hour and five-day trends, and recover gracefully from upstream-data failure. The same workflow must function on desktop and mobile through Docker Compose without requiring a third-party API key.

## Sources

- Open-Meteo Air Quality API: https://open-meteo.com/en/docs/air-quality-api
- OpenStreetMap Tile Usage Policy: https://operations.osmfoundation.org/policies/tiles/
- WHO Global Air Quality Guidelines (context for health communication): https://www.who.int/westernpacific/publications/i/item/9789240034228
