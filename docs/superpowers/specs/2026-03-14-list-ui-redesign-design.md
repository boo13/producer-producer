# List UI Redesign & AI-Powered Job Highlighting

**Date:** 2026-03-14
**Status:** Approved

## Overview

Replace the current list.html with an advanced, editorial-style job listing page that is the primary surface for Producer-Producer. The core innovation is AI-powered sentence-level highlighting that makes job postings scannable by visually emphasizing key details (experience requirements, salary) and fading boilerplate (legal disclaimers, EEO statements).

The redesign spans three subsystems: scoring improvements (backend), AI sentence classification (backend), and the list UI itself (frontend). Auth and user actions are lightweight additions on top of existing infrastructure.

## Guiding Principles

- Simple, clear, few jobs, all signal, no noise.
- Text-forward, font-focused, editorial aesthetic (Playfair Display, Source Serif 4, IBM Plex Mono on warm parchment).
- Easy to scan — the site does the filtering for you.
- Vanilla HTML/CSS/JS, no framework, no build step.

## Sub-Project 1: Scoring Improvements

### Salary Extraction

Many ATS systems don't provide salary in structured fields, but the information is often in the job description text. Add a two-pass extraction:

1. **Regex patterns first** — match common salary formats ("$120,000 - $150,000", "$120k–$150k", "Salary range: ..."). Fast, no API cost.
2. **AI fallback** — if regex finds nothing, include salary extraction as part of the existing AI analysis call for jobs scoring 70+.

When salary is extracted, populate `salary_min` and `salary_max` on the Opportunity record. This feeds the existing compensation dimension score, which currently defaults to 0/unknown when salary data is missing.

### AI Analysis Threshold

Jobs scoring 70+ on the rule-based score get sent through AI analysis. Jobs below 70 don't appear in the UI, so no need to spend tokens on them. This replaces the current threshold (default 50). Existing AI analyses for jobs scoring 50-69 are left as-is — no cleanup needed, they simply won't be displayed.

### What Doesn't Change

The 4-tier filter engine (required/conditional/preferred/optional) and 5-dimension weighted scoring (role_fit, company_prestige, growth_potential, compensation, work_life) stay as-is. The improvement is better input data, not a new algorithm.

## Sub-Project 2: AI Sentence Classification Pipeline

### Purpose

Classify each sentence in a job posting into one of four visual tiers so the frontend can render them with appropriate emphasis.

### Tiers

| Tier | What It Captures | Visual Treatment |
|------|-----------------|------------------|
| `highlight` | Experience requirements, salary/compensation, must-have qualifications, key role details | Yellow marker background with subtle bottom border, bold weight |
| `normal` | Role description, team structure, day-to-day responsibilities, reporting lines | Full body color, standard weight |
| `faded` | Generic company description, benefits boilerplate, perks lists | Muted gray color |
| `very_faded` | Legal disclaimers, EEO statements, compliance language | Very light gray, smaller font size |

### Pipeline

1. **Sentence splitting** — Split `description_cleaned` on sentence boundaries before sending to AI. This keeps the output structured and predictable.
2. **AI classification** — Send the sentence array to OpenAI with tier definitions. The model returns a JSON array of `{ "text": "...", "tier": "highlight|normal|faded|very_faded" }` objects.
3. **Storage** — New `sentence_classifications` JSON column on the `AIAnalysis` table (which has a 1:1 relationship with Opportunity).
4. **Timing** — Runs as part of the existing `AIAnalysisService` flow, triggered after the rule-based score is calculated. One additional OpenAI call per qualifying job.

### API Response

Sentence classifications are included in the opportunity feed response. When the frontend fetches opportunities via `GET /opportunities/for-me` (signed in) or `GET /opportunities/feed` (signed out), each opportunity object includes a `sentence_classifications` field — the JSON array of `{ "text", "tier" }` objects. When no classification exists, this field is `null` and the frontend falls back to rendering the raw description at `normal` tier.

This avoids a separate API call per job expansion — the data is already loaded when the user clicks to expand.

### Fallback

If `description_cleaned` is null, skip sentence classification entirely (use `description` raw text rendered at `normal` tier). If AI classification fails, store `null` for `sentence_classifications` — the frontend renders the full description at `normal` tier. Graceful degradation in both cases.

## Sub-Project 3: List UI Redesign

### Page Structure

The page flows from an editorial landing into the job feed:

1. **Sticky header** — Site wordmark (left), sign-in button (right). When signed in, shows greeting + sign-out.
2. **Intro section** — Big Playfair Display headline, italic tagline, short body copy. Generous whitespace. Newsletter/sign-in email form (unified — entering email triggers magic link/OTP flow, signs in AND subscribes).
3. **Summary stats** — Listings count, companies count, new today. Typographic, IBM Plex Mono numerals.
4. **Featured companies carousel** — Text-based company names, horizontally scrolling.
5. **Filter bar** — Min score slider (default 75), category chips (All, News, Podcast, Video, Social), status toggle (All Jobs, Saved, Applied — latter two only visible when signed in).
6. **Job list** — Sorted by score descending.

