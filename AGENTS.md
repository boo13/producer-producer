# Producer-Producer Frontend

Static frontend repo for `producer-producer.com`.

## Current State (as of February 2026)

This repo now has three active surfaces:

1. `index.html` (`/`): legacy retro desktop UI (windowed interface).
2. `v2/index.html` (`/v2/`): mobile-first swipe app ("Tinder for jobs").
3. `stats.html` (`/stats.html`): ops dashboard for public and admin stats.

The previous AGENTS content only described the legacy desktop app and is no longer sufficient.

## Architecture

- Frontend stack: vanilla HTML/CSS/JS, no framework, no bundler, no build step.
- Backend dependency: `producer-producer-api` (separate repo).
- Auth model: magic link + JWT in `localStorage`.
- Deployment: GitHub Pages (`CNAME` present).

## High-Level Layout

```text
producer-producer/
├── index.html                # Legacy retro desktop experience
├── stats.html                # Stats dashboard page
├── v2/
│   ├── index.html            # Swipe app entry point
│   ├── css/styles.css
│   └── js/*.js
├── css/
│   ├── styles.css            # Legacy desktop styles
│   └── stats.css             # Stats dashboard styles
├── js/                       # Legacy desktop + shared utilities
├── tests/
│   ├── playwright-smoke.spec.ts
│   └── agent-smoke.sh
├── docs/plans/               # Design/implementation plans
├── DEPLOYMENT.md
└── README.md
```

## Surface Details

### 1) Legacy Desktop (`/`)

- Entry: `index.html`
- Main modules:
  - `js/subscribe-form.js` (newsletter form, desktop window manager, drag/minimize/maximize behavior)
  - `js/opportunities.js`
  - `js/applications.js`
  - `js/companies.js`
  - `js/auth.js`
  - `js/settings.js`
  - `js/api.js`
- UI model:
  - Decorative + functional windows with tiered z-index.
  - Custom events like `pp:auth-changed` and `desktopWindow:opened`.

### 2) Swipe App (`/v2/`)

- Entry: `v2/index.html`
- Main modules:
  - `v2/js/opportunities.js` (swipe feed + undo)
  - `v2/js/swipe.js` (gesture manager)
  - `v2/js/applications.js` (saved list + drag reorder)
  - `v2/js/add-job.js` (user-submitted opportunities)
  - `v2/js/login.js`, `v2/js/auth.js`, `v2/js/settings.js`
  - `v2/js/api.js`
- Key behavior:
  - Mobile-first card UI.
  - Saved jobs reorder persisted via `/users/me/opportunities/reorder`.

### 3) Stats Dashboard (`/stats.html`)

- Entry: `stats.html`
- Modules: `js/stats.js` + `js/api.js` + `css/stats.css`.
- Pulls from:
  - `/stats` (public aggregates)
  - `/stats/growth` (time-series growth)
  - `/stats/admin` (admin-only operational metrics)
  - `/health` (connectivity/latency)

## API Client Reality

There are two frontend API clients:

1. `js/api.js` for legacy desktop and stats pages.
2. `v2/js/api.js` for the v2 app.

Keep endpoint and auth behavior aligned across both clients when backend contracts change.

Notable current behavior:

- `js/api.js` supports multi-host failover and diagnostics.
- `?api=local` can force local API hosts during frontend dev.
- Current production default targets `https://producer-producer-api.fly.dev` (with `api.producer-producer.com` fallback in legacy client pathing/comments).

## Development Workflow

### Run frontend locally

```bash
python3 -m http.server 8080
```

Then open:

- `http://localhost:8080/`
- `http://localhost:8080/v2/`
- `http://localhost:8080/stats.html`

### Use local backend

- Run API in `producer-producer-api` separately (typically on `http://localhost:8000`).
- Use `?api=local` in frontend URL when needed.
  - Example: `http://localhost:8080/v2/?api=local`

## Testing

Playwright is installed in `devDependencies`.

- Smoke test file: `tests/playwright-smoke.spec.ts`
- Agent smoke helper: `tests/agent-smoke.sh`

No robust CI test matrix is defined in this repo yet; tests are primarily smoke/manual workflows.

## Deployment and Cache Busting

- Hosting target: GitHub Pages.
- CSS/JS cache busting is manual via query-string versions in HTML files.
- When shipping frontend changes, bump version params in all affected entry points:
  - `index.html`
  - `v2/index.html`
  - `stats.html`

See `DEPLOYMENT.md` for current deployment checklist details.

## Maintenance Guardrails

- Do not assume only one app surface exists; changes may need parity across `/`, `/v2/`, and `/stats.html`.
- Keep auth state flows event-compatible (`pp:auth-changed`) across modules.
- If changing API contracts, update both API client files and all dependent modules.
- Preserve the no-build-step constraint unless explicitly planning a tooling migration.
