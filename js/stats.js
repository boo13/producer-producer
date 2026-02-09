/**
 * Stats Dashboard — fetches /stats and /stats/admin, renders all sections,
 * auto-refreshes every 60 s with pause/resume and per-section error handling.
 *
 * Depends on js/api.js (window.api singleton).
 */

(function () {
    'use strict';

    const REFRESH_INTERVAL = 60_000;
    let timerId = null;
    let paused = false;
    let lastGoodTime = null;
    let previousPublicJson = null;
    let previousAdminJson = null;

    // ── DOM refs ────────────────────────────────────────────────────────
    const $id = (id) => document.getElementById(id);

    const els = {
        connectionIndicator: $id('connection-indicator'),
        latencyText: $id('latency-text'),
        lastUpdated: $id('last-updated'),
        refreshBtn: $id('refresh-btn'),
        pauseBtn: $id('pause-btn'),
        offlineBanner: $id('api-offline-banner'),
        lastGoodTime: $id('last-good-time'),
        noNewOppsBanner: $id('no-new-opps-banner'),
        errorBanner: $id('error-banner'),
        adminLogin: $id('admin-login'),
        adminLoginBtn: $id('admin-login-btn'),
        adminContent: $id('admin-content'),
    };

    // ── Formatters ─────────────────────────────────────────────────────

    function fmt(n) {
        if (n == null) return 'N/A';
        return Number(n).toLocaleString();
    }

    function fmtPct(n) {
        if (n == null) return 'N/A';
        return Number(n).toFixed(1) + '%';
    }

    function fmtDate(d) {
        if (!d) return 'N/A';
        const dt = new Date(d);
        if (isNaN(dt)) return 'N/A';
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function fmtTime(d) {
        if (!d) return '—';
        const dt = new Date(d);
        if (isNaN(dt)) return '—';
        return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function timeAgo(d) {
        if (!d) return 'Never';
        const dt = new Date(d);
        if (isNaN(dt)) return 'Never';
        const diffMs = Date.now() - dt.getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + 'm ago';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        const days = Math.floor(hrs / 24);
        return days + 'd ago';
    }

    function isStale(d, thresholdMs) {
        if (!d) return true;
        return (Date.now() - new Date(d).getTime()) > thresholdMs;
    }

    // ── Pulse helper ───────────────────────────────────────────────────

    function pulseEl(el) {
        if (!el) return;
        el.classList.remove('pulse');
        void el.offsetWidth;
        el.classList.add('pulse');
    }

    function pulseIfChanged(id, newVal) {
        const el = $id(id);
        if (!el) return;
        if (el.textContent !== String(newVal)) {
            el.textContent = newVal;
            pulseEl(el.closest('.card') || el);
        }
    }

    // ── Section error helper (US-014) ──────────────────────────────────

    function setSectionError(sectionId, msg) {
        const section = $id(sectionId);
        if (!section) return;
        section.classList.add('has-error');
        let errEl = section.querySelector('.section-error');
        if (!errEl) {
            errEl = document.createElement('div');
            errEl.className = 'section-error';
            section.appendChild(errEl);
        }
        errEl.textContent = msg || 'Error loading data';
    }

    function clearSectionError(sectionId) {
        const section = $id(sectionId);
        if (!section) return;
        section.classList.remove('has-error');
        const errEl = section.querySelector('.section-error');
        if (errEl) errEl.remove();
    }

    // ── Health check ───────────────────────────────────────────────────

    async function checkHealth() {
        const dot = els.connectionIndicator?.querySelector('.indicator-dot');
        const txt = els.connectionIndicator?.querySelector('.indicator-text');
        try {
            const t0 = performance.now();
            await window.api.healthCheck();
            const latency = Math.round(performance.now() - t0);
            if (dot) { dot.className = 'indicator-dot online'; }
            if (txt) { txt.textContent = 'Online'; }
            if (els.latencyText) { els.latencyText.textContent = latency + 'ms'; }
            els.offlineBanner?.classList.add('is-hidden');
        } catch {
            if (dot) { dot.className = 'indicator-dot offline'; }
            if (txt) { txt.textContent = 'Offline'; }
            if (els.latencyText) { els.latencyText.textContent = ''; }
            els.offlineBanner?.classList.remove('is-hidden');
            if (els.lastGoodTime) {
                els.lastGoodTime.textContent = lastGoodTime ? fmtTime(lastGoodTime) : 'never';
            }
        }
    }

    // ── Public stats rendering (US-009, US-010) ────────────────────────

    function renderPublicStats(data) {
        // Overview cards
        pulseIfChanged('stat-total', fmt(data.total_opportunities));
        pulseIfChanged('stat-active', fmt(data.active_opportunities));
        pulseIfChanged('stat-24h', fmt(data.opportunities_added_24h));
        pulseIfChanged('stat-7d', fmt(data.opportunities_added_7d));
        pulseIfChanged('stat-companies', fmt(data.total_companies));
        pulseIfChanged('stat-active-companies', fmt(data.active_companies));

        // Data freshness
        pulseIfChanged('stat-newest', fmtDate(data.newest_posted_date));
        pulseIfChanged('stat-oldest-active', fmtDate(data.oldest_active_posted_date));
        pulseIfChanged('stat-remote-pct', fmtPct(data.remote_percentage));
        pulseIfChanged('stat-salary-pct', fmtPct(data.has_salary_percentage));
        pulseIfChanged('stat-avg-score', data.avg_score != null ? Number(data.avg_score).toFixed(1) : 'N/A');
        pulseIfChanged('stat-median-score', data.median_score != null ? Number(data.median_score).toFixed(1) : 'N/A');

        // 24h warning banner
        if (data.opportunities_added_24h === 0) {
            els.noNewOppsBanner?.classList.remove('is-hidden');
        } else {
            els.noNewOppsBanner?.classList.add('is-hidden');
        }

        renderPipeline(data.filter_status_counts);
        renderHistogram(data.score_distribution);
        renderCompaniesTable(data.top_companies_by_listings);
        renderSourcesTable(data.sources_breakdown);
    }

    function renderPipeline(counts) {
        const bar = $id('pipeline-bar');
        const legend = $id('pipeline-legend');
        if (!bar || !counts) return;

        const total = (counts.passed || 0) + (counts.failed || 0) + (counts.pending || 0);
        if (total === 0) {
            bar.innerHTML = '';
            if (legend) legend.innerHTML = '<span>No data</span>';
            return;
        }

        const pctPass = ((counts.passed / total) * 100).toFixed(1);
        const pctFail = ((counts.failed / total) * 100).toFixed(1);
        const pctPend = ((counts.pending / total) * 100).toFixed(1);

        bar.innerHTML =
            `<div class="pipeline-segment pass" style="width:${pctPass}%">${fmt(counts.passed)}</div>` +
            `<div class="pipeline-segment fail" style="width:${pctFail}%">${fmt(counts.failed)}</div>` +
            `<div class="pipeline-segment pending" style="width:${pctPend}%">${fmt(counts.pending)}</div>`;

        if (legend) {
            legend.innerHTML =
                `<span>✓ Pass ${fmt(counts.passed)} (${pctPass}%)</span>` +
                `<span>✗ Fail ${fmt(counts.failed)} (${pctFail}%)</span>` +
                `<span>⏳ Pending ${fmt(counts.pending)} (${pctPend}%)</span>`;
        }
    }

    function renderHistogram(buckets) {
        const container = $id('score-histogram');
        if (!container) return;

        if (!buckets || buckets.length === 0) {
            container.innerHTML = '<span class="empty-row">No score data</span>';
            return;
        }

        const maxCount = Math.max(...buckets.map((b) => b.count), 1);

        container.innerHTML = buckets
            .map((b) => {
                const pct = Math.max((b.count / maxCount) * 100, 2);
                return (
                    `<div class="histogram-bar-wrapper">` +
                    `<span class="histogram-count">${b.count}</span>` +
                    `<div class="histogram-bar" style="height:${pct}%"></div>` +
                    `<span class="histogram-label">${b.range_label}</span>` +
                    `</div>`
                );
            })
            .join('');
    }

    function renderCompaniesTable(companies) {
        const table = $id('companies-table');
        if (!table) return;
        const tbody = table.querySelector('tbody');

        if (!companies || companies.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="empty-row">No data available</td></tr>';
            return;
        }

        tbody.innerHTML = companies
            .map(
                (c, i) =>
                    `<tr><td>${i + 1}</td><td>${esc(c.company_name)}</td><td class="num">${fmt(c.count)}</td></tr>`
            )
            .join('');
    }

    function renderSourcesTable(sources) {
        const table = $id('sources-table');
        if (!table) return;
        const tbody = table.querySelector('tbody');

        if (!sources || sources.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="empty-row">No data available</td></tr>';
            return;
        }

        tbody.innerHTML = sources
            .map((s) => `<tr><td>${esc(s.source)}</td><td class="num">${fmt(s.count)}</td></tr>`)
            .join('');
    }

    // ── Admin stats rendering (US-011, US-012) ─────────────────────────

    function renderAdminStats(data) {
        pulseIfChanged('stat-users', fmt(data.total_users));
        pulseIfChanged('stat-active-users', fmt(data.active_users_7d));
        pulseIfChanged('stat-evals-total', fmt(data.filter_evaluations_total));
        pulseIfChanged('stat-evals-24h', fmt(data.filter_evaluations_24h));
        pulseIfChanged('stat-ai-total', fmt(data.ai_analyses_total));
        pulseIfChanged('stat-ai-24h', fmt(data.ai_analyses_24h));
        pulseIfChanged('stat-pending-reviews', fmt(data.pending_company_reviews));
        pulseIfChanged('stat-ai-disagreements', fmt(data.ai_disagreement_count));

        renderMaintenanceTable(data.last_maintenance_runs);
        renderHealthGrid(data.maintenance_health);
        renderRejectionList(data.filter_rejection_summary);
    }

    function renderMaintenanceTable(runs) {
        const table = $id('maintenance-table');
        if (!table) return;
        const tbody = table.querySelector('tbody');

        if (!runs || runs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-row">No runs recorded</td></tr>';
            return;
        }

        tbody.innerHTML = runs
            .map((r) => {
                const badgeClass =
                    r.status === 'succeeded' ? 'succeeded' :
                    r.status === 'failed' ? 'failed' : 'pending';
                const duration = r.duration_seconds != null ? r.duration_seconds.toFixed(1) + 's' : '—';
                return (
                    `<tr>` +
                    `<td>${esc(r.task)}</td>` +
                    `<td><span class="status-badge ${badgeClass}">${esc(r.status)}</span></td>` +
                    `<td class="num">${duration}</td>` +
                    `<td>${fmtTime(r.created_at)}</td>` +
                    `</tr>`
                );
            })
            .join('');
    }

    function renderHealthGrid(health) {
        const grid = $id('health-grid');
        if (!grid) return;

        if (!health || health.length === 0) {
            grid.innerHTML = '<span class="empty-row">No data</span>';
            return;
        }

        const DAY_MS = 24 * 60 * 60 * 1000;

        grid.innerHTML = health
            .map((h) => {
                const staleClass = isStale(h.last_success, DAY_MS) ? ' stale' : '';
                const ago = h.last_success ? timeAgo(h.last_success) : 'Never';
                return (
                    `<div class="health-item${staleClass}">` +
                    `<span class="task-name">${esc(h.task)}</span>` +
                    `<span class="time-ago">${ago}</span>` +
                    `</div>`
                );
            })
            .join('');
    }

    function renderRejectionList(summary) {
        const list = $id('rejection-list');
        if (!list) return;

        if (!summary || summary.length === 0) {
            list.innerHTML = '<li class="empty-row">No data</li>';
            return;
        }

        list.innerHTML = summary
            .map(
                (r) =>
                    `<li><span class="reason-name">${esc(r.reason)}</span><span class="reason-count">${fmt(r.count)}</span></li>`
            )
            .join('');
    }

    // ── HTML escape ────────────────────────────────────────────────────

    function esc(s) {
        if (!s) return '';
        const el = document.createElement('span');
        el.textContent = s;
        return el.innerHTML;
    }

    // ── Data fetching ──────────────────────────────────────────────────

    async function fetchPublicStats() {
        const sectionIds = ['section-overview', 'section-freshness', 'section-pipeline', 'section-scores', 'section-companies', 'section-sources'];
        try {
            const data = await window.api.request('/stats', { method: 'GET' });
            sectionIds.forEach(clearSectionError);
            renderPublicStats(data);
            previousPublicJson = JSON.stringify(data);
            lastGoodTime = new Date();
        } catch (err) {
            sectionIds.forEach((id) => setSectionError(id, 'Error loading — will retry'));
        }
    }

    async function fetchAdminStats() {
        if (!window.api.isAuthenticated()) return;
        try {
            const data = await window.api.request('/stats/admin', { method: 'GET' });
            clearSectionError('section-admin');
            els.adminLogin?.classList.add('is-hidden');
            els.adminContent?.classList.remove('is-hidden');
            renderAdminStats(data);
            previousAdminJson = JSON.stringify(data);
        } catch (err) {
            if (err.message && (err.message.includes('401') || err.message.includes('Authentication'))) {
                window.api.logout();
                els.adminContent?.classList.add('is-hidden');
                els.adminLogin?.classList.remove('is-hidden');
            } else {
                setSectionError('section-admin', 'Error loading admin stats — will retry');
            }
        }
    }

    async function refreshAll() {
        els.lastUpdated.textContent = 'Refreshing...';
        await checkHealth();
        await fetchPublicStats();
        await fetchAdminStats();
        els.lastUpdated.textContent = 'Updated ' + fmtTime(new Date());
    }

    // ── Polling (US-013) ───────────────────────────────────────────────

    function startPolling() {
        stopPolling();
        timerId = setInterval(() => {
            if (!document.hidden && !paused) {
                refreshAll();
            }
        }, REFRESH_INTERVAL);
    }

    function stopPolling() {
        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
    }

    function togglePause() {
        paused = !paused;
        els.pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause';
    }

    // ── Admin auth (US-011) ────────────────────────────────────────────

    function updateAdminUI() {
        if (window.api.isAuthenticated()) {
            els.adminLogin?.classList.add('is-hidden');
            els.adminContent?.classList.remove('is-hidden');
            fetchAdminStats();
        } else {
            els.adminContent?.classList.add('is-hidden');
            els.adminLogin?.classList.remove('is-hidden');
        }
    }

    function handleAdminLogin() {
        const email = prompt('Admin email:');
        if (!email) return;
        window.api.requestMagicLink(email).then(() => {
            alert('Magic link sent — check your email, then reload this page.');
        }).catch((err) => {
            alert('Login failed: ' + (err.message || err));
        });
    }

    // ── Visibility API (US-013) ────────────────────────────────────────

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !paused) {
            refreshAll();
        }
    });

    // ── Init ───────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', () => {
        els.refreshBtn?.addEventListener('click', refreshAll);
        els.pauseBtn?.addEventListener('click', togglePause);
        els.adminLoginBtn?.addEventListener('click', handleAdminLogin);

        // Check for magic link token in URL
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        if (token) {
            window.api.verifyMagicLink(token).then(() => {
                const url = new URL(window.location);
                url.searchParams.delete('token');
                window.history.replaceState({}, '', url);
                updateAdminUI();
            }).catch(() => {});
        }

        updateAdminUI();
        refreshAll();
        startPolling();
    });
})();
