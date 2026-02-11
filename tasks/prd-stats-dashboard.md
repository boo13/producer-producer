# PRD: Stats Dashboard Page

## Introduction

A standalone `stats.html` page in the frontend repo that provides the project creator with a comprehensive, auto-refreshing dashboard of database health and activity. The page calls multiple existing (and a few new) API endpoints to show listing counts, parsing activity, scoring distributions, maintenance run history, and pipeline health — everything needed to confirm the system is active, updating, and behaving correctly.

Public stats (listing counts, score distributions) are visible without login. Sensitive operational details (maintenance runs, filter rejection funnel, AI disagreements) require admin authentication.

## Goals

- Give the creator an at-a-glance view of database health and pipeline activity
- Surface anomalies quickly: stale data, failed maintenance runs, scoring drift
- Require no backend deployment for the initial release (leverage existing endpoints where possible)
- Auto-refresh every 60 seconds so the page can stay open as a live monitor
- Work on desktop and mobile with a clean, information-dense layout

## User Stories

### US-001: Create `/stats` aggregate API endpoint
**Description:** As the dashboard page, I need a single public endpoint that returns all the non-sensitive aggregate stats in one call so I can render the public section with one fetch.

**Acceptance Criteria:**
- [ ] `GET /stats` returns JSON with: `total_opportunities`, `active_opportunities`, `opportunities_added_24h` (WHERE `first_seen >= NOW() - 24h`), `opportunities_added_7d` (WHERE `first_seen >= NOW() - 7d`), `filter_status_counts` (pass/fail/pending), `top_companies_by_listings` (top 10 by count of active opportunities), `score_distribution` (histogram with `[0,10), [10,20), ..., [90,100]` half-open buckets; final bucket includes 100), `avg_score`, `median_score`, `remote_percentage`, `has_salary_percentage`, `sources_breakdown` (GROUP BY on `opportunities.source` column), `oldest_active_posted_date`, `newest_posted_date`, `total_companies`, `active_companies`
- [ ] Endpoint requires no authentication
- [ ] Response time under 2 seconds on production data; if not achievable, split into `/stats` (counts) and `/stats/scores` (histogram + score aggregates) as a fallback
- [ ] Existing indexes on `opportunities.is_active`, `opportunities.filter_status`, `opportunities.posted_date`, and `opportunities.company_id` are sufficient for these queries — no new indexes required
- [ ] Empty-state: when a field has no data, return `0` for counts, `null` for dates, `0.0` for percentages, empty list `[]` for arrays
- [ ] Typecheck passes
- [ ] Unit tests verify correct counts with mock data (at least: empty DB, single row, multiple rows)
- [ ] Integration test verifies response schema shape

### US-002: Create `/stats/admin` endpoint for sensitive stats
**Description:** As an admin, I need operational stats that reveal pipeline health (maintenance runs, user activity, AI analysis coverage) behind auth.

**Acceptance Criteria:**
- [ ] `GET /stats/admin` returns JSON with: `total_users`, `active_users_7d` (users with `last_active` within past 7 days — this field is updated on login/auth events in `auth_service.py`), `filter_evaluations_total`, `filter_evaluations_24h`, `ai_analyses_total`, `ai_analyses_24h`, `pending_company_reviews` (count from `company_review_queue` where `status = 'pending'`), `last_maintenance_runs` (last 5 rows from `maintenance_runs` table with task name, status, duration, timestamp), `filter_rejection_summary` (top 5 rejection reasons with counts — **reuse query logic from `analytics.py` `_get_rule_name` and `REQUIRED_RULE_REASONS`** to avoid duplication; extract shared helper if needed), `ai_disagreement_count` (count only, not full list — reuse threshold logic from `analytics.py` `get_ai_disagreements`), `maintenance_health` (last successful run timestamp per task, queried from `maintenance_runs` where `status = 'succeeded'`)
- [ ] Queries `maintenance_runs` table directly via ORM — does **not** proxy through the maintenance router (which uses `MaintenanceAuth` token-based auth, not JWT)
- [ ] Requires admin JWT (uses `CurrentAdminUser` dependency)
- [ ] Returns 401 for unauthenticated requests, 403 for non-admin users
- [ ] Empty-state: `0` for counts, `null` for timestamps, empty list `[]` for arrays
- [ ] Typecheck passes
- [ ] Unit tests for aggregation logic with mock data
- [ ] Integration test that `/stats/admin` returns 401 without auth and correct schema with admin auth

