# Producer-Producer Frontend

Static frontend repo for `producer-producer.com`.

## Current State (as of April 2026)

This repo has two active surfaces and two archived ones:

1. `index.html` (`/`): curated job listings (promoted from `list.html`). **Main experience.**
2. `admin.html` (`/admin.html`): unified admin dashboard (monitoring, stats, GitHub, uptime). Requires admin JWT.

Archived (functional but no longer primary):

3. `archive/desktop/index.html` (`/archive/desktop/`): legacy retro desktop UI (windowed interface).
4. `archive/v2/index.html` (`/archive/v2/`): mobile-first swipe app ("Tinder for jobs").

**Deleted:** `stats.html`, `js/stats.js`, `css/stats.css` — all content absorbed into `admin.html`.

## Architecture

- Frontend stack: vanilla HTML/CSS/JS, no framework, no bundler, no build step.
- Backend dependency: `producer-producer-api` (separate repo).
- Auth model: magic link + JWT in `localStorage`.
- Deployment: GitHub Pages (`CNAME` present).

## High-Level Layout

```text
producer-producer/
├── index.html                # Curated job listings (main experience)
├── admin.html                # Admin dashboard (auth-gated)
├── auth/
│   └── verify/
│       └── index.html        # Magic link landing page (shared)
├── css/
│   ├── list.css              # Main listing styles (editorial tokens)
│   └── admin.css             # Admin dashboard styles (same editorial tokens)
├── js/                       # Shared utilities
│   ├── api.js                # Shared API client (includes admin helpers)
│   ├── auth.js               # Shared auth module
│   ├── list.js               # Main listing logic
│   └── admin.js              # Admin dashboard logic
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
  - `js/list.js` (listings fetch, filter, render; also calls `/stats` for 4 public counters)
  - `js/api.js`, `js/auth.js`
  - `css/list.css`
- Features: unified responsive editorial cards, score filter slider, category/status chips, newsletter signup, OTP verification, static hiring-company line, summary stats (Listings Parsed, Companies, Parsed today, Parsed (7d)).

### 2) Admin Dashboard (`/admin.html`) — Auth-gated

- Entry: `admin.html`
- Modules: `js/admin.js` + `js/api.js` + `css/admin.css`.
- Auth gate: shows email form for magic-link login; dashboard hidden until JWT present.
- Sections:
  - Hero status grid (6 tiles: Frontend, API, Fly Direct, Workflows, Crons [placeholder], Issues)
  - Uptime & Health (live HTTP checks + BetterStack monitors)
  - GitHub Workflows (badges + failed-runs table)
  - Crons — grayed placeholder (Healthchecks.io, deferred — AI-211)
  - App-Domain Health (new opportunities 24h, pending reviews, AI disagreements, maintenance health/runs)
  - Issues & PRs (open issues table)
  - Absorbed public stats (Overview, Freshness, Pipeline, Growth, Scores, Companies, Sources, Admin Stats)
- Pulls from:
  - `/stats`, `/stats/growth`, `/stats/admin`
  - `/admin/status` (fan-out: HTTP health + GitHub summary + BetterStack)
  - `/admin/github/workflows`, `/admin/github/runs/failed`, `/admin/github/issues`
  - `/admin/uptime/betterstack`
  - `/health`
- 60s auto-refresh with pause/resume.

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

1. `js/api.js` (root) — used by main listing page and admin dashboard.
2. `archive/v2/js/api.js` — used only by the archived swipe app.

Keep endpoint and auth behavior aligned across both clients when backend contracts change.

Notable current behavior:

- `js/api.js` supports multi-host failover and diagnostics, plus admin endpoint helpers.
- `?api=local` can force local API hosts during frontend dev.
- Current production default targets `https://producer-producer-api.fly.dev` (with `api.producer-producer.com` fallback).

## Development Workflow

### Run frontend locally

```bash
python3 -m http.server 8080
```

Then open:

- `http://localhost:8080/` — curated listings (main)
- `http://localhost:8080/admin.html` — admin dashboard
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
  - `index.html` (if touching `js/api.js` or `js/list.js`)
  - `admin.html` (if touching `js/api.js` or `js/admin.js` or `css/admin.css`)
  - `archive/desktop/index.html` (if touching shared `js/api.js` or `js/auth.js`)
  - `archive/v2/index.html` (if touching archive/v2 assets)

See `DEPLOYMENT.md` for current deployment checklist details.

## Maintenance Guardrails

- **Duplicated modules are the #1 bug source.** `js/` and `archive/v2/js/` have parallel copies of `api.js` and `auth.js`. A fix to the shared `js/api.js` or `js/auth.js` may need mirroring in `archive/v2/js/` if the archived swipe app is still in use. Always check both.
- When shipping JS changes, bump the `?v=` cache-bust param in the affected HTML entry points or browsers will serve stale code.
- Keep auth state flows event-compatible (`pp:auth-changed`) across modules.
- Preserve the no-build-step constraint unless explicitly planning a tooling migration.
- `AGENTS.md` is canonical; `CLAUDE.md` is a symlink — edit only `AGENTS.md`.
