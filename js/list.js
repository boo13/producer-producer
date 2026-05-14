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
        savedIds: new Set(),
        passedIds: new Set(),
        appliedIds: new Set(),
        isMobile: window.matchMedia('(max-width: 767px)').matches,
    };

    var localStatusSynced = false;
    var localSetsLoaded = false;

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
    };

    function isAuthenticated() {
        return Boolean(window.api && window.api.isAuthenticated && window.api.isAuthenticated());
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

    function getInitialMinScore() {
        const params = new URLSearchParams(window.location.search);
        const fromQuery = params.get('min_score');
        return fromQuery == null ? DEFAULT_MIN_SCORE : clampScore(fromQuery);
    }

    function updateMinScoreInUrl(minScore) {
        const url = new URL(window.location.href);
        url.searchParams.set('min_score', String(minScore));
        window.history.replaceState({}, '', url);
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

        const tmp = document.createElement('div');
        tmp.innerHTML = String(rawDescription);
        const text = tmp.textContent || tmp.innerText || '';
        const normalized = text
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();

        return normalized || 'No description available.';
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
        const cls = opp.sentence_classifications;
        if (cls && cls.length) {
            const highlights = cls
                .filter(function(item) { return item.tier === 'highlight' && item.text; })
                .map(function(item) { return item.text; })
                .slice(0, 4);
            if (highlights.length) return highlights;
        }

        const rawDesc = opp.description_cleaned || opp.description || '';
        if (!rawDesc) return [];
        const desc = normalizeDescription(rawDesc);
        if (desc === 'No description available.') return [];
        return desc
            .split(/[.!?]+\s+/)
            .map(function(sentence) { return sentence.trim(); })
            .filter(function(sentence) { return sentence.length > 20 && sentence.length < 220; })
            .slice(0, 4);
    }

    function matchesCategory(opp, cat) {
        if (cat === 'all') return true;
        var text = ((opp.title || '') + ' ' + (opp.description || '')).toLowerCase();
        var map = {
            news:    ['news', 'journalist', 'reporter', 'editorial', 'anchor', 'broadcast'],
            podcast: ['podcast', 'audio', 'radio', 'sound'],
            video:   ['video', 'producer', 'cinemat', 'dp', 'director of photography'],
            social:  ['social', 'digital', 'content creator', 'tiktok', 'instagram'],
        };
        return (map[cat] || []).some(function(kw) { return text.includes(kw); });
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
        if (els.minScoreInput) els.minScoreInput.disabled = isLoading;
        if (els.refreshBtn) els.refreshBtn.disabled = isLoading;
        if (!els.skeletonList) return;

        if (isLoading && !state.isMobile) {
            els.skeletonList.classList.remove('is-hidden');
        } else {
            els.skeletonList.classList.add('is-hidden');
        }
    }

    function showError(message) {
        if (!els.errorBanner) return;
        els.errorBanner.textContent = message;
        els.errorBanner.classList.remove('is-hidden');
    }

    function clearError() {
        if (!els.errorBanner) return;
        els.errorBanner.textContent = '';
        els.errorBanner.classList.add('is-hidden');
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

    async function fetchAllListings(minScore) {
        if (state.statusFilter !== 'all' && isAuthenticated()) {
            var statusMap = { saved: 'todo', applied: 'applied' };
            var params = {
                min_score: minScore,
                status: statusMap[state.statusFilter],
                limit: PAGE_SIZE,
            };
            var results = await window.api.getOpportunitiesForMe(params);
            return results || [];
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
        link.href = opp.url || '#';
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
            window.api.updateOpportunityStatus(opp.id, status).catch(console.error);
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

    function clearListingList() {
        if (!els.companyList) return;
        Array.from(els.companyList.children).forEach(function(child) {
            if (child.id !== 'skeleton-list') child.remove();
        });
    }

    function renderListings() {
        var filtered = getFilteredListings();

        if (state.isMobile) {
            var feed = document.getElementById('m-feed');
            if (!feed) return;
            feed.innerHTML = '';

            if (!filtered.length) {
                var empty = document.createElement('div');
                empty.className = 'm-empty';
                empty.innerHTML = '<div class="m-empty-title">That&apos;s a wrap.</div><div class="m-empty-sub">Fresh listings are pulled at dawn.</div>';
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
        if (els.skeletonList) els.skeletonList.classList.add('is-hidden');
        clearListingList();

        if (!filtered.length) {
            var desktopEmpty = document.createElement('p');
            desktopEmpty.className = 'empty-state';
            desktopEmpty.textContent = 'No listings match these filters right now.';
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

        setLoading(true);
        clearError();

        try {
            const listings = await fetchAllListings(state.minScore);
            state.listings = sortListings(listings);
            renderListings();
            renderFeaturedCompanies();
            updateSummary();
            if (els.lastUpdated) {
                els.lastUpdated.textContent = `Updated ${fmtDateTime(new Date())}`;
            }
        } catch (error) {
            console.error('Failed to load listings:', error);
            state.listings = [];
            renderListings();
            updateSummary();
            showError('Could not load listings from the API. Please try refresh.');
        } finally {
            setLoading(false);
            await checkHealth();
        }
    }

    function setCategory(category) {
        if (!CATEGORIES.includes(category) || category === state.category) return;
        state.category = category;
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
        var pEl = document.getElementById('m-passed-ct');
        if (sEl) sEl.textContent = state.savedIds.size + ' saved';
        if (pEl) pEl.textContent = state.passedIds.size + ' passed';
    }

    function bindEvents() {
        els.minScoreInput?.addEventListener('input', (e) => {
            const val = e.target.value;
            if (els.scoreValue) els.scoreValue.textContent = val;
        });

        els.minScoreInput?.addEventListener('change', (e) => {
            state.minScore = clampScore(e.target.value);
            updateMinScoreInUrl(state.minScore);
            loadListings();
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
            if (!email || !els.newsletterStatus) return;

            const submitBtn = els.newsletterForm.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;

            try {
                await window.api.requestMagicLink(email);
                state.pendingAuthEmail = email;
                els.newsletterStatus.textContent = 'Check your inbox — enter the 6-digit code below.';
                els.newsletterStatus.className = 'newsletter-status newsletter-status--success';
                if (els.newsletterEmail) els.newsletterEmail.value = '';
                var otpSection = document.getElementById('otp-section');
                if (otpSection) otpSection.classList.remove('is-hidden');
            } catch {
                els.newsletterStatus.textContent = 'Something went wrong. Please try again.';
                els.newsletterStatus.className = 'newsletter-status newsletter-status--error';
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    function handleAuthChanged(detail) {
        var isAuth = detail && detail.isAuthenticated;
        var user = detail && detail.user;

        var greeting = document.getElementById('user-greeting');
        var signInBtn = document.getElementById('sign-in-btn');
        var signOutBtn = document.getElementById('sign-out-btn');

        if (isAuth && user) {
            if (greeting) greeting.textContent = user.email || '';
            greeting?.classList.remove('is-hidden');
            signOutBtn?.classList.remove('is-hidden');
            signInBtn?.classList.add('is-hidden');
        } else {
            greeting?.classList.add('is-hidden');
            signOutBtn?.classList.add('is-hidden');
            signInBtn?.classList.remove('is-hidden');
        }

        var newsletterForm = document.getElementById('newsletter-form');
        if (newsletterForm) {
            newsletterForm.classList.toggle('is-hidden', Boolean(isAuth));
        }

        updateStatusVisibility();
        updateMobileCounts();

        if (isAuth) {
            syncLocalStatusToServer();
        }

        renderListings();
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
            signInBtn.addEventListener('click', function() {
                var form = document.getElementById('newsletter-form');
                if (form) {
                    form.scrollIntoView({ behavior: 'smooth' });
                    var emailInput = document.getElementById('newsletter-email');
                    if (emailInput) emailInput.focus();
                }
            });
        }

        var otpSubmit = document.getElementById('otp-submit');
        if (otpSubmit) {
            otpSubmit.addEventListener('click', async function() {
                var input = document.getElementById('otp-input');
                var code = input ? input.value.trim() : '';
                var email = state.pendingAuthEmail;
                if (!code || !email) return;

                try {
                    var result = await window.api.verifyOtpCode(email, code);
                    if (result && result.access_token) {
                        localStorage.setItem('pp_auth_token', result.access_token);
                        if (result.user) {
                            localStorage.setItem('pp_user_data', JSON.stringify(result.user));
                        }
                        if (window.authFunctions) {
                            window.authFunctions.updateAuthUI();
                        }
                        document.getElementById('otp-section')?.classList.add('is-hidden');
                        document.getElementById('newsletter-form')?.classList.add('is-hidden');
                    }
                } catch (err) {
                    var status = document.getElementById('otp-status');
                    if (!status) return;
                    status.textContent = 'Invalid code. Try again.';
                    status.classList.remove('is-hidden');
                    status.classList.add('newsletter-status--error');
                }
            });
        }
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

        if (opp.url) {
            const apply = document.createElement('a');
            apply.className = 'm-overlay-apply';
            apply.href = opp.url;
            apply.target = '_blank';
            apply.rel = 'noopener noreferrer';
            apply.textContent = 'View Original Posting ↗';
            body.appendChild(apply);
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
        if (els.minScoreInput) {
            els.minScoreInput.value = String(state.minScore);
            if (els.scoreValue) els.scoreValue.textContent = String(state.minScore);
        }
        updateMinScoreInUrl(state.minScore);
        bindEvents();
        updateStatusVisibility();
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
