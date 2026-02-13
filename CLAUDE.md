# Project Overview
This project is for Producer-Producer.com — the frontend for producer-producer-api, a resource for video producers to find industry-relevant job listings.

This site provides curated job listings specifically for video producers, filtering out unrelated "producer" roles (music producers, manufacturing producers, etc.) using AI and automation.

## Runtime Model

- Static site. No build step or bundler.
- Main app page: `/index.html`
- Magic-link callback page: `/auth/verify/index.html`
- Backend API is external (`producer-producer-api`).

## Non-Obvious Behavior

- `js/api.js` supports multiple API hosts, probes `GET /health`, and selects first reachable host.
- API base URLs can be injected via:
  - `window.__PP_CONFIG__.apiBaseUrls` / `apiBaseUrl`
  - `window.PP_API_BASE_URLS` / `PP_API_BASE_URL`
  - `<meta name="pp-api-base-url" ...>` in HTML
- Fallback defaults:
  - Localhost: `:8080` and `:8000`
  - Production: `https://producer-producer-api.fly.dev`, `https://api.producer-producer.com`
- `401` responses clear auth state (`localStorage`) and dispatch auth UI updates.
- Auth token verification runs on any page load when `?token=` is present (`js/auth.js`), then redirects to `/`.
- Login diagnostics banner is only shown for connectivity-style errors.

## API Surface Used By Frontend

- Auth: `POST /auth/magic-link`, `GET /auth/verify`, `GET /auth/me`
- User: `GET/PUT /users/me/config`, `GET/PUT /users/me/opportunities*`
- Opportunities: `GET /opportunities/for-me`, `GET /opportunities/{id}`, `POST /opportunities/{id}/evaluate`

## UI Mechanics To Preserve

- Window tiers in `js/subscribe-form.js`:
  - Decorative z-range: `1..99`
  - Functional z-range: `100..999`
- Minimize state is class-driven (`is-minimizing`, `is-minimized`) and mirrored via ARIA attributes.

## Editing Constraints

- Script load order in `index.html` matters: `js/api.js` must load before modules that call `window.api`.
- Manual asset cache busting is active. If you change JS/CSS, bump `?v=` in:
  - `/index.html`
  - `/auth/verify/index.html`

## Local Run

```bash
cd /Users/randy/Git/p-p/producer-producer
python3 -m http.server 8080
```

Updated: 2026-02-13
