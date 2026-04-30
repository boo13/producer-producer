/**
 * Admin Dashboard — auth gate, 60s polling, per-source rendering.
 * Depends on js/api.js (window.api singleton).
 */

(function () {
    'use strict';

    const REFRESH_INTERVAL = 60_000;
    const WORKFLOW_BADGES = {
        'boo13/producer-producer-api': [
            { name: 'Tests', file: 'tests.yml' },
            { name: 'Daily Job Pull', file: 'pull_jobs.yml' },
            { name: 'Evaluate Jobs', file: 'evaluate_jobs.yml' },
            { name: 'Send Digest', file: 'send_digest.yml' },
        ],
    };

    let timerId = null;
    let paused = false;
    let lastGoodTime = null;

    const $id = (id) => document.getElementById(id);

    const els = {
        authGate:            $id('auth-gate'),
        authForm:            $id('auth-form'),
        authEmail:           $id('auth-email'),
        authStatus:          $id('auth-status'),
        dashboard:           $id('dashboard'),
        connectionIndicator: $id('connection-indicator'),
        latencyText:         $id('latency-text'),
        lastUpdated:         $id('last-updated'),
        refreshBtn:          $id('refresh-btn'),
        pauseBtn:            $id('pause-btn'),
        offlineBanner:       $id('api-offline-banner'),
        lastGoodTime:        $id('last-good-time'),
        noNewOppsBanner:     $id('no-new-opps-banner'),
    };

    // ── Formatters ──────────────────────────────────────────────────────

    function fmt(n) {
        if (n == null) return '—';
        return Number(n).toLocaleString();
    }

    function fmtPct(n) {
        if (n == null) return '—';
        return Number(n).toFixed(1) + '%';
    }

    function fmtDate(d) {
        if (!d) return '—';
        const dt = new Date(d);
        if (isNaN(dt)) return '—';
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
        return Math.floor(hrs / 24) + 'd ago';
    }

    function isStale(d, thresholdMs) {
        if (!d) return true;
        return (Date.now() - new Date(d).getTime()) > thresholdMs;
    }

    function esc(s) {
        if (!s) return '';
        const el = document.createElement('span');
        el.textContent = s;
        return el.innerHTML;
    }

    function durationStr(startedAt, updatedAt) {
        if (!startedAt || !updatedAt) return '—';
        const ms = new Date(updatedAt) - new Date(startedAt);
        if (isNaN(ms) || ms < 0) return '—';
        const secs = Math.round(ms / 1000);
        if (secs < 60) return secs + 's';
        return Math.floor(secs / 60) + 'm ' + (secs % 60) + 's';
    }

    // ── Pulse ────────────────────────────────────────────────────────────

    function pulseIfChanged(id, newVal) {
        const el = $id(id);
        if (!el) return;
        if (el.textContent !== String(newVal)) {
            el.textContent = newVal;
            el.classList.remove('pulse');
            void el.offsetWidth;
            el.classList.add('pulse');
        }
    }

    // ── Section error helpers ─────────────────────────────────────────────

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

    // ── Health check (API liveness) ───────────────────────────────────────

    async function checkApiHealth() {
        const dot = els.connectionIndicator?.querySelector('.indicator-dot');
        const txt = els.connectionIndicator?.querySelector('.indicator-text');
        try {
            const t0 = performance.now();
            await window.api.healthCheck();
            const latency = Math.round(performance.now() - t0);
            if (dot) dot.className = 'indicator-dot online';
            if (txt) txt.textContent = 'Online';
            if (els.latencyText) els.latencyText.textContent = latency + 'ms';
            els.offlineBanner?.classList.add('is-hidden');
            lastGoodTime = new Date();
        } catch {
            if (dot) dot.className = 'indicator-dot offline';
            if (txt) txt.textContent = 'Offline';
            if (els.latencyText) els.latencyText.textContent = '';
            els.offlineBanner?.classList.remove('is-hidden');
            if (els.lastGoodTime) {
                els.lastGoodTime.textContent = lastGoodTime ? fmtTime(lastGoodTime) : 'never';
            }
        }
    }

    // ── Hero tiles ────────────────────────────────────────────────────────

    function applyTileState(tileEl, statusEl, latencyEl, result) {
        tileEl.className = 'status-tile';
        if (!result) {
            tileEl.classList.add('tile-off');
            if (statusEl) statusEl.textContent = '—';
            return;
        }
        const s = result.status;
        if (s === 'up') {
            tileEl.classList.add('tile-up');
            if (statusEl) statusEl.textContent = 'Up';
        } else if (s === 'degraded') {
            tileEl.classList.add('tile-warn');
            if (statusEl) statusEl.textContent = 'Degraded';
        } else {
            tileEl.classList.add('tile-down');
            if (statusEl) statusEl.textContent = result.error ? 'Down' : 'Error';
        }
        if (latencyEl && result.latency_ms != null) {
            latencyEl.textContent = result.latency_ms + 'ms';
        }
    }

    function renderHeroTiles(statusData) {
        const health = statusData.health || [];
        const gh = statusData.github || {};

        const urls = [
            'https://producer-producer.com/',
            'https://api.producer-producer.com/health',
            'https://producer-producer-api.fly.dev/health',
        ];
        const tileIds = ['tile-frontend', 'tile-api', 'tile-fly'];

        urls.forEach((url, i) => {
            const result = health.find((h) => h.url === url);
            const tile = $id(tileIds[i]);
            const statusEl = $id(tileIds[i] + '-status');
            const latencyEl = $id(tileIds[i] + '-latency');
            if (tile) applyTileState(tile, statusEl, latencyEl, result || null);
        });

        // Workflows tile: red if any repo has failed runs; warn on API errors
        const wfTile = $id('tile-workflows');
        const wfStatus = $id('tile-workflows-status');
        if (wfTile && wfStatus) {
            if (gh.error === 'not_configured') {
                wfTile.className = 'status-tile tile-off';
                wfStatus.textContent = 'Not configured';
            } else {
                const repos = Object.values(gh);
                const hasErrors = repos.some((r) => r.error);
                const allErrored = repos.length > 0 && repos.every((r) => r.error);
                const totalFailed = repos.reduce((sum, r) => sum + (r.failed_runs_recent || 0), 0);
                if (allErrored) {
                    wfTile.className = 'status-tile tile-down';
                    wfStatus.textContent = 'API error';
                } else if (hasErrors) {
                    wfTile.className = 'status-tile tile-warn';
                    wfStatus.textContent = totalFailed > 0 ? totalFailed + ' failed + API error' : 'API error';
                } else {
                    wfTile.className = 'status-tile ' + (totalFailed > 0 ? 'tile-warn' : 'tile-up');
                    wfStatus.textContent = totalFailed > 0 ? totalFailed + ' failed' : 'OK';
                }
            }
        }

        // Issues tile
        const errTile = $id('tile-errors');
        const errStatus = $id('tile-errors-status');
        if (errTile && errStatus) {
            if (gh.error === 'not_configured') {
                errTile.className = 'status-tile tile-off';
                errStatus.textContent = 'Not configured';
            } else {
                errTile.className = 'status-tile tile-up';
                errStatus.textContent = 'see Issues';
            }
        }
    }

    // ── Uptime section ────────────────────────────────────────────────────

    function renderHealthChecks(health) {
        const container = $id('health-checks');
        if (!container) return;

        if (!health || health.length === 0) {
            container.innerHTML = '<span class="empty-row">No data</span>';
            return;
        }

        container.innerHTML = health.map((h) => {
            const cls = h.status === 'up' ? 'hcs-up' : h.status === 'degraded' ? 'hcs-degraded' : 'hcs-down';
            const label = h.status === 'up' ? 'Up' : h.status === 'degraded' ? 'Degraded' : 'Down';
            const latency = h.latency_ms != null ? h.latency_ms + 'ms' : (h.error || '');
            return (
                `<div class="health-check-row">` +
                `<span class="health-check-url">${esc(h.url)}</span>` +
                `<span class="health-check-status ${cls}">${label}</span>` +
                `<span class="health-check-latency">${esc(latency)}</span>` +
                `</div>`
            );
        }).join('');
    }

    function renderBetterStack(data) {
        const container = $id('betterstack-monitors');
        if (!container) return;

        if (!data || data.error === 'not_configured') {
            container.innerHTML = '<span class="not-configured">Configure BETTERSTACK_TOKEN to see monitors</span>';
            return;
        }

        if (data.error) {
            container.innerHTML = `<span class="not-configured">Error: ${esc(data.error)}</span>`;
            return;
        }

        const monitors = data.data || [];
        if (monitors.length === 0) {
            container.innerHTML = '<span class="not-configured">No monitors found — create them in BetterStack</span>';
            return;
        }

        container.innerHTML = monitors.map((m) => {
            const attrs = m.attributes || {};
            const s = attrs.status || 'unknown';
            const cls = s === 'up' ? 'hcs-up' : s === 'down' ? 'hcs-down' : 'hcs-degraded';
            return (
                `<div class="monitor-row">` +
                `<span class="monitor-name">${esc(attrs.url || m.id)}</span>` +
                `<span class="monitor-status ${cls}">${esc(s)}</span>` +
                `</div>`
            );
        }).join('');
    }

    // ── GitHub Workflows section ──────────────────────────────────────────

    function renderWorkflowBadges(workflows) {
        const container = $id('workflows-badges');
        if (!container) return;

        if (!workflows || (workflows.error === 'not_configured')) {
            container.innerHTML = '<span class="not-configured">Configure GITHUB_TOKEN to see workflows</span>';
            return;
        }

        const rows = [];
        for (const [repo, defs] of Object.entries(WORKFLOW_BADGES)) {
            if (defs) {
                defs.forEach((wf) => {
                    const branch = 'main';
                    const badgeUrl = `https://github.com/${repo}/actions/workflows/${wf.file}/badge.svg?branch=${branch}`;
                    const linkUrl = `https://github.com/${repo}/actions/workflows/${wf.file}`;
                    rows.push(
                        `<div class="workflow-badge-row">` +
                        `<a href="${linkUrl}" target="_blank" rel="noopener">` +
                        `<img src="${badgeUrl}" alt="${esc(wf.name)} workflow status">` +
                        `</a>` +
                        `<span class="workflow-badge-name">${esc(wf.name)}</span>` +
                        `</div>`
                    );
                });
            }
        }

        container.innerHTML = rows.length ? rows.join('') : '<span class="not-configured">No badges configured</span>';
    }

    function renderFailedRuns(data) {
        const tbody = $id('failed-runs-body');
        if (!tbody) return;

        if (!data || data.error === 'not_configured') {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Configure GITHUB_TOKEN</td></tr>';
            return;
        }

        const rows = [];
        for (const [repo, repoData] of Object.entries(data)) {
            if (repoData.error) {
                rows.push(
                    `<tr class="row-error">` +
                    `<td>${esc(repo.split('/')[1])}</td>` +
                    `<td colspan="5">GitHub API error: ${esc(repoData.error)}</td>` +
                    `</tr>`
                );
                continue;
            }
            const runs = repoData.workflow_runs || [];
            runs.forEach((run) => {
                const commitMsg = (run.head_commit?.message || '').split('\n')[0].slice(0, 60);
                const duration = durationStr(run.run_started_at, run.updated_at);
                rows.push(
                    `<tr>` +
                    `<td>${esc(repo.split('/')[1])}</td>` +
                    `<td><a href="${esc(run.html_url)}" target="_blank" rel="noopener">${esc(run.name)}</a></td>` +
                    `<td>${esc(run.head_branch)}</td>` +
                    `<td title="${esc(run.head_commit?.message || '')}">${esc(commitMsg)}</td>` +
                    `<td>${fmtDate(run.run_started_at)}</td>` +
                    `<td>${esc(duration)}</td>` +
                    `</tr>`
                );
            });
        }

        tbody.innerHTML = rows.length
            ? rows.join('')
            : '<tr><td colspan="6" class="empty-row">No recent failures</td></tr>';
    }

    // ── Issues section ────────────────────────────────────────────────────

    function renderIssues(data, counts) {
        const tbody = $id('issues-body');
        const openIssuesEl = $id('stat-open-issues');
        const openPRsEl = $id('stat-open-prs');
        if (!tbody) return;

        if (!data || data.error === 'not_configured') {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Configure GITHUB_TOKEN to see issues</td></tr>';
            if (openIssuesEl) openIssuesEl.textContent = '—';
            if (openPRsEl) openPRsEl.textContent = '—';
            return;
        }

        const rows = [];

        for (const [repo, items] of Object.entries(data)) {
            if (!Array.isArray(items)) {
                rows.push(
                    `<tr class="row-error">` +
                    `<td>${esc(repo.split('/')[1])}</td>` +
                    `<td colspan="3">GitHub API error: ${esc(items?.error || 'unknown')}</td>` +
                    `</tr>`
                );
                continue;
            }
            items.forEach((issue) => {
                if (issue.pull_request) return;
                const labels = (issue.labels || []).map((l) => `<span style="font-size:0.65rem;padding:1px 4px;border-radius:2px;background:#f0e9d8;border:1px solid #bfb49d;">${esc(l.name)}</span>`).join(' ');
                rows.push(
                    `<tr>` +
                    `<td>${esc(repo.split('/')[1])}</td>` +
                    `<td><a href="${esc(issue.html_url)}" target="_blank" rel="noopener">${esc(issue.title)}</a></td>` +
                    `<td>${labels}</td>` +
                    `<td>${fmtDate(issue.created_at)}</td>` +
                    `</tr>`
                );
            });
        }

        // Use accurate Search API totals when available; fall back to '—'
        if (counts && !counts.error) {
            let totalIssues = 0;
            let totalPRs = 0;
            let anyCountError = false;
            for (const repoCounts of Object.values(counts)) {
                if (repoCounts.error) { anyCountError = true; continue; }
                totalIssues += repoCounts.open_issues || 0;
                totalPRs += repoCounts.open_prs || 0;
            }
            if (openIssuesEl) openIssuesEl.textContent = anyCountError && totalIssues === 0 ? '—' : fmt(totalIssues);
            if (openPRsEl) openPRsEl.textContent = anyCountError && totalPRs === 0 ? '—' : fmt(totalPRs);
        } else {
            if (openIssuesEl) openIssuesEl.textContent = '—';
            if (openPRsEl) openPRsEl.textContent = '—';
        }

        tbody.innerHTML = rows.length
            ? rows.join('')
            : '<tr><td colspan="4" class="empty-row">No open issues</td></tr>';
    }

    // ── Public stats rendering ────────────────────────────────────────────

    function renderPublicStats(data) {
        pulseIfChanged('stat-total', fmt(data.total_opportunities));
        pulseIfChanged('stat-active', fmt(data.active_opportunities));
        pulseIfChanged('stat-24h', fmt(data.opportunities_added_24h));
        pulseIfChanged('stat-7d', fmt(data.opportunities_added_7d));
        pulseIfChanged('stat-companies', fmt(data.total_companies));
        pulseIfChanged('stat-active-companies', fmt(data.active_companies));

        pulseIfChanged('stat-newest-date', fmtDate(data.newest_posted_date));
        pulseIfChanged('stat-newest-time', fmtTime(data.newest_posted_date));
        pulseIfChanged('stat-oldest-active', fmtDate(data.oldest_active_posted_date));
        pulseIfChanged('stat-remote-pct', fmtPct(data.remote_percentage));
        pulseIfChanged('stat-salary-pct', fmtPct(data.has_salary_percentage));
        pulseIfChanged('stat-avg-score', data.avg_score != null ? Number(data.avg_score).toFixed(1) : '—');
        pulseIfChanged('stat-median-score', data.median_score != null ? Number(data.median_score).toFixed(1) : '—');

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
        container.innerHTML = buckets.map((b) => {
            const pct = Math.max((b.count / maxCount) * 100, 2);
            return (
                `<div class="histogram-bar-wrapper">` +
                `<span class="histogram-count">${b.count}</span>` +
                `<div class="histogram-bar" style="height:${pct}%"></div>` +
                `<span class="histogram-label">${b.range_label}</span>` +
                `</div>`
            );
        }).join('');
    }

    function renderCompaniesTable(companies) {
        const table = $id('companies-table');
        if (!table) return;
        const tbody = table.querySelector('tbody');
        if (!companies || companies.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="empty-row">No data</td></tr>';
            return;
        }
        tbody.innerHTML = companies.map((c, i) =>
            `<tr><td>${i + 1}</td><td>${esc(c.company_name)}</td><td class="num">${fmt(c.count)}</td></tr>`
        ).join('');
    }

    function renderSourcesTable(sources) {
        const table = $id('sources-table');
        if (!table) return;
        const tbody = table.querySelector('tbody');
        if (!sources || sources.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="empty-row">No data</td></tr>';
            return;
        }
        tbody.innerHTML = sources.map((s) =>
            `<tr><td>${esc(s.source)}</td><td class="num">${fmt(s.count)}</td></tr>`
        ).join('');
    }

    function renderGrowthChart(dataPoints) {
        const container = $id('growth-chart');
        if (!container) return;

        if (!dataPoints || dataPoints.length < 2) {
            container.innerHTML = '<span class="empty-row">Not enough data for chart</span>';
            return;
        }

        const W = container.clientWidth - 44;
        const H = container.clientHeight - 40;
        const maxCount = dataPoints[dataPoints.length - 1].count;
        const minCount = dataPoints[0].count;
        const range = maxCount - minCount || 1;
        const xStep = W / (dataPoints.length - 1);

        function px(i) { return i * xStep; }
        function py(count) { return H - ((count - minCount) / range) * H; }

        const gridLines = 4;
        let gridSvg = '';
        let yLabelsSvg = '';
        for (let g = 0; g <= gridLines; g++) {
            const val = minCount + (range * g) / gridLines;
            const y = py(val);
            gridSvg += `<line class="chart-grid-line" x1="0" y1="${y}" x2="${W}" y2="${y}" />`;
            yLabelsSvg += `<text class="chart-axis-label" x="-8" y="${y + 3}" text-anchor="end">${fmt(Math.round(val))}</text>`;
        }

        const points = dataPoints.map((d, i) => `${px(i)},${py(d.count)}`).join(' ');
        const areaPath = `M0,${H} L${dataPoints.map((d, i) => `${px(i)},${py(d.count)}`).join(' L')} L${W},${H} Z`;

        const maxLabels = Math.min(dataPoints.length, Math.floor(W / 60));
        const labelStep = Math.max(1, Math.floor(dataPoints.length / maxLabels));
        let xLabelsSvg = '';
        for (let i = 0; i < dataPoints.length; i += labelStep) {
            const d = new Date(dataPoints[i].date + 'T00:00:00');
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            xLabelsSvg += `<text class="chart-axis-label" x="${px(i)}" y="${H + 18}" text-anchor="middle">${label}</text>`;
        }

        const dotsSvg = dataPoints.map((d, i) =>
            `<circle class="chart-dot" cx="${px(i)}" cy="${py(d.count)}" r="3" data-date="${d.date}" data-count="${d.count}" />`
        ).join('');

        container.innerHTML =
            `<svg class="line-chart-svg" viewBox="-44 -8 ${W + 52} ${H + 36}" preserveAspectRatio="none">` +
            `<defs><linearGradient id="growth-gradient" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0%" stop-color="var(--accent-amber)" stop-opacity="0.20"/>` +
            `<stop offset="100%" stop-color="var(--accent-amber)" stop-opacity="0.02"/>` +
            `</linearGradient></defs>` +
            gridSvg + yLabelsSvg + xLabelsSvg +
            `<path class="chart-area" d="${areaPath}" />` +
            `<polyline class="chart-line" points="${points}" />` +
            dotsSvg +
            `</svg>` +
            `<div class="line-chart-tooltip" id="growth-tooltip"></div>`;

        const tooltip = $id('growth-tooltip');
        container.querySelectorAll('.chart-dot').forEach((dot) => {
            dot.addEventListener('mouseenter', () => {
                const date = dot.getAttribute('data-date');
                const count = dot.getAttribute('data-count');
                tooltip.textContent = `${date}: ${fmt(Number(count))} listings`;
                tooltip.style.display = 'block';
                const cx = parseFloat(dot.getAttribute('cx')) + 44;
                tooltip.style.left = cx + 'px';
                tooltip.style.top = (parseFloat(dot.getAttribute('cy')) - 8) + 'px';
            });
            dot.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
        });
    }

    // ── Admin stats rendering ─────────────────────────────────────────────

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
        tbody.innerHTML = runs.map((r) => {
            const badgeClass = r.status === 'succeeded' ? 'succeeded' : r.status === 'failed' ? 'failed' : 'pending';
            const dur = r.duration_seconds != null ? r.duration_seconds.toFixed(1) + 's' : '—';
            return (
                `<tr>` +
                `<td>${esc(r.task)}</td>` +
                `<td><span class="status-badge ${badgeClass}">${esc(r.status)}</span></td>` +
                `<td class="num">${dur}</td>` +
                `<td>${fmtTime(r.created_at)}</td>` +
                `</tr>`
            );
        }).join('');
    }

    function renderHealthGrid(health) {
        const grid = $id('health-grid');
        if (!grid) return;
        if (!health || health.length === 0) {
            grid.innerHTML = '<span class="empty-row">No data</span>';
            return;
        }
        const DAY_MS = 24 * 60 * 60 * 1000;
        grid.innerHTML = health.map((h) => {
            const staleClass = isStale(h.last_success, DAY_MS) ? ' stale' : '';
            return (
                `<div class="health-item${staleClass}">` +
                `<span class="task-name">${esc(h.task)}</span>` +
                `<span class="time-ago">${h.last_success ? timeAgo(h.last_success) : 'Never'}</span>` +
                `</div>`
            );
        }).join('');
    }

    function renderRejectionList(summary) {
        const list = $id('rejection-list');
        if (!list) return;
        if (!summary || summary.length === 0) {
            list.innerHTML = '<li class="empty-row">No data</li>';
            return;
        }
        list.innerHTML = summary.map((r) =>
            `<li><span class="reason-name">${esc(r.reason)}</span><span class="reason-count">${fmt(r.count)}</span></li>`
        ).join('');
    }

    // ── Data fetching ─────────────────────────────────────────────────────

    async function fetchPublicStats() {
        const ids = ['section-overview', 'section-freshness', 'section-pipeline', 'section-scores', 'section-companies', 'section-sources'];
        try {
            const data = await window.api.getPublicStats();
            ids.forEach(clearSectionError);
            renderPublicStats(data);
        } catch {
            ids.forEach((id) => setSectionError(id, 'Error loading — will retry'));
        }
    }

    async function fetchGrowthData() {
        try {
            const data = await window.api.getGrowthStats();
            clearSectionError('section-growth');
            renderGrowthChart(data.data_points);
        } catch {
            setSectionError('section-growth', 'Error loading growth data — will retry');
        }
    }

    function isAdminDenied(err) {
        return err && err.message && (
            err.message.includes('401') ||
            err.message.includes('403') ||
            err.message.includes('Authentication')
        );
    }

    async function fetchAdminStats() {
        try {
            const data = await window.api.getAdminStats();
            clearSectionError('section-admin');
            clearSectionError('section-app-health');
            renderAdminStats(data);
        } catch (err) {
            if (isAdminDenied(err)) {
                showAuthGate('Admin access required.');
            } else {
                setSectionError('section-admin', 'Error loading admin stats — will retry');
            }
        }
    }

    async function fetchAdminStatus() {
        try {
            const data = await window.api.getAdminStatus();
            clearSectionError('section-hero');
            clearSectionError('section-uptime');
            renderHeroTiles(data);
            renderHealthChecks(data.health || []);
            renderBetterStack(data.betterstack);
        } catch (err) {
            if (isAdminDenied(err)) {
                showAuthGate('Admin access required.');
            } else {
                setSectionError('section-hero', 'Error loading status — will retry');
            }
        }
    }

    async function fetchWorkflows() {
        try {
            const [workflows, failed] = await Promise.all([
                window.api.getGithubWorkflows(),
                window.api.getGithubFailedRuns(),
            ]);
            clearSectionError('section-workflows');
            renderWorkflowBadges(workflows);
            renderFailedRuns(failed);
        } catch (err) {
            if (isAdminDenied(err)) {
                showAuthGate('Admin access required.');
            } else {
                setSectionError('section-workflows', 'Error loading workflows — will retry');
            }
        }
    }

    async function fetchIssues() {
        try {
            const [data, counts] = await Promise.all([
                window.api.getGithubIssues(),
                window.api.getGithubIssueCounts(),
            ]);
            clearSectionError('section-issues');
            renderIssues(data, counts);
        } catch (err) {
            if (isAdminDenied(err)) {
                showAuthGate('Admin access required.');
            } else {
                setSectionError('section-issues', 'Error loading issues — will retry');
            }
        }
    }

    async function refreshAll() {
        if (els.lastUpdated) els.lastUpdated.textContent = 'Refreshing...';
        await checkApiHealth();
        await Promise.all([
            fetchPublicStats(),
            fetchGrowthData(),
            fetchAdminStats(),
            fetchAdminStatus(),
            fetchWorkflows(),
            fetchIssues(),
        ]);
        if (els.lastUpdated) els.lastUpdated.textContent = 'Updated ' + fmtTime(new Date());
    }

    // ── Polling ───────────────────────────────────────────────────────────

    function startPolling() {
        stopPolling();
        timerId = setInterval(() => {
            if (!document.hidden && !paused) refreshAll();
        }, REFRESH_INTERVAL);
    }

    function stopPolling() {
        if (timerId) { clearInterval(timerId); timerId = null; }
    }

    function togglePause() {
        paused = !paused;
        if (els.pauseBtn) els.pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause';
    }

    // ── Auth gate ─────────────────────────────────────────────────────────

    function showAuthGate(message) {
        els.authGate?.classList.remove('is-hidden');
        els.dashboard?.classList.add('is-hidden');
        stopPolling();
        if (message && els.authStatus) {
            els.authStatus.textContent = message;
            els.authStatus.classList.remove('is-hidden');
        }
    }

    function showDashboard() {
        els.authGate?.classList.add('is-hidden');
        els.dashboard?.classList.remove('is-hidden');
        refreshAll();
        startPolling();
    }

    function handleAuthSubmit(e) {
        e.preventDefault();
        const email = els.authEmail?.value?.trim();
        if (!email) return;
        const statusEl = els.authStatus;
        if (statusEl) statusEl.textContent = 'Sending…';
        window.api.requestMagicLink(email, 'admin')
            .then(() => {
                if (statusEl) statusEl.textContent = 'If that address is authorized, a sign-in link will arrive shortly.';
            })
            .catch((err) => {
                if (statusEl) statusEl.textContent = 'Error: ' + (err.message || 'Failed to send');
            });
    }

    // ── Visibility ────────────────────────────────────────────────────────

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !paused && window.api.isAuthenticated()) refreshAll();
    });

    // ── Init ──────────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', () => {
        els.refreshBtn?.addEventListener('click', refreshAll);
        els.pauseBtn?.addEventListener('click', togglePause);
        els.authForm?.addEventListener('submit', handleAuthSubmit);

        // Handle magic link token in URL
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        if (token) {
            window.api.verifyMagicLink(token)
                .then(() => {
                    const url = new URL(window.location);
                    url.searchParams.delete('token');
                    window.history.replaceState({}, '', url);
                    const verifiedUser = window.api.getCurrentUser();
                    if (verifiedUser?.is_admin) {
                        showDashboard();
                    } else {
                        showAuthGate('Admin access required.');
                    }
                })
                .catch(() => showAuthGate());
            return;
        }

        const user = window.api.getCurrentUser();
        if (window.api.isAuthenticated() && user?.is_admin) {
            showDashboard();
        } else {
            showAuthGate(user && !user.is_admin ? 'Admin access required.' : null);
        }
    });
})();