### Collapsed Job Row

Each row displays:
- **Score badge** (amber background, left column) — the rule-based score number
- **Job title** (Playfair Display, bold)
- **Company name** (IBM Plex Mono, uppercase, smaller)
- **"New" pill** for jobs posted within 48 hours
- **Salary range** when available (omitted entirely when not — no "N/A")
- **Location + relative posted date** ("NYC · 2d ago")
- **Expand chevron**

### Expanded Job Row

Clicking a row expands it inline. The expanded area shows:
- **Metadata line** — Posted date, company, employment type
- **Action buttons** (only when signed in):
  - **Save** — primary style (red border), adds to `UserOpportunity` with status `todo`
  - **Applied** — default style, sets status `applied`
  - **Ignore** — muted style, sets status `ignored`, row disappears with undo toast
  - **View original ↗** — link to the original job posting URL, right-aligned
- **Job description** — Rendered with sentence-level highlight/fade tiers from AI classification. Falls back to all-normal if classification isn't available.

### Undo Toast

When a user ignores a job:
1. Row animates out of the list.
2. A toast appears at the bottom of the viewport: "[Job title] ignored. Undo"
3. Toast auto-dismisses after 5 seconds.
4. Clicking "Undo" restores the job to the list and removes the `ignored` status.
5. If the user ignores another job while a toast is visible, the previous toast is replaced by the new one (no stacking).

### Status Filter Toggle

In the filter bar, alongside category chips:
- **All Jobs** — shows all jobs above the score threshold (minus ignored)
- **Saved** — filters to `UserOpportunity` status `todo` only
- **Applied** — filters to `UserOpportunity` status `applied` only

"Saved" and "Applied" options only appear when the user is signed in.

### Responsive Behavior

The existing list.html responsive breakpoints (860px, 600px) carry forward. On mobile:
- Intro section goes full-width
- Score badge column narrows
- Detail padding adjusts
- The experience is the same — no separate mobile UI

## Sub-Project 4: Authentication & User Actions

### What Already Exists

- Magic link + OTP passwordless auth flow
- `User` table with email, name, is_admin
- `UserOpportunity` table with status (todo/applied/ignored/expired)
- JWT in localStorage, `pp:auth-changed` custom events
- Email digest system

### What Changes

- **Unified sign-in/subscribe**: The intro section email form triggers the existing magic link/OTP flow. On verification, the user is signed in AND subscribed to the digest. One flow, one input.
- **Signed-in state in header**: "Sign in →" button is replaced with the user's email and a sign-out link.
- **Signed-in state in intro**: Email form is replaced with "Signed in as you@email.com" with sign-out link.
- **Action buttons conditionally rendered**: Save/Applied/Ignore buttons only appear on expanded job rows when the user is signed in. When signed out, expanding a job shows the description and "View original" link only.
- **Status filter conditionally rendered**: "Saved" and "Applied" filter options only appear when signed in.

### Header Changes

The current `list.html` header contains only the site wordmark. Add a `header-controls` div on the right side for the sign-in button (signed out) or email + sign-out link (signed in). This mirrors the pattern already used in v2's header.

### API Surface

Existing endpoints:
- `POST /auth/magic-link` — send magic link
- `POST /auth/verify-code` — verify OTP
- `GET /auth/verify?token=xxx` — verify magic link
- `PUT /users/me/opportunities/{opportunity_id}` — update job status (body includes `status` field)
- `GET /opportunities/for-me` — list opportunities for signed-in user (supports `status_filter` query parameter for saved/applied filtering)
- `GET /opportunities/feed` — list opportunities for signed-out users

The frontend uses `GET /opportunities/for-me` when signed in (which supports the Saved/Applied status filter toggle) and `GET /opportunities/feed` when signed out.

## Out of Scope (MVP)

- Settings page (digest threshold, location prefs, keywords)
- Drag-to-reorder saved jobs
- Social login
- Profile/account page
- AI-primary scoring (staying with rule-based + AI on top)
- User-configurable sort order
- Mobile swipe UI (responsive list, no gestures)
- Admin features in the list UI
- Updates to legacy desktop (`/`) or v2 swipe (`/v2/`) UIs — they continue to exist but this list becomes the primary surface

## Implementation Order

1. **Scoring improvements** (backend) — salary extraction, threshold change to 70
2. **AI sentence classification** (backend) — new pipeline, storage, API response changes
3. **List UI redesign** (frontend) — new list.html with all features

These are sequential: 1 feeds 2 (better data for AI to analyze), 2 feeds 3 (frontend needs classification data to render).