### US-003: Create stats.html page with public section
**Description:** As a visitor, I can see high-level stats about the job board without logging in.

**Acceptance Criteria:**
- [ ] `stats.html` in the frontend repo root (same level as `index.html`)
- [ ] Includes `js/api.js` via `<script src="js/api.js?v=YYYYMMDD">` (inherits `?api=local` behavior for dev)
- [ ] Includes `js/stats.js?v=YYYYMMDD` for all dashboard logic
- [ ] Includes `css/stats.css?v=YYYYMMDD` for styles (standalone — no dependency on `css/styles.css`)
- [ ] Shows header with "Producer-Producer Stats" and last-refreshed timestamp
- [ ] **Overview cards row:** Total listings, Active listings, Added (24h), Added (7d), Total companies, Active companies
- [ ] **Filter Pipeline section:** Pass/Fail/Pending counts shown as a horizontal stacked bar + numbers
- [ ] **Score Distribution section:** Histogram chart (CSS-only bar chart, no external charting library)
- [ ] **Top Companies section:** Table of top 10 companies by listing count
- [ ] **Sources section:** Breakdown of listings by `source` column value
- [ ] **Data freshness indicators:** Newest posted date, oldest active posted date, remote %, salary info %
- [ ] **Data freshness warning:** If `opportunities_added_24h` is 0, show a yellow warning banner: "No new opportunities added in the past 24 hours"
- [ ] **Empty states:** Cards show "0" or "N/A"; tables show "No data available" row; histogram shows empty bars
- [ ] Styled with dark theme, high-contrast text, monospace for numbers — information-dense ops aesthetic, not retro desktop
- [ ] Mobile responsive (cards stack vertically below 768px)

### US-004: Admin section behind login
**Description:** As the creator, I want to log in and see sensitive operational stats alongside the public ones.

**Acceptance Criteria:**
- [ ] Admin section is hidden by default, shows after successful admin auth
- [ ] Reuses existing `api.js` API client and auth token from localStorage (shared with main site since same origin)
- [ ] Shows a "Login for admin stats" button when not authenticated
- [ ] After auth, shows: user count, active users (7d), filter evaluation counts (total + 24h), AI analysis counts (total + 24h), pending company reviews count
- [ ] **Maintenance Runs table:** Last 5 runs with task name, status badge (green=succeeded, red=failed, yellow=pending/running), duration, timestamp
- [ ] **Maintenance Health section:** Per-task "last successful run" with time-ago display (e.g., "2h ago", "3d ago"), red highlight if >24h since last success
- [ ] **Filter Rejection Summary:** Top 5 rejection reasons as a ranked list with counts
- [ ] **AI Disagreements:** Count displayed; no inline expansion needed for v1
- [ ] **Empty states:** Tables show "No runs recorded"; counts show 0; maintenance health shows "Never" if no successful run exists

### US-005: Auto-refresh with polling
**Description:** As the creator, I want the dashboard to stay current without manual refreshing.

**Acceptance Criteria:**
- [ ] Page auto-refreshes data every 60 seconds
- [ ] "Last updated" timestamp in header updates on each refresh
- [ ] Visual pulse/flash animation on data change so I notice updates
- [ ] Pause/resume button to stop polling when not needed
- [ ] Manual "Refresh now" button for immediate update
- [ ] Polling pauses when browser tab is not visible (`document.hidden`)
- [ ] Network errors show a non-intrusive warning bar, do not break polling loop
- [ ] If admin JWT expires during polling (401 response), admin section reverts to "Login for admin stats" prompt; public section polling continues uninterrupted

### US-006: Connection status and error handling
**Description:** As the creator, I want to immediately see if the API is down or responding slowly.

**Acceptance Criteria:**
- [ ] Green/red connection indicator in header (calls `/health` endpoint)
- [ ] If API is unreachable, shows red "API Offline" banner with last-known-good timestamp
- [ ] Displays API response time (latency) next to the connection indicator
- [ ] Individual section errors degrade gracefully (show "Error loading" in that section, other sections still work)

