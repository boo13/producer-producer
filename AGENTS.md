# Producer-Producer Frontend

Static frontend repo for `producer-producer.com`.

## Current State (as of April 2026)

This repo has two active surfaces and two archived ones:

1. `index.html` (`/`): curated job listings (promoted from `list.html`). **Main experience.**
2. `stats.html` (`/stats.html`): ops dashboard for public and admin stats.

Archived (functional but no longer primary):

3. `archive/desktop/index.html` (`/archive/desktop/`): legacy retro desktop UI (windowed interface).
4. `archive/v2/index.html` (`/archive/v2/`): mobile-first swipe app ("Tinder for jobs").

## Architecture

- Frontend stack: vanilla HTML/CSS/JS, no framework, no bundler, no build step.
- Backend dependency: `producer-producer-api` (separate repo).
- Auth model: magic link + JWT in `localStorage`.
- Deployment: GitHub Pages (`CNAME` present).

## High-Level Layout

```text
producer-producer/
├── index.html                # Curated job listings (main experience)
├── stats.html                # Stats dashboard page
├── auth/
│   └── verify/
│       └── index.html        # Magic link landing page (shared)
├── css/
│   ├── list.css              # Main listing styles
│   └── stats.css             # Stats dashboard styles
├── js/                       # Shared utilities
│   ├── api.js                # Shared API client
│   ├── auth.js               # Shared auth module
│   ├── list.js               # Main listing logic
│   └── stats.js              # Stats dashboard logic
├── archive/
│   ├── desktop/              # Legacy retro desktop UI + all its assets
│   │   ├── index.html
│   │   ├── css/styles.css
│   │   ├── js/*.js
│   │   └── images/
│   └── v2/                   # Legacy swipe app + all its assets
│       ├── index.html
│       ├── css/styles.css
│       └── js/*.js
├── tests/
│   └── swipe-persistence.spec.ts
├── docs/plans/               # Design/implementation plans
├── DEPLOYMENT.md
└── README.md
```

## Surface Details

### 1) Curated Listings (`/`) — Primary

- Entry: `index.html`
- Main modules:
  - `js/list.js` (listings fetch, filter, render)
  - `js/api.js`, `js/auth.js`
  - `css/list.css`
- Features: score filter slider, category chips, status chips (saved/applied), newsletter signup, OTP verification, company marquee, summary stats.

### 2) Stats Dashboard (`/stats.html`)

- Entry: `stats.html`
- Modules: `js/stats.js` + `js/api.js` + `css/stats.css`.
- Pulls from:
  - `/stats` (public aggregates)
  - `/stats/growth` (time-series growth)
  - `/stats/admin` (admin-only operational metrics)
  - `/health` (connectivity/latency)

### 3) Legacy Desktop (`/archive/desktop/`) — Archived

- Entry: `archive/desktop/index.html`
- All desktop-specific assets live under `archive/desktop/` (css/, js/, images/).
- Shared files (`js/api.js`, `js/auth.js`) are still at root — referenced via `../../js/`.

### 4) Swipe App (`/archive/v2/`) — Archived

- Entry: `archive/v2/index.html`
- Fully self-contained: own `archive/v2/css/` and `archive/v2/js/`.
- Post-login redirect points to `/archive/v2/`.

## API Client Reality

There are two frontend API clients:

1. `js/api.js` (root) — used by main listing page and stats page.
2. `archive/v2/js/api.js` — used only by the archived swipe app.

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

- `http://localhost:8080/` — curated listings (main)
- `http://localhost:8080/stats.html`
- `http://localhost:8080/archive/desktop/` — legacy desktop
- `http://localhost:8080/archive/v2/` — legacy swipe app

### Use local backend

- Run API in `producer-producer-api` separately (typically on `http://localhost:8000`).
- Use `?api=local` in frontend URL when needed.
  - Example: `http://localhost:8080/?api=local`

## Verification
  - ✅ Use `playwright-cli` terminal commands for browser verification in this repo. (Tell user to install if not available.)
  - ❌ Do not use MCP Playwright tools (`mcp__playwright__*`).
  - ❌ Do not substitute with `npx playwright` / `@playwright/test` commands.

  ### Verification rules

  - **Screenshot timing matters:** Before taking verification screenshots, first determine WHEN the animation actually runs (e.g. query for DOM elements the animation creates, check opacity/
  transform values at multiple timepoints).
    - Animations on this site can be deferred by `fonts.ready`, `requestAnimationFrame`, or `ctx.add()` — they may not start until 1-2s after page load.
    - ⚠️ BEWARE - A screenshot taken outside the animation window is a false positive, not proof the fix works.
  - **Cleanup screenshots:** delete temp screenshots unless user asked to keep them.

## Deployment and Cache Busting

- Hosting target: GitHub Pages.
- CSS/JS cache busting is manual via query-string versions in HTML files.
- When shipping frontend changes, bump version params in all affected entry points:
  - `index.html`
  - `stats.html`
  - `archive/desktop/index.html` (if touching shared `js/api.js` or `js/auth.js`)
  - `archive/v2/index.html` (if touching archive/v2 assets)

See `DEPLOYMENT.md` for current deployment checklist details.

## Maintenance Guardrails

- **Duplicated modules are the #1 bug source.** `js/` and `archive/v2/js/` have parallel copies of `api.js` and `auth.js`. A fix to the shared `js/api.js` or `js/auth.js` may need mirroring in `archive/v2/js/` if the archived swipe app is still in use. Always check both.
- When shipping JS changes, bump the `?v=` cache-bust param in the affected HTML entry points or browsers will serve stale code.
- Keep auth state flows event-compatible (`pp:auth-changed`) across modules.
- Preserve the no-build-step constraint unless explicitly planning a tooling migration.
