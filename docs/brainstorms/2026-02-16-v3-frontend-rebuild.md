---
title: v3 Frontend Rebuild — Vision & Brainstorm
date: 2026-02-16
category: brainstorms
status: draft
component: producer-producer (frontend)
tags:
  - v3
  - frontend
  - rebuild
  - SvelteKit
  - architecture
  - migration
---

# v3 Frontend Rebuild

## Context

The current frontend has two active surfaces (v1 desktop + v2 mobile-first) built in vanilla JS with no build step. Both share a FastAPI backend via nearly identical but separately maintained API clients. After evaluating React, Vue, Preact, Alpine, htmx, and SvelteKit, the working recommendation is **SvelteKit with adapter-static**, deployed to GitHub Pages.

### Why rebuild instead of migrate

- v1 and v2 diverged in UI paradigm (desktop window manager vs. mobile card stack) but duplicate core logic (auth, API, swipe, opportunities, settings).
- No build system means no tree-shaking, no component scoping, no type checking. State lives in `window.*` globals and `localStorage`, coordinated by CustomEvents.
- The OTP modal postmortem (2026-02-16) showed that vanilla JS state management in modals is already a source of XSS, timer leaks, and accessibility bugs.
- There are no active users yet, so the cost of a clean break is near zero.

---

## What worked (keep in v3)

- **OTP + magic link auth flow** — users like passwordless; backend already supports it.
- **Swipe/card interaction** for browsing opportunities — the core UX concept is sound.
- **Saved jobs list with drag-to-reorder** — designed and specced (see `docs/plans/2026-02-03-saved-jobs-reorder-design.md`).
- **Add Job form** (v2) — manual job submission via URL/title/company.
- **Public feed (no auth required)** — unauthenticated users can browse scored opportunities.
- **Settings: digest threshold, keyword include/exclude, location filters, digest toggle.**
- **Retro aesthetic / personality** — v1's desktop OS vibe is distinctive; worth preserving some of that character even in a modern stack.

## What didn't work (drop or rethink)

- **Two separate API clients** — v1's has multi-host failover + diagnostics, v2's is simpler. Need one shared client.
- **Duplicated module structure** — swipe.js, auth.js, settings.js, opportunities.js, applications.js all exist in both js/ and v2/js/ with diverging implementations.
- **Manual cache-busting** (`?v=20260212a`) — a build step eliminates this entirely.
- **Embedded base64 audio** in index.html — bloats the HTML; should be separate assets or removed.
- **Window manager complexity (v1)** — the desktop metaphor is charming but the implementation is brittle and inaccessible. If we keep the aesthetic, implement it properly with a component.
- **Decorative-only elements** (space invader canvas, media player, search window) — fun but added maintenance weight. Decide deliberately which to keep.
- **Companies window (v1)** — unclear if this feature was ever completed. Evaluate whether company-level filtering belongs in v3.
- **Stats page** — exists at root level (`stats.html` + `js/stats.js`). Decide if it moves into v3 or stays standalone.
- **Newsletter subscribe form (v1)** — Buttondown embed baked into the hero window. Needs a deliberate home in v3.
- **`is-hidden` + `hidden` attribute soup** — visibility toggling via CSS classes and HTML attributes simultaneously. Components with proper mounting/unmounting fix this.

---

## v3 Feature inventory

### Core (build first)

1. **Auth** — email → OTP code OR magic link → JWT token → localStorage. Single implementation.
2. **Opportunity feed (public)** — `GET /opportunities/feed` — card-based browsing, no login required.
3. **Swipe interaction** — right-save / left-skip on opportunity cards, with pointer + touch support.
4. **Saved jobs list** — `GET /users/me/opportunities` — filterable (all / to-do / applied), reorderable.

### Secondary (build after core works)

5. **Settings** — digest toggle, threshold, location filters, keyword include/exclude.
6. **Add Job** — manual job submission form.
7. **Opportunity detail** — expand a card to see full description, score breakdown, company info.
8. **Personalized feed** — `GET /opportunities/for-me` — authenticated, scored per user config.

### Future / TBD

9. **Stats/analytics dashboard** — usage metrics, score distributions. May stay separate.
10. **Newsletter integration** — Buttondown or similar. Landing page concern, not necessarily in-app.
11. **Company-level filtering/browsing** — `company_id` param exists on feed endpoint. Design the UX.
12. **Notifications / real-time updates** — not currently supported by backend. Someday.

---

## API contract surface

All endpoints consumed by the frontend (from both v1 and v2 API clients):

