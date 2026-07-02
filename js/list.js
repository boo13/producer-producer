(function () {
    'use strict';

    const DEFAULT_MIN_SCORE = 75;
    const PAGE_SIZE = 100;
    const MAX_PAGES = 50;
    const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
    const LIFECYCLE_DAYS = 21;
    const CATEGORIES = ['all', 'news', 'podcast', 'video', 'social'];
    const STATUS_FILTERS = [
        { key: 'all', label: 'All Jobs' },
        { key: 'saved', label: 'Saved' },
        { key: 'applied', label: 'Applied' },
    ];

    const CATEGORY_LABELS = {
        all: 'All',
        news: 'News',
        podcast: 'Podcast',
        video: 'Video',
        social: 'Social',
    };

    const state = {
        minScore: DEFAULT_MIN_SCORE,
        category: 'all',
        statusFilter: 'all',
        listings: [],
        pendingAuthEmail: null,
        pendingAuthContext: null,
        userConfig: null,
        savedIds: new Set(),
        passedIds: new Set(),
        appliedIds: new Set(),
        isMobile: window.matchMedia('(max-width: 767px)').matches,
    };

    var localStatusSynced = false;
    var localSetsLoaded = false;
    var scoreLoadTimer = null;
    var listingLoadGeneration = 0;

    const $id = (id) => document.getElementById(id);

    const els = {
        thresholdForm: $id('threshold-form'),
        minScoreInput: $id('min-score'),
        scoreValue: $id('score-value'),
        categoryChips: $id('category-chips'),
        statusChips: $id('status-chips'),
        statusFilterGroup: $id('status-filter-group'),
        refreshBtn: $id('refresh-btn'),
        connectionIndicator: $id('connection-indicator'),
        latencyText: $id('latency-text'),
        resultsCaption: $id('results-caption'),
        lastUpdated: $id('last-updated'),
        errorBanner: $id('error-banner'),
        summaryTotal: $id('summary-total'),
        summaryCompanies: $id('summary-companies'),
        summaryNew: $id('summary-new'),
        summary7d: $id('summary-7d'),
        companyList: $id('company-list'),
        companyTrack: $id('company-track'),
        skeletonList: $id('skeleton-list'),
        newsletterForm: $id('newsletter-form'),
        newsletterEmail: $id('newsletter-email'),
        newsletterStatus: $id('newsletter-status'),
        digestPreferences: $id('digest-preferences'),
        digestPreferencesCopy: $id('digest-preferences-copy'),
        digestPreferencesToggle: $id('digest-preferences-toggle'),
        digestPreferencesStatus: $id('digest-preferences-status'),
    };

    function isAuthenticated() {
        return Boolean(window.api && window.api.isAuthenticated && window.api.isAuthenticated());
    }

    function getMobileDigestBtn() {
        return document.getElementById('m-digest-btn');
    }

    function loadLocalSets() {
        ['savedIds', 'passedIds', 'appliedIds'].forEach(function(key) {
            try {
                var raw = localStorage.getItem('pp_' + key);
                if (raw) JSON.parse(raw).forEach(function(id) { state[key].add(id); });
            } catch(e) {}
        });
        localSetsLoaded = true;
    }

    function saveLocalSet(key) {
        try {
            localStorage.setItem('pp_' + key, JSON.stringify(Array.from(state[key])));
        } catch(e) {}
    }

    function syncLocalStatusToServer() {
        if (!localSetsLoaded || localStatusSynced || !isAuthenticated() || !window.api.updateOpportunityStatus) return;
        localStatusSynced = true;

        var calls = [];
        state.savedIds.forEach(function(id) {
            calls.push(window.api.updateOpportunityStatus(id, 'todo').catch(function(err) {
                console.error('Failed to sync saved status:', err);
            }));
        });
        state.appliedIds.forEach(function(id) {
            calls.push(window.api.updateOpportunityStatus(id, 'applied').catch(function(err) {
                console.error('Failed to sync applied status:', err);
            }));
        });
        state.passedIds.forEach(function(id) {
            calls.push(window.api.updateOpportunityStatus(id, 'ignored').catch(function(err) {
                console.error('Failed to sync passed status:', err);
            }));
        });

        return Promise.all(calls);
    }

    function clampScore(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return DEFAULT_MIN_SCORE;
        return Math.max(0, Math.min(100, Math.round(num)));
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
    }

    function safeExternalUrl(url) {
        if (!url) return null;
        try {
            var parsed = new URL(String(url), window.location.href);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
        } catch (e) {}
        return null;
    }

    function setInlineStatus(el, message, type) {
        if (!el) return;
        el.textContent = message;
        el.className = 'newsletter-status newsletter-status--' + type;
    }

    function getInitialMinScore() {
        const params = new URLSearchParams(window.location.search);
        const fromQuery = params.get('min_score');
        return fromQuery == null ? DEFAULT_MIN_SCORE : clampScore(fromQuery);
    }

    function getInitialCategory() {
        const params = new URLSearchParams(window.location.search);
        const category = String(params.get('category') || 'all').toLowerCase();
        return CATEGORIES.includes(category) ? category : 'all';
    }

    function updateFiltersInUrl() {
        const url = new URL(window.location.href);
        url.searchParams.set('min_score', String(state.minScore));
        if (state.category === 'all') {
            url.searchParams.delete('category');
        } else {
            url.searchParams.set('category', state.category);
        }
        window.history.replaceState({}, '', url);
    }

    function setScoreControlValue(value) {
        var score = clampScore(value);
        if (els.minScoreInput) els.minScoreInput.value = String(score);
        if (els.scoreValue) els.scoreValue.textContent = String(score);
        return score;
    }

    function commitMinScore(value, delay) {
        state.minScore = setScoreControlValue(value);
        updateFiltersInUrl();

        if (scoreLoadTimer) clearTimeout(scoreLoadTimer);
        scoreLoadTimer = setTimeout(function() {
            loadListings();
        }, delay || 0);
    }

    function valueFromRangePointer(input, clientX) {
        var rect = input.getBoundingClientRect();
        if (!rect.width) return clampScore(input.value);
        var ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        var min = Number(input.min || 0);
        var max = Number(input.max || 100);
        var step = Number(input.step || 1);
        var raw = min + ratio * (max - min);
        return Math.round(raw / step) * step;
    }

    function fmtInteger(value) {
        return Number(value || 0).toLocaleString('en-US');
    }

    function fmtDateTime(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    }

    function fmtDate(value) {
        if (!value) return 'Date unknown';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Date unknown';
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    function formatSalary(min, max, salaryRaw) {
        const formatAmount = (amount) => {
            if (!amount) return null;
            return amount >= 1000 ? `$${Math.round(amount / 1000)}k` : `$${amount}`;
        };

        const minLabel = formatAmount(min);
        const maxLabel = formatAmount(max);

        if (minLabel && maxLabel) {
            return `${minLabel} - ${maxLabel}`;
        }
        if (minLabel || maxLabel) {
            return minLabel || maxLabel;
        }
        if (salaryRaw && String(salaryRaw).trim()) {
            return String(salaryRaw).trim();
        }
        return 'Salary not listed';
    }

    function normalizeDescription(rawDescription) {
        if (!rawDescription) return 'No description available.';

        // DOMParser documents are inert — unlike a detached div's innerHTML,
        // <img onerror> in ATS-supplied HTML can never execute here.
        const doc = new DOMParser().parseFromString(String(rawDescription), 'text/html');
        const text = doc.body ? (doc.body.textContent || '') : '';
        const normalized = text
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();

        return normalized || 'No description available.';
    }

    function stripLeadingSectionHeading(text) {
        var normalized = String(text || '').replace(/\r\n/g, '\n').trim();
        var lines = normalized.split('\n').map(function(line) { return line.trim(); }).filter(Boolean);

        if (lines.length > 1) {
            var first = lines[0].replace(/[:：-]+$/, '');
            var words = first.split(/\s+/);
            var looksLikeHeading = first.length <= 48
                && words.length <= 6
                && /^[A-Z][A-Za-z&/ ]+$/.test(first);
            if (looksLikeHeading) {
                return lines.slice(1).join(' ').trim();
            }
        }

        return normalized.replace(/\s+/g, ' ');
    }

    function splitDetailLines(value) {
        if (!value) return [];
        return String(value)
            .split(/\n+|•+/)
            .map(stripLeadingSectionHeading)
            .map(function(item) { return item.replace(/^[-*]\s*/, '').trim(); })
            .filter(function(item) { return item.length > 0 && item.length < 220; });
    }

    function getRoleSummaryBullets(opp) {
        var summary = splitDetailLines(opp.ai_summary);
        if (summary.length) return summary.slice(0, 4);

        var requirements = splitDetailLines(opp.requirements);
        if (requirements.length) return requirements.slice(0, 4);

        return [];
    }

    function isNewListing(opportunity) {
        const reference = opportunity.first_seen || opportunity.posted_date;
        if (!reference) return false;

        const timestamp = new Date(reference).getTime();
        if (Number.isNaN(timestamp)) return false;

        return (Date.now() - timestamp) <= NEW_WINDOW_MS;
    }

    function jobAge(opp) {
        const ref = opp.first_seen || opp.posted_date;
        if (!ref) return null;
        const timestamp = new Date(ref).getTime();
        if (Number.isNaN(timestamp)) return null;
        return Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
    }

    function freshColor(t) {
        const normalized = Math.max(0, Math.min(1, t));
        if (normalized < 0.5) {
            const k = normalized / 0.5;
            return `rgb(${Math.round(90 + k * 138)},${Math.round(107 - k * 7)},${Math.round(45 - k * 17)})`;
        }
        const k = (normalized - 0.5) / 0.5;
        return `rgb(${Math.round(228 - k * 90)},${Math.round(100 - k * 64)},${Math.round(28 - k * 4)})`;
    }

    function ageLabel(age) {
        if (age <= 1) return '◆ FRESH';
        if (age >= LIFECYCLE_DAYS - 3) return 'EXPIRES SOON';
        if (age >= 14) return 'STALE';
        return `${age}d OLD`;
    }

    function getLocation(opp) {
        if (opp.city && opp.state) return `${opp.city}, ${opp.state}`;
        if (opp.city) return opp.city;
        if (opp.state) return opp.state;
        if (opp.is_remote) return 'Remote';
        if (opp.location_raw) return opp.location_raw;
        return null;
    }

    function isHot(opp) {
        return (opp.score || 0) >= 90 && jobAge(opp) <= 2;
    }

    function getBullets(opp) {
        const roleSummary = getRoleSummaryBullets(opp);
        if (roleSummary.length) return roleSummary;

        const cls = opp.sentence_classifications;
        if (cls && cls.length) {
            const highlights = cls
                .filter(function(item) { return item.tier === 'highlight' && item.text; })
                .map(function(item) { return stripLeadingSectionHeading(item.text); })
                .filter(Boolean)
                .slice(0, 4);
            if (highlights.length) return highlights;
        }

        const rawDesc = opp.description_cleaned || opp.description || '';
        if (!rawDesc) return [];
        const desc = normalizeDescription(rawDesc);
        if (desc === 'No description available.') return [];
        return desc
            .split(/[.!?]+\s+/)
            .map(stripLeadingSectionHeading)
            .filter(function(sentence) { return sentence.length > 20 && sentence.length < 220; })
            .slice(0, 4);
    }

    function normalizeMediaCategory(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z]+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    function categoryFromStructuredFields(opp) {
        var category = normalizeMediaCategory(opp.media_category);
        if (category) return category;

        var inferred = normalizeMediaCategory(opp.media_category_inferred);
        if (inferred) return inferred;

        return null;
    }

    function matchesCategory(opp, cat) {
        if (cat === 'all') return true;
        var structuredCategory = categoryFromStructuredFields(opp);
        var map = {
            news: ['news', 'editorial'],
            podcast: ['podcast'],
            video: ['video', 'television', 'film', 'streaming'],
            social: ['social'],
        };
        var categories = map[cat] || [];

        if (structuredCategory) {
            return categories.includes(structuredCategory);
        }

        var text = ((opp.title || '') + ' ' + (opp.department || '')).toLowerCase();
        var fallback = {
            news: ['news', 'journalist', 'reporter', 'news editor', 'assignment editor', 'anchor', 'broadcast'],
            podcast: ['podcast', 'audio producer', 'radio producer'],
            video: ['video', 'film', 'television', 'showrunner', 'cinematographer', 'director of photography'],
            social: ['social', 'tiktok', 'instagram', 'short-form', 'audience editor'],
        };
        return (fallback[cat] || []).some(function(kw) { return text.includes(kw); });
    }

    function renderDescription(opportunity, container) {
        var classifications = opportunity.sentence_classifications;

        if (!classifications || !classifications.length) {
            var p = document.createElement('p');
            p.className = 'listing-description tier-normal';
            p.textContent = normalizeDescription(opportunity.description_cleaned || opportunity.description || '');
            container.appendChild(p);
            return;
        }

        var groups = [];
        var currentGroup = null;

        classifications.forEach(function(item) {
            if (currentGroup && currentGroup.tier === item.tier) {
                currentGroup.sentences.push(item.text);
            } else {
                currentGroup = { tier: item.tier, sentences: [item.text] };
                groups.push(currentGroup);
            }
        });

        groups.forEach(function(group) {
            var p = document.createElement('p');
            p.className = 'listing-description';

            if (group.tier === 'highlight') {
                group.sentences.forEach(function(sentence, i) {
                    if (i > 0) p.appendChild(document.createTextNode(' '));
                    var span = document.createElement('span');
                    span.className = 'tier-highlight';
                    span.textContent = sentence;
                    p.appendChild(span);
                });
            } else {
                p.classList.add('tier-' + group.tier.replace('_', '-'));
                p.textContent = group.sentences.join(' ');
            }

            container.appendChild(p);
        });
    }

    async function checkHealth() {
        const dot = els.connectionIndicator?.querySelector('.indicator-dot');
        const text = els.connectionIndicator?.querySelector('.indicator-text');

        try {
            const start = performance.now();
            await window.api.healthCheck();
            const latency = Math.round(performance.now() - start);

            if (dot) dot.className = 'indicator-dot online';
            if (text) text.textContent = 'Online';
            if (els.latencyText) els.latencyText.textContent = `${latency}ms`;
        } catch {
            if (dot) dot.className = 'indicator-dot offline';
            if (text) text.textContent = 'Offline';
            if (els.latencyText) els.latencyText.textContent = '';
        }
    }

    function setLoading(isLoading) {
        if (els.refreshBtn) els.refreshBtn.disabled = isLoading;
        if (!els.skeletonList) return;

        if (isLoading && !state.isMobile) {
            els.skeletonList.classList.remove('is-hidden');
        } else {
            els.skeletonList.classList.add('is-hidden');
        }
    }

    function showError(message) {
        if (els.errorBanner) {
            els.errorBanner.textContent = message;
            els.errorBanner.classList.remove('is-hidden');
        }
        var mErr = document.getElementById('m-error');
        if (mErr) {
            var diagnostics = window.api && window.api.getNetworkDiagnostics
                ? window.api.getNetworkDiagnostics()
                : null;
            mErr.textContent = diagnostics && diagnostics.activeBaseUrl
                ? message + ' (API: ' + diagnostics.activeBaseUrl + ')'
                : message;
            mErr.classList.remove('is-hidden');
        }
    }

    function clearError() {
        if (els.errorBanner) {
            els.errorBanner.textContent = '';
            els.errorBanner.classList.add('is-hidden');
        }
        var mErr = document.getElementById('m-error');
        if (mErr) {
            mErr.textContent = '';
            mErr.classList.add('is-hidden');
        }
    }

    function dedupeListings(listings) {
        const seen = new Set();
        return listings.filter((item) => {
            if (!item || item.id == null) return false;
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });
    }

    function normalizeUserOpportunity(item) {
        if (!item || !item.opportunity) return null;

        return {
            ...item.opportunity,
            score: item.score ?? item.opportunity.score,
            user_status: item.status,
            user_opportunity_id: item.id,
        };
    }

    async function fetchAllListings(minScore) {
        if (state.statusFilter !== 'all' && isAuthenticated()) {
            var statusMap = { saved: 'todo', applied: 'applied' };
            var params = {
                status_filter: statusMap[state.statusFilter],
                limit: PAGE_SIZE,
            };
            var results = await window.api.getUserOpportunities(params);
            var normalized = (results || []).map(normalizeUserOpportunity).filter(Boolean);

            normalized.forEach(function(opp) {
                if (opp.user_status === 'todo') state.savedIds.add(opp.id);
                if (opp.user_status === 'applied') state.appliedIds.add(opp.id);
            });
            saveLocalSet('savedIds');
            saveLocalSet('appliedIds');

            return normalized;
        }

        const items = [];

        for (let page = 0; page < MAX_PAGES; page += 1) {
            const batch = await window.api.getOpportunityFeed({
                min_score: minScore,
                limit: PAGE_SIZE,
                offset: items.length,
            });

            if (!Array.isArray(batch) || batch.length === 0) break;

            items.push(...batch);
            if (batch.length < PAGE_SIZE) break;
        }

        return dedupeListings(items);
    }

    function sortListings(listings) {
        return [...listings].sort((a, b) => {
            const scoreDelta = (b.score || 0) - (a.score || 0);
            if (scoreDelta !== 0) return scoreDelta;

            const timeA = new Date(a.first_seen || a.posted_date || 0).getTime() || 0;
            const timeB = new Date(b.first_seen || b.posted_date || 0).getTime() || 0;
            return timeB - timeA;
        });
    }

    function buildFreshBar(opp) {
        var age = jobAge(opp);
        if (age === null) return null;
        var t = Math.min(1, age / LIFECYCLE_DAYS);
        var color = freshColor(t);
        var label = ageLabel(age);

        var fresh = document.createElement('div');
        fresh.className = 'pp-fresh';

        var freshLbl = document.createElement('span');
        freshLbl.className = 'pp-fresh-lbl';
        freshLbl.style.color = color;
        freshLbl.textContent = label;
        fresh.appendChild(freshLbl);

        var track = document.createElement('div');
        track.className = 'pp-fresh-track';
        fresh.appendChild(track);

        var fill = document.createElement('div');
        fill.className = 'pp-fresh-fill';
        fill.style.width = (t * 100) + '%';
        fill.style.background = color;
        track.appendChild(fill);

        [7, 14, 21].forEach(function(day) {
            var tick = document.createElement('div');
            tick.className = 'pp-fresh-tick';
            tick.style.left = ((day / LIFECYCLE_DAYS) * 100) + '%';
            track.appendChild(tick);
        });

        var marker = document.createElement('div');
        marker.className = 'pp-fresh-marker';
        marker.style.left = (t * 100) + '%';
        marker.style.background = color;
        track.appendChild(marker);

        return fresh;
    }

    function buildFeedActions(opp) {
        var div = document.createElement('div');
        div.className = 'pp-actions';

        if (isAuthenticated()) {
            var saveBtn = document.createElement('button');
            saveBtn.className = 'pp-action-btn pp-action-save' + (state.savedIds.has(opp.id) ? ' is-active' : '');
            saveBtn.type = 'button';
            saveBtn.textContent = 'Save';
            saveBtn.onclick = function(e) {
                e.stopPropagation();
                recordStatus(opp, 'todo', saveBtn);
            };

            var applyBtn = document.createElement('button');
            applyBtn.className = 'pp-action-btn pp-action-apply' + (state.appliedIds.has(opp.id) ? ' is-active' : '');
            applyBtn.type = 'button';
            applyBtn.textContent = 'Applied';
            applyBtn.onclick = function(e) {
                e.stopPropagation();
                recordStatus(opp, 'applied', applyBtn);
            };

            var passBtn = document.createElement('button');
            passBtn.className = 'pp-action-btn pp-action-pass';
            passBtn.type = 'button';
            passBtn.textContent = 'Pass';
            passBtn.onclick = function(e) {
                e.stopPropagation();
                recordStatus(opp, 'ignored', passBtn);
                renderListings();
            };

            div.appendChild(saveBtn);
            div.appendChild(applyBtn);
            div.appendChild(passBtn);
        }

        var link = document.createElement('a');
        link.className = 'pp-action-link';
        link.href = safeExternalUrl(opp.url) || '#';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'View original ↗';
        div.appendChild(link);
        return div;
    }

    function buildSwipeRow() {
        var row = document.createElement('div');
        row.className = 'pp-swipe-row';

        var pass = document.createElement('div');
        pass.className = 'pp-swipe-row-pass';
        pass.textContent = '← swipe to pass';

        var mid = document.createElement('div');
        mid.className = 'pp-swipe-row-mid';

        var save = document.createElement('div');
        save.className = 'pp-swipe-row-save';
        save.textContent = 'save →';

        row.appendChild(pass);
        row.appendChild(mid);
        row.appendChild(save);
        return row;
    }

    function recordStatus(opp, status, btn) {
        if (status === 'todo') {
            state.savedIds.add(opp.id);
            state.passedIds.delete(opp.id);
            saveLocalSet('savedIds');
            saveLocalSet('passedIds');
        }
        if (status === 'applied') {
            state.appliedIds.add(opp.id);
            state.savedIds.delete(opp.id);
            state.passedIds.delete(opp.id);
            saveLocalSet('appliedIds');
            saveLocalSet('savedIds');
            saveLocalSet('passedIds');
        }
        if (status === 'ignored') {
            state.passedIds.add(opp.id);
            state.savedIds.delete(opp.id);
            state.appliedIds.delete(opp.id);
            saveLocalSet('passedIds');
            saveLocalSet('savedIds');
            saveLocalSet('appliedIds');
        }

        if (btn) btn.classList.add('is-active');
        updateMobileCounts();

        if (isAuthenticated() && window.api.updateOpportunityStatus) {
            window.api.updateOpportunityStatus(opp.id, status, { score: opp.score }).catch(console.error);
        }
    }

    function createListingCard(opp, mode) {
        var wrap = document.createElement('div');
        wrap.className = 'pp-card-wrap';
        wrap.setAttribute('data-opportunity-id', opp.id);

        var scoreEl = document.createElement('div');
        scoreEl.className = 'pp-score' + (isHot(opp) ? ' is-hot' : '');
        scoreEl.textContent = Math.round(opp.score || 0);
        wrap.appendChild(scoreEl);

        if (mode === 'swipe') {
            var swipeBg = document.createElement('div');
            swipeBg.className = 'pp-swipe-bg';
            wrap.appendChild(swipeBg);
        }

        var card = document.createElement('div');
        card.className = 'pp-card paper-card';

        var head = document.createElement('div');
        head.className = 'pp-card-head';

        var titleArea = document.createElement('div');
        titleArea.className = 'pp-title-area';

        var title = document.createElement('h2');
        title.className = 'pp-card-title';
        title.textContent = opp.title || 'Untitled role';
        titleArea.appendChild(title);

        var coRow = document.createElement('div');
        coRow.className = 'pp-co-row';

        var coName = document.createElement('span');
        coName.className = 'pp-co-name';
        coName.textContent = opp.company_name || 'Unknown Company';

        var coTag = document.createElement('span');
        coTag.className = 'pp-co-tag';
        coTag.textContent = getLocation(opp) || (opp.source ? opp.source.replace(/_/g, ' ') : '');

        coRow.appendChild(coName);
        coRow.appendChild(coTag);
        titleArea.appendChild(coRow);

        var dataGrid = document.createElement('div');
        dataGrid.className = 'pp-data-grid';

        var sal = formatSalary(opp.salary_min, opp.salary_max, opp.salary_raw);
        appendDataCell(dataGrid, 'pp-data-lbl', 'SALARY');
        appendDataCell(dataGrid, 'pp-data-sal', sal);
        appendDataCell(dataGrid, 'pp-data-lbl', 'LOCATION');
        appendDataCell(dataGrid, 'pp-data-loc', getLocation(opp) || '—');
        titleArea.appendChild(dataGrid);

        head.appendChild(titleArea);
        var freshBar = buildFreshBar(opp);
        if (freshBar) head.appendChild(freshBar);
        card.appendChild(head);

        var body = document.createElement('div');
        body.className = 'pp-card-body';

        var bullets = getBullets(opp);
        if (bullets.length) {
            var ul = document.createElement('ul');
            ul.className = 'pp-bullets';
            bullets.forEach(function(text) {
                var li = document.createElement('li');
                li.textContent = text;
                ul.appendChild(li);
            });
            body.appendChild(ul);
        } else if (mode === 'feed') {
            var description = document.createElement('div');
            description.className = 'pp-description';
            renderDescription(opp, description);
            body.appendChild(description);
        }

        if (mode === 'feed') {
            body.appendChild(buildFeedActions(opp));
        }

        if (mode === 'swipe') {
            var readBtn = document.createElement('button');
            readBtn.className = 'pp-read-btn';
            readBtn.type = 'button';
            readBtn.textContent = 'Read full posting →';
            readBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                openOverlay(opp);
            });
            body.appendChild(readBtn);
            body.appendChild(buildSwipeRow());
        }

        card.appendChild(body);
        wrap.appendChild(card);

        if (mode === 'swipe') {
            var saveStamp = document.createElement('div');
            saveStamp.className = 'pp-stamp for-save';
            saveStamp.textContent = 'SAVE';
            var passStamp = document.createElement('div');
            passStamp.className = 'pp-stamp for-pass';
            passStamp.textContent = 'PASS';
            card.appendChild(saveStamp);
            card.appendChild(passStamp);
        }

        card.addEventListener('click', function(e) {
            if (e.target.closest('a, button, .pp-stamp')) return;
            body.classList.toggle('is-open');
            card.classList.toggle('is-expanded', body.classList.contains('is-open'));
        });

        if (mode === 'swipe') {
            attachSwipe(wrap, opp);
        }

        return wrap;
    }

    function appendDataCell(parent, className, text) {
        var span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        parent.appendChild(span);
    }

    function getFilteredListings() {
        var authed = isAuthenticated();

        return state.listings.filter(function(opp) {
            if (state.statusFilter === 'all' && state.passedIds.has(opp.id)) return false;

            if (!authed) {
                if (state.statusFilter === 'saved' && !state.savedIds.has(opp.id)) return false;
                if (state.statusFilter === 'applied' && !state.appliedIds.has(opp.id)) return false;
            }

            return matchesCategory(opp, state.category);
        });
    }

    function getEmptyStateCopy() {
        var status = state.statusFilter;
        var authed = isAuthenticated();

        if (status === 'saved') {
            return authed
                ? { title: 'No saved jobs yet.', body: 'Saved listings will collect here.' }
                : { title: 'Saved jobs require sign in.', body: 'Your saved listings will appear here after account access.' };
        }

        if (status === 'applied') {
            return authed
                ? { title: 'No applied jobs yet.', body: 'Jobs marked Applied will collect here.' }
                : { title: 'Applied jobs require sign in.', body: 'Your applied listings will appear here after account access.' };
        }

        if (state.category !== 'all') {
            return {
                title: 'No listings in this category right now.',
                body: 'No current matches at this score.',
            };
        }

        return {
            title: 'No listings match these filters right now.',
            body: 'Fresh listings are pulled at dawn.',
        };
    }

    function clearListingList() {
        if (!els.companyList) return;
        Array.from(els.companyList.children).forEach(function(child) {
            if (child.id !== 'skeleton-list') child.remove();
        });
    }

    function clearMobileFeed() {
        var feed = document.getElementById('m-feed');
        if (feed) feed.innerHTML = '';
    }

    function renderListings() {
        var filtered = getFilteredListings();

        if (state.isMobile) {
            clearListingList();
            var feed = document.getElementById('m-feed');
            if (!feed) return;
            feed.innerHTML = '';

            if (!filtered.length) {
                var emptyCopy = getEmptyStateCopy();
                var empty = document.createElement('div');
                empty.className = 'm-empty';
                var emptyTitle = document.createElement('div');
                emptyTitle.className = 'm-empty-title';
                emptyTitle.textContent = emptyCopy.title;
                var emptySub = document.createElement('div');
                emptySub.className = 'm-empty-sub';
                emptySub.textContent = emptyCopy.body;
                empty.appendChild(emptyTitle);
                empty.appendChild(emptySub);
                feed.appendChild(empty);
                updateMobileCounts();
                return;
            }

            filtered.forEach(function(opp) {
                feed.appendChild(createListingCard(opp, 'swipe'));
            });
            updateMobileCounts();
            return;
        }

        if (!els.companyList) return;
        clearMobileFeed();
        if (els.skeletonList) els.skeletonList.classList.add('is-hidden');
        clearListingList();

        if (!filtered.length) {
            var copy = getEmptyStateCopy();
            var desktopEmpty = document.createElement('p');
            desktopEmpty.className = 'empty-state';
            desktopEmpty.textContent = copy.title + ' ' + copy.body;
            els.companyList.appendChild(desktopEmpty);
            updateResultsCaption(0);
            return;
        }

        filtered.forEach(function(opp, index) {
            var card = createListingCard(opp, 'feed');
            card.style.animationDelay = Math.min(index * 25, 350) + 'ms';
            els.companyList.appendChild(card);
        });

        updateResultsCaption(filtered.length);
    }

    function updateResultsCaption(count) {
        if (!els.resultsCaption) return;

        if (state.listings.length === 0) {
            els.resultsCaption.textContent = `No active listings found at score ${state.minScore}+`;
            return;
        }

        els.resultsCaption.textContent =
            `Showing ${fmtInteger(count)} of ${fmtInteger(state.listings.length)} active listings at score ${state.minScore}+`;
    }

    function updateSummary() {
        const totalListings = state.listings.length;
        const companyCount = new Set(
            state.listings.map((opp) => (opp.company_name || 'Unknown Company').trim() || 'Unknown Company')
        ).size;
        const newCount = state.listings.filter(isNewListing).length;

        if (els.summaryTotal) els.summaryTotal.textContent = fmtInteger(totalListings);
        if (els.summaryCompanies) els.summaryCompanies.textContent = fmtInteger(companyCount);
        if (els.summaryNew) els.summaryNew.textContent = fmtInteger(newCount);
    }

    function renderFeaturedCompanies() {
        if (!els.companyTrack) return;

        const counts = {};
        state.listings.forEach(function(opp) {
            const name = (opp.company_name || '').trim();
            if (!name) return;
            counts[name] = (counts[name] || 0) + 1;
        });

        const sorted = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);

        if (sorted.length === 0) {
            els.companyTrack.innerHTML = '<span class="company-placeholder">New listings daily.</span>';
            return;
        }

        els.companyTrack.textContent = sorted.map(function(item) { return item[0]; }).join(', ');
    }

    async function loadListings() {
        if (!window.api || typeof window.api.getOpportunityFeed !== 'function') {
            showError('API client unavailable. Unable to load listings.');
            return;
        }

        var generation = ++listingLoadGeneration;
        var requestedMinScore = state.minScore;
        setLoading(true);
        clearError();

        try {
            const listings = await fetchAllListings(requestedMinScore);
            if (generation !== listingLoadGeneration) return;
            state.listings = sortListings(listings);
            renderListings();
            renderFeaturedCompanies();
            updateSummary();
            if (els.lastUpdated) {
                els.lastUpdated.textContent = `Updated ${fmtDateTime(new Date())}`;
            }
        } catch (error) {
            if (generation !== listingLoadGeneration) return;
            console.error('Failed to load listings:', error);
            state.listings = [];
            renderListings();
            updateSummary();
            showError('Could not load listings from the API. Please try refresh.');
        } finally {
            if (generation === listingLoadGeneration) {
                setLoading(false);
                await checkHealth();
            }
        }
    }

    function setCategory(category) {
        if (!CATEGORIES.includes(category) || category === state.category) return;
        state.category = category;
        updateFiltersInUrl();
        syncFilterControls();
        renderListings();
    }

    function setStatusFilter(status) {
        if (!STATUS_FILTERS.some(function(item) { return item.key === status; }) || status === state.statusFilter) return;
        state.statusFilter = status;
        syncFilterControls();
        if (isAuthenticated()) {
            loadListings();
        } else {
            renderListings();
        }
    }

    function syncFilterControls() {
        document.querySelectorAll('[data-category]').forEach(function(chip) {
            chip.classList.toggle('is-active', chip.getAttribute('data-category') === state.category);
        });

        document.querySelectorAll('[data-status]').forEach(function(chip) {
            chip.classList.toggle('is-active', chip.getAttribute('data-status') === state.statusFilter);
        });
    }

    function updateStatusVisibility() {
        syncFilterControls();
    }

    function renderMobileFilters() {
        var el = document.getElementById('m-filters');
        if (!el) return;

        el.innerHTML = '';

        CATEGORIES.forEach(function(key) {
            var pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'm-filter-pill';
            pill.setAttribute('data-category', key);
            pill.textContent = CATEGORY_LABELS[key] || key;
            pill.addEventListener('click', function() {
                setCategory(key);
            });
            el.appendChild(pill);
        });

        STATUS_FILTERS.forEach(function(filter) {
            var pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'm-filter-pill m-filter-pill--status';
            pill.setAttribute('data-status', filter.key);
            pill.setAttribute('data-mobile-status', 'true');
            pill.textContent = filter.label;
            pill.addEventListener('click', function() {
                setStatusFilter(filter.key);
            });
            el.appendChild(pill);
        });

        syncFilterControls();
        updateStatusVisibility();
    }

    function updateMobileCounts() {
        var sEl = document.getElementById('m-saved-ct');
        var aEl = document.getElementById('m-applied-ct');
        if (sEl) sEl.textContent = state.savedIds.size + ' saved';
        if (aEl) aEl.textContent = state.appliedIds.size + ' applied';
    }

    function bindEvents() {
        els.minScoreInput?.addEventListener('input', (e) => {
            var score = setScoreControlValue(e.target.value);
            if (scoreLoadTimer) clearTimeout(scoreLoadTimer);
            scoreLoadTimer = setTimeout(function() {
                state.minScore = score;
                updateFiltersInUrl();
                loadListings();
            }, 220);
        });

        els.minScoreInput?.addEventListener('change', (e) => {
            commitMinScore(e.target.value, 0);
        });

        els.minScoreInput?.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            var input = e.currentTarget;
            input.focus({ preventScroll: true });
            commitMinScore(valueFromRangePointer(input, e.clientX), 180);
        });

        els.categoryChips?.addEventListener('click', (e) => {
            const chip = e.target.closest('.chip');
            if (!chip) return;
            setCategory(chip.dataset.category);
        });

        els.statusChips?.addEventListener('click', function(e) {
            var chip = e.target.closest('.chip');
            if (!chip) return;
            setStatusFilter(chip.getAttribute('data-status'));
        });

        els.refreshBtn?.addEventListener('click', () => {
            loadListings();
        });

        els.newsletterForm?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = els.newsletterEmail?.value?.trim();
            if (!els.newsletterStatus) return;
            if (!email || !isValidEmail(email)) {
                setInlineStatus(els.newsletterStatus, 'Please enter a valid email address.', 'error');
                els.newsletterEmail?.focus();
                return;
            }

            const submitBtn = els.newsletterForm.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;

            try {
                await window.api.requestMagicLink(email, null, true);
                state.pendingAuthEmail = email;
                state.pendingAuthContext = 'newsletter';
                els.newsletterStatus.textContent = 'Check your inbox — enter the 6-digit code below.';
                els.newsletterStatus.className = 'newsletter-status newsletter-status--success';
                if (els.newsletterEmail) els.newsletterEmail.value = '';
                var otpSection = document.getElementById('otp-section');
                if (otpSection) otpSection.classList.remove('is-hidden');
            } catch (err) {
                var message = err && /email/i.test(String(err.message || ''))
                    ? 'Please enter a valid email address.'
                    : 'Could not send a subscription code. Please try again.';
                setInlineStatus(els.newsletterStatus, message, 'error');
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });

        els.digestPreferencesToggle?.addEventListener('click', toggleDigestPreference);
        getMobileDigestBtn()?.addEventListener('click', toggleDigestPreference);
    }

    function renderDigestPreference() {
        if (!state.userConfig) return;

        var enabled = Boolean(state.userConfig.digest_enabled);
        var mobileDigestBtn = getMobileDigestBtn();
        els.digestPreferences?.classList.remove('is-hidden');
        mobileDigestBtn?.classList.remove('is-hidden');

        if (els.digestPreferencesCopy) {
            els.digestPreferencesCopy.textContent = enabled
                ? 'You’re subscribed to new-listing emails.'
                : 'You’re signed in, but not subscribed to email updates.';
        }
        if (els.digestPreferencesToggle) {
            els.digestPreferencesToggle.textContent = enabled ? 'Unsubscribe' : 'Subscribe';
            els.digestPreferencesToggle.disabled = false;
        }
        if (mobileDigestBtn) {
            mobileDigestBtn.textContent = enabled ? 'Digest on' : 'Digest off';
            mobileDigestBtn.disabled = false;
        }
    }

    async function loadDigestPreference() {
        var mobileDigestBtn = getMobileDigestBtn();
        if (!isAuthenticated()) {
            state.userConfig = null;
            els.digestPreferences?.classList.add('is-hidden');
            mobileDigestBtn?.classList.add('is-hidden');
            return;
        }

        els.digestPreferences?.classList.remove('is-hidden');
        mobileDigestBtn?.classList.remove('is-hidden');
        if (els.digestPreferencesCopy) {
            els.digestPreferencesCopy.textContent = 'Loading your email preference…';
        }
        if (els.digestPreferencesToggle) els.digestPreferencesToggle.disabled = true;
        if (mobileDigestBtn) {
            mobileDigestBtn.textContent = 'Digest…';
            mobileDigestBtn.disabled = true;
        }

        try {
            state.userConfig = await window.api.getUserConfig();
            renderDigestPreference();
        } catch {
            if (els.digestPreferencesCopy) {
                els.digestPreferencesCopy.textContent = 'Email preferences are temporarily unavailable.';
            }
            if (mobileDigestBtn) {
                mobileDigestBtn.textContent = 'Digest';
            }
        }
    }

    async function toggleDigestPreference() {
        if (!state.userConfig) {
            await loadDigestPreference();
            if (!state.userConfig) return;
        }

        var nextEnabled = !state.userConfig.digest_enabled;
        var mobileDigestBtn = getMobileDigestBtn();
        if (els.digestPreferencesToggle) els.digestPreferencesToggle.disabled = true;
        if (mobileDigestBtn) mobileDigestBtn.disabled = true;

        try {
            state.userConfig = await window.api.updateUserConfig({
                version: state.userConfig.version,
                digest_enabled: nextEnabled,
            });
            renderDigestPreference();
            if (els.digestPreferencesStatus) {
                els.digestPreferencesStatus.textContent = nextEnabled
                    ? 'Daily digest subscribed.'
                    : 'Daily digest unsubscribed.';
                els.digestPreferencesStatus.className = 'newsletter-status newsletter-status--success';
            }
        } catch {
            if (els.digestPreferencesStatus) {
                els.digestPreferencesStatus.textContent = 'Could not update your email preference.';
                els.digestPreferencesStatus.className = 'newsletter-status newsletter-status--error';
            }
            await loadDigestPreference();
        }
    }

    function handleAuthChanged(detail) {
        var isAuth = detail && detail.isAuthenticated;
        var user = detail && detail.user;

        var greeting = document.getElementById('user-greeting');
        var signInBtn = document.getElementById('sign-in-btn');
        var signOutBtn = document.getElementById('sign-out-btn');
        var mobileSignInBtn = document.getElementById('m-sign-in-btn');
        var mobileAccountBtn = document.getElementById('m-account-btn');

        if (isAuth && user) {
            if (greeting) greeting.textContent = user.email || '';
            greeting?.classList.remove('is-hidden');
            signOutBtn?.classList.remove('is-hidden');
            signInBtn?.classList.add('is-hidden');
            mobileSignInBtn?.classList.add('is-hidden');
            if (mobileAccountBtn) {
                var emailName = String(user.email || '').split('@')[0];
                var initials = emailName
                    .split(/[._-]+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map(function(part) { return part.charAt(0).toUpperCase(); })
                    .join('');
                mobileAccountBtn.textContent = initials || 'ME';
                mobileAccountBtn.classList.remove('is-hidden');
            }
        } else {
            greeting?.classList.add('is-hidden');
            signOutBtn?.classList.add('is-hidden');
            signInBtn?.classList.remove('is-hidden');
            mobileSignInBtn?.classList.remove('is-hidden');
            mobileAccountBtn?.classList.add('is-hidden');
        }

        var newsletterForm = document.getElementById('newsletter-form');
        if (newsletterForm) {
            newsletterForm.classList.toggle('is-hidden', Boolean(isAuth));
        }
        if (isAuth) {
            document.getElementById('otp-section')?.classList.add('is-hidden');
            loadDigestPreference();
        } else {
            state.userConfig = null;
            els.digestPreferences?.classList.add('is-hidden');
            getMobileDigestBtn()?.classList.add('is-hidden');
        }

        updateStatusVisibility();
        updateMobileCounts();

        if (isAuth) {
            syncLocalStatusToServer();
        }

        renderListings();
    }

    function openAuthDialog() {
        var dialog = document.getElementById('auth-dialog');
        if (!dialog) return;
        dialog.classList.remove('is-hidden');
        document.getElementById('auth-email')?.focus();
    }

    function closeAuthDialog() {
        var dialog = document.getElementById('auth-dialog');
        if (!dialog) return;
        dialog.classList.add('is-hidden');
    }

    async function verifyOtp(inputId, statusId, context) {
        var input = document.getElementById(inputId);
        var status = document.getElementById(statusId);
        var code = input ? input.value.trim() : '';
        var email = state.pendingAuthEmail;

        if (!code || !email || state.pendingAuthContext !== context) return;

        try {
            var result = await window.api.verifyOtpCode(email, code);
            if (!result || !result.access_token) return;

            if (window.authFunctions) {
                window.authFunctions.updateAuthUI();
            }

            if (context === 'signin') {
                closeAuthDialog();
            } else {
                document.getElementById('otp-section')?.classList.add('is-hidden');
                document.getElementById('newsletter-form')?.classList.add('is-hidden');
            }
        } catch (err) {
            if (!status) return;
            var message = err && err.message ? String(err.message) : '';
            status.textContent = /network/i.test(message)
                ? 'Could not reach the API. Check your connection and try again.'
                : (message || 'Invalid code. Try again.');
            status.className = 'newsletter-status newsletter-status--error';
        }
    }

    function bindDomReadyEvents() {
        var undoToastBtn = document.getElementById('undo-toast-btn');
        if (undoToastBtn) {
            undoToastBtn.addEventListener('click', function() {
                var toast = document.getElementById('undo-toast');
                if (toast) toast.classList.add('is-hidden');
            });
        }

        var signOutBtn = document.getElementById('sign-out-btn');
        if (signOutBtn) {
            signOutBtn.addEventListener('click', function() {
                if (window.authFunctions) {
                    window.authFunctions.logout();
                }
            });
        }

        var signInBtn = document.getElementById('sign-in-btn');
        if (signInBtn) {
            signInBtn.addEventListener('click', openAuthDialog);
        }

        document.getElementById('m-sign-in-btn')?.addEventListener('click', openAuthDialog);
        document.getElementById('auth-dialog-close')?.addEventListener('click', closeAuthDialog);
        document.getElementById('auth-dialog-backdrop')?.addEventListener('click', closeAuthDialog);
        document.getElementById('m-account-btn')?.addEventListener('click', function() {
            window.authFunctions?.logout();
        });

        document.getElementById('auth-form')?.addEventListener('submit', async function(event) {
            event.preventDefault();
            var emailInput = document.getElementById('auth-email');
            var status = document.getElementById('auth-status');
            var email = emailInput ? emailInput.value.trim() : '';
            if (!status) return;
            if (!email || !isValidEmail(email)) {
                setInlineStatus(status, 'Please enter a valid email address.', 'error');
                emailInput?.focus();
                return;
            }

            var submitBtn = event.currentTarget.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;

            try {
                await window.api.requestMagicLink(email);
                state.pendingAuthEmail = email;
                state.pendingAuthContext = 'signin';
                status.textContent = 'Check your inbox for the 6-digit sign-in code.';
                status.className = 'newsletter-status newsletter-status--success';
                document.getElementById('auth-otp-section')?.classList.remove('is-hidden');
                document.getElementById('auth-otp-input')?.focus();
            } catch (err) {
                var message = err && /email/i.test(String(err.message || ''))
                    ? 'Please enter a valid email address.'
                    : 'Could not send a sign-in code. Please try again.';
                setInlineStatus(status, message, 'error');
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });

        document.getElementById('auth-otp-submit')?.addEventListener('click', function() {
            verifyOtp('auth-otp-input', 'auth-otp-status', 'signin');
        });

        var otpSubmit = document.getElementById('otp-submit');
        if (otpSubmit) {
            otpSubmit.addEventListener('click', function() {
                verifyOtp('otp-input', 'otp-status', 'newsletter');
            });
        }

        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') closeAuthDialog();
        });
    }

    function attachSwipe(wrap, opp) {
        var card = wrap.querySelector('.pp-card');
        var swipeBg = wrap.querySelector('.pp-swipe-bg');
        var saveStamp = wrap.querySelector('.pp-stamp.for-save');
        var passStamp = wrap.querySelector('.pp-stamp.for-pass');
        if (!card || !swipeBg) return;

        let sx = 0;
        let sy = 0;
        let st = 0;
        let dragging = false;
        let pid = null;

        function resetSwipe() {
            card.style.cssText = 'transition: transform 0.32s cubic-bezier(.2,.9,.3,1.2)';
            swipeBg.className = 'pp-swipe-bg';
            swipeBg.innerHTML = '';
            saveStamp?.classList.remove('is-visible');
            passStamp?.classList.remove('is-visible');
        }

        card.addEventListener('pointerdown', function(e) {
            if (e.target.closest('.pp-read-btn, .pp-swipe-row, a, button')) return;
            sx = e.clientX;
            sy = e.clientY;
            st = Date.now();
            dragging = true;
            pid = e.pointerId;
            card.setPointerCapture(e.pointerId);
        });

        card.addEventListener('pointermove', function(e) {
            if (!dragging || e.pointerId !== pid) return;
            const dx = e.clientX - sx;
            const dy = e.clientY - sy;

            if (Math.abs(dy) > Math.abs(dx) + 8) {
                dragging = false;
                resetSwipe();
                return;
            }

            const tilt = dx * 0.03;
            const opacity = Math.max(0.3, 1 - Math.abs(dx) / 400);
            card.style.cssText = `transform:translateX(${dx}px) rotate(${tilt}deg);opacity:${opacity};transition:none`;
            const stampOpacity = Math.min(1, Math.abs(dx) / 80);

            if (dx > 2) {
                swipeBg.className = 'pp-swipe-bg for-save';
                swipeBg.innerHTML = `<span class="pp-swipe-hint for-save" style="opacity:${stampOpacity}">→ SAVE</span>`;
                saveStamp?.classList.add('is-visible');
                passStamp?.classList.remove('is-visible');
            } else if (dx < -2) {
                swipeBg.className = 'pp-swipe-bg for-pass';
                swipeBg.innerHTML = `<span class="pp-swipe-hint for-pass" style="opacity:${stampOpacity}">PASS ←</span>`;
                passStamp?.classList.add('is-visible');
                saveStamp?.classList.remove('is-visible');
            } else {
                swipeBg.className = 'pp-swipe-bg';
                swipeBg.innerHTML = '';
                saveStamp?.classList.remove('is-visible');
                passStamp?.classList.remove('is-visible');
            }
        });

        const onEnd = function(e) {
            if (!dragging) return;
            dragging = false;
            const dx = e.clientX - sx;
            const dt = Date.now() - st;
            const isTap = Math.abs(dx) < 6 && dt < 250;

            if (isTap) {
                resetSwipe();
            } else if (Math.abs(dx) > 80) {
                doSwipe(wrap, card, opp, dx > 0 ? 'save' : 'pass', dx);
            } else {
                resetSwipe();
            }
        };

        card.addEventListener('pointerup', onEnd);
        card.addEventListener('pointercancel', function() {
            dragging = false;
            resetSwipe();
        });
    }

    function doSwipe(wrap, card, opp, dir, dx) {
        var stamp = card.querySelector('.pp-stamp.for-' + dir);
        if (stamp) {
            stamp.textContent = dir === 'save' ? 'SAVED' : 'PASSED';
            stamp.classList.add('is-visible');
        }

        const flyX = dx > 0 ? 420 : -420;
        card.style.cssText = `transform:translateX(${flyX}px) rotate(${flyX * 0.03}deg);opacity:0;transition:transform 0.28s ease-out,opacity 0.28s ease-out`;

        setTimeout(function() {
            recordStatus(opp, dir === 'save' ? 'todo' : 'ignored');
            const h = wrap.scrollHeight;
            wrap.style.cssText = `max-height:${h}px;overflow:hidden;transition:max-height 0.28s ease`;
            requestAnimationFrame(function() {
                wrap.style.maxHeight = '0';
            });
            setTimeout(function() {
                wrap.remove();
                updateMobileCounts();
            }, 300);
        }, 280);
    }

    function openOverlay(opp) {
        const overlay = document.getElementById('m-overlay');
        const flipper = document.getElementById('m-overlay-flipper');
        const content = document.getElementById('m-overlay-content');
        if (!overlay || !flipper || !content) return;

        const hot = isHot(opp);
        const sal = formatSalary(opp.salary_min, opp.salary_max, opp.salary_raw);
        const loc = getLocation(opp);
        const desc = normalizeDescription(opp.description_cleaned || opp.description || '');

        content.innerHTML = '';

        const bar = document.createElement('div');
        bar.className = 'm-overlay-bar';

        const backBtn = document.createElement('button');
        backBtn.className = 'm-overlay-back';
        backBtn.type = 'button';
        backBtn.innerHTML = '<span class="m-overlay-back-icon">↺</span><span class="m-overlay-back-lbl">Back to card</span>';
        backBtn.addEventListener('click', closeOverlay);

        const barTitle = document.createElement('div');
        barTitle.className = 'm-overlay-bar-title';
        barTitle.textContent = 'Full Posting';

        bar.appendChild(backBtn);
        bar.appendChild(barTitle);
        content.appendChild(bar);

        const body = document.createElement('div');
        body.className = 'm-overlay-body';

        const co = document.createElement('div');
        co.className = 'm-overlay-co' + (hot ? ' is-hot' : '');
        co.textContent = opp.company_name || '';
        body.appendChild(co);

        const title = document.createElement('div');
        title.className = 'm-overlay-title';
        title.textContent = opp.title || '';
        body.appendChild(title);

        const meta = document.createElement('div');
        meta.className = 'm-overlay-meta';
        meta.textContent = [loc, sal, fmtDate(opp.posted_date || opp.first_seen)].filter(Boolean).join(' · ');
        body.appendChild(meta);

        const textEl = document.createElement('div');
        textEl.className = 'm-overlay-text';
        textEl.textContent = desc;
        body.appendChild(textEl);

        const applyUrl = safeExternalUrl(opp.url);
        if (applyUrl) {
            const apply = document.createElement('a');
            apply.className = 'm-overlay-apply';
            apply.href = applyUrl;
            apply.target = '_blank';
            apply.rel = 'noopener noreferrer';
            apply.textContent = 'View Original Posting ↗';
            body.appendChild(apply);
        }

        if (isAuthenticated()) {
            const applied = document.createElement('button');
            applied.className = 'm-overlay-applied';
            applied.type = 'button';
            applied.textContent = state.appliedIds.has(opp.id) ? 'Applied ✓' : 'Mark as applied';
            applied.addEventListener('click', function() {
                recordStatus(opp, 'applied', applied);
                applied.textContent = 'Applied ✓';
            });
            body.appendChild(applied);
        }

        content.appendChild(body);

        overlay.classList.add('is-visible');
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                flipper.classList.add('is-open');
            });
        });
    }

    function closeOverlay() {
        const flipper = document.getElementById('m-overlay-flipper');
        const overlay = document.getElementById('m-overlay');
        if (!flipper || !overlay) return;
        flipper.classList.remove('is-open');
        flipper.classList.add('is-exiting');
        setTimeout(function() {
            flipper.classList.remove('is-exiting');
            overlay.classList.remove('is-visible');
        }, 520);
    }

    async function fetchPublicCounters() {
        try {
            const data = await window.api.getPublicStats();
            if (els.summary7d && data.opportunities_added_7d != null) {
                els.summary7d.textContent = fmtInteger(data.opportunities_added_7d);
            }
            if (els.summaryTotal && data.active_opportunities != null) {
                els.summaryTotal.textContent = fmtInteger(data.active_opportunities);
            }
            if (els.summaryCompanies && data.active_companies != null) {
                els.summaryCompanies.textContent = fmtInteger(data.active_companies);
            }
            if (els.summaryNew && data.opportunities_added_24h != null) {
                els.summaryNew.textContent = fmtInteger(data.opportunities_added_24h);
            }
        } catch {
        }
    }

    document.addEventListener('pp:auth-changed', function(e) {
        handleAuthChanged(e.detail || {});
    });

    document.addEventListener('DOMContentLoaded', function() {
        loadLocalSets();
        renderMobileFilters();
        updateMobileCounts();
        bindDomReadyEvents();

        state.minScore = getInitialMinScore();
        state.category = getInitialCategory();
        setScoreControlValue(state.minScore);
        updateFiltersInUrl();
        bindEvents();
        updateStatusVisibility();
        if (window.authFunctions) {
            window.authFunctions.updateAuthUI();
        }
        if (isAuthenticated()) {
            syncLocalStatusToServer();
        }
        loadListings();
        fetchPublicCounters();
    });

    var mq = window.matchMedia('(max-width: 767px)');
    mq.addEventListener('change', function(e) {
        if (state.isMobile === e.matches) return;
        state.isMobile = e.matches;
        renderListings();
    });
})();
