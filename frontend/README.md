# Border AI Command Center - Frontend

React + TypeScript + Tailwind dashboard for SIH26187 (AI-based intelligent
video analytics for border surveillance). Replaces the earlier no-build-step
vanilla dashboard with a full command-center UI: multi-camera surveillance,
severity-prioritized alerting, incident investigation, track intelligence,
analytics, camera health, and an audit trail. See `docs/architecture.md` in
the repo root for how this fits the backend pipeline.

## Run

```bash
npm install
npm run dev        # http://localhost:5173, proxies API/WS calls to the backend on :8000
```

Start the backend separately (`uvicorn backend.main:app --port 8000` from the
repo root) for live data; without it, every page falls back to clearly
labeled demo data (see "Demo mode" below) - the UI is fully explorable
either way.

```bash
npm run build       # type-checks (tsc -b) then builds to dist/
npm run lint         # oxlint
```

In production, `backend/main.py` serves `frontend/dist` directly (build the
frontend first) - no separate frontend server needed.

## Demo mode & honesty about data sources

The backend does not (yet) implement everything this UI has a screen for:
there is no ANPR/plate-reading module, no live per-camera FPS/telemetry
endpoint, no operator/auth system, and tracks aren't queryable once they
scroll off-screen (only the risk-crossing incidents they produced are
persisted). Rather than fabricate that data and call it real, every
non-trivial value on screen carries a `DataSource` tag - `CONNECTED` (a real
backend response), `DEMO DATA` (a realistic stand-in), `PLANNED`, or `NOT
CONNECTED` - visible as a small badge near the data it describes. `src/api/`
is the one place that decides `live` vs `demo` per resource; `src/mocks/`
holds the demo datasets. See the comment at the top of each `src/api/*.ts`
file for exactly what is and isn't real for that resource.

## Structure

```
src/
├── api/          # one module per resource; live-fetch with an honest demo fallback (src/api/client.ts)
├── mocks/        # realistic demo datasets, always clearly the fallback, never silently blended with live data
├── store/        # SurveillanceProvider - the single real-time source of truth (WS in live mode, a ticker in demo mode)
├── types/        # shared contracts; domain.ts mirrors backend/schemas.py field-for-field
├── components/
│   ├── ui/       # design system primitives (Badge, Card, RiskScore, Timeline, Table, Modal, ...)
│   ├── dashboard/, camera/, incidents/, evidence/, layout/
├── pages/        # one file per route in src/routes.ts
├── lib/          # severity bands, formatting, the incident-timeline reconstruction, cn()
└── routes.ts     # single source of truth for page paths - see the comment there for why
```

### Why `routes.ts` exists

`/cameras` and `/incidents` are also real backend REST paths
(`GET /cameras`, `GET /incidents`). Because the SPA and the API share an
origin, a frontend page route with the exact same path would make a full
page load (or a browser refresh) of that screen return raw API JSON instead
of the app - FastAPI resolves its explicit routes before falling through to
the SPA's `index.html`. The frontend pages are therefore `/camera-feeds` and
`/incident-log` (`ROUTES.cameraFeeds` / `ROUTES.incidentLog`), and every
in-app link goes through `src/routes.ts` so this can't regress silently.