### Auth
- `POST /auth/magic-link` — request login email
- `GET /auth/verify?token=` — verify magic link
- `POST /auth/verify-code` — verify OTP `{email, code}`
- `GET /auth/me` — current user info

### Users
- `GET /users/me` — profile
- `PUT /users/me` — update profile
- `GET /users/me/config` — user config (digest, filters)
- `PUT /users/me/config` — update config

### Opportunities
- `GET /opportunities/feed` — public ranked feed (`min_score`, `limit`, `offset`, `company_id`)
- `GET /opportunities/for-me` — personalized feed (`status`, `min_score`, `limit`, `offset`)
- `GET /opportunities/{id}` — single opportunity
- `POST /opportunities/{id}/evaluate` — trigger evaluation
- `POST /opportunities` — create user-submitted opportunity

### User Opportunities
- `GET /users/me/opportunities` — saved list (`status_filter`, `limit`, `offset`)
- `PUT /users/me/opportunities/{id}` — update status (`status`, `score`, `ignore_reason`)
- `PUT /users/me/opportunities/reorder` — bulk reorder (`[{opportunity_id, display_order}]`)

### System
- `GET /health` — health check

---

## Tech stack decision

| Choice | Reasoning |
|---|---|
| **SvelteKit** | Closest to vanilla HTML/CSS/JS mental model. Compiler output is lean. File-based routing replaces manual view switching. |
| **adapter-static** | Compiles to static files for GitHub Pages. No server needed. |
| **TypeScript** | Optional but recommended. Add gradually — Svelte supports mixed JS/TS. |
| **Single repo** | Keep in `producer-producer/`. Archive v1 + v2 to `legacy/`. |

### What this replaces

| Current pattern | SvelteKit equivalent |
|---|---|
| `window.api` global singleton | Shared module import (`$lib/api.ts`) |
| `localStorage` + CustomEvents | Svelte stores (`$state`, writable stores) |
| `is-hidden` / `hidden` toggling | Component mounting / `{#if}` blocks |
| Manual cache-busting `?v=` | Vite content hashing |
| IIFE modules via `<script>` tags | ES module imports |
| Duplicated js/ and v2/js/ | Single component tree |

---

## Open questions

> Fill these in as decisions are made.

- [ ] **Keep the retro desktop aesthetic?** v1's OS-window look is distinctive. Options: (a) full retro theme in v3, (b) modern clean with retro accents, (c) entirely new design direction.
- [ ] **Mobile-first or desktop-first?** v2 went mobile-first. v1 was desktop. What's the primary target?
- [ ] **Stats page scope?** Is this an admin tool, a public dashboard, or a user-facing feature?
- [ ] **Sound effects?** v1 had pop/swoosh/bloop/fanfare. Keep the playfulness or drop it?
- [ ] **Newsletter placement?** Landing page hero? In-app prompt? Separate page?
- [ ] **Domain/routing structure?** Single SPA at root? Separate marketing landing page?
- [ ] **Testing strategy?** Playwright e2e? Vitest unit? What's the minimum viable test setup?

---

## Migration sequence

### Phase 0 — Archive (do first)
- Move `js/`, `v2/`, `css/`, `index.html`, `stats.html` into `legacy/`.
- Keep `docs/`, `tests/`, config files at root.
- Confirm backend API still works independently.

### Phase 1 — Scaffold
- `npm create svelte@latest` in `producer-producer/`.
- Configure `adapter-static`, set up GitHub Pages deploy workflow.
- Create `$lib/api.ts` — single API client ported from v2's cleaner version, enhanced with v1's failover logic.
- Verify deploy: hello world on GitHub Pages.

### Phase 2 — Auth + Feed
- Login flow (OTP + magic link) as a proper component.
- Public opportunity feed with card rendering.
- Auth store with reactive state.

### Phase 3 — Swipe + Save
- Port swipe interaction to a Svelte component.
- Saved jobs list with filters and drag-to-reorder.

### Phase 4 — Settings + Add Job
- Settings form bound to user config API.
- Add Job form.

### Phase 5 — Polish
- Decide on visual direction (retro vs. modern vs. hybrid).
- Sound effects (if keeping).
- Accessibility audit.
- Testing setup.

---

## Reference

- Saved jobs reorder design: `docs/plans/2026-02-03-saved-jobs-reorder-design.md`
- OTP modal postmortem: `docs/solutions/logic-errors/otp-modal-state-management-issues.md`
- Backend repo: `producer-producer-api/` (FastAPI, unchanged by this migration)