## Functional Requirements

- FR-1: `GET /stats` endpoint aggregates public stats from `opportunities`, `companies`, and `filter_evaluations` tables via SQL aggregate queries (`COUNT`, `AVG`, `CASE WHEN` for buckets). Does not load full rows into Python.
- FR-2: `GET /stats/admin` endpoint aggregates sensitive stats from `users`, `maintenance_runs`, `ai_analyses`, `filter_evaluations`, and `company_review_queue` tables; requires `CurrentAdminUser`. Reuses rejection-reason mapping from `analytics.py` `REQUIRED_RULE_REASONS` and AI disagreement threshold logic — extract into shared helpers in a `fly_app/services/stats_service.py` if the query logic is non-trivial, otherwise inline with an import of the constants.
- FR-3: `stats.html` fetches from `/stats` on load and every 60 seconds
- FR-4: If user has a valid admin JWT in localStorage, also fetch from `/stats/admin` and render admin section
- FR-5: All data cards show numeric values with appropriate formatting (commas for thousands, percentages with 1 decimal)
- FR-6: Score distribution histogram uses half-open 10-point buckets: `[0,10), [10,20), ..., [80,90), [90,100]` (final bucket includes 100)
- FR-7: Maintenance health shows time-ago format (e.g., "2h ago", "3d ago") with red highlighting for tasks not run in >24h
- FR-8: Page has no dependencies on the retro desktop CSS/JS — it is a standalone utility page
- FR-9: Frontend files: `stats.html`, `js/stats.js`, `css/stats.css` — all use `?v=YYYYMMDD` cache-busting pattern per project convention
- FR-10: Register the stats router in `main.py` alongside other routers

## Non-Goals

- No retro desktop UI / window chrome — this is a clean utility dashboard
- No editing or mutation of data from this page (read-only)
- No charting libraries (Chart.js, D3, etc.) — CSS-only visualizations
- No WebSocket / SSE — simple polling is sufficient
- No user-specific stats (this is a system-level dashboard, not per-user analytics)
- No historical trend graphs (v1 is point-in-time snapshot only)
- No uptime tracking or historical health check percentage (future consideration)

## Design Considerations

- Dark theme with high-contrast text for readability on a monitoring screen
- Information density over whitespace — this is an ops dashboard, not a marketing page
- Card-based layout with clear section headers
- Color-coded status badges: green (healthy/pass/succeeded), red (error/fail/failed), yellow (warning/pending/running)
- Monospace font for numbers for easy scanning
- Minimal page weight — no frameworks, no build step, vanilla HTML/CSS/JS

## Technical Considerations

- Backend stats queries must use SQL aggregates (`COUNT`, `AVG`, `GROUP BY`, `CASE WHEN`), not load full result sets into Python
- Existing indexes are sufficient: `ix_opportunities_is_active`, `ix_opportunities_filter_status`, `ix_opportunities_posted_date`, `ix_opportunities_company_id`, `ix_filter_evaluations_opportunity_id`; if `first_seen` queries are slow, consider adding `ix_opportunities_first_seen` but not required for v1
- If the single `/stats` endpoint exceeds 2s response time, split into `/stats` (fast counts) and `/stats/scores` (histogram + aggregates) — frontend can call both in parallel
- `stats.html` lives at the frontend repo root, same level as `index.html`, same origin — so `js/api.js` is included via relative `<script>` tag and localStorage tokens are shared
- `api.js` auto-detects local vs production API via `?api=local` URL parameter; `stats.html` inherits this behavior
- Rejection-reason and AI-disagreement logic should import constants/helpers from `analytics.py` rather than duplicating them, to maintain a single source of truth
- `stats.html` is not linked from the main site navigation — it's an unlisted utility URL for the creator

## Success Metrics

- Dashboard loads and renders all public sections in under 3 seconds
- Creator can tell within 5 seconds of opening the page whether the system is healthy
- Stale data (no new listings in 24h) is immediately obvious via yellow warning banner
- Failed maintenance runs are immediately visible with red status badges

## Open Questions

- Should we add a simple "uptime" metric (percentage of successful health checks over past 24h) in a future version?
- Should the stats page eventually be linked from the main site navigation, or remain unlisted?
