(function () {
    'use strict';

    const DEFAULT_MIN_SCORE = 70;
    const PAGE_SIZE = 100;
    const MAX_PAGES = 50;
    const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

    const state = {
        minScore: DEFAULT_MIN_SCORE,
        listings: [],
    };

    const $id = (id) => document.getElementById(id);

    const els = {
        thresholdForm: $id('threshold-form'),
        minScoreInput: $id('min-score'),
        thresholdSubmit: $id('threshold-submit'),
        refreshBtn: $id('refresh-btn'),
        connectionIndicator: $id('connection-indicator'),
        latencyText: $id('latency-text'),
        resultsCaption: $id('results-caption'),
        lastUpdated: $id('last-updated'),
        errorBanner: $id('error-banner'),
        summaryTotal: $id('summary-total'),
        summaryCompanies: $id('summary-companies'),
        summaryNew: $id('summary-new'),
        companyList: $id('company-list'),
    };

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
        if (!rawDescription) {
            return 'No description available.';
        }

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
        if (els.thresholdSubmit) {
            els.thresholdSubmit.disabled = isLoading;
        }
        if (els.refreshBtn) {
            els.refreshBtn.disabled = isLoading;
        }
        if (isLoading && els.companyList) {
            els.companyList.innerHTML = '<p class="loading-state">Loading listings...</p>';
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
        const items = [];

        for (let page = 0; page < MAX_PAGES; page += 1) {
            const batch = await window.api.getOpportunityFeed({
                min_score: minScore,
                limit: PAGE_SIZE,
                offset: items.length,
            });

            if (!Array.isArray(batch) || batch.length === 0) {
                break;
            }

            items.push(...batch);

            if (batch.length < PAGE_SIZE) {
                break;
            }
        }

        return dedupeListings(items);
    }

    function sortListings(listings) {
        return [...listings].sort((a, b) => {
            const companyA = (a.company_name || 'Unknown Company').toLowerCase();
            const companyB = (b.company_name || 'Unknown Company').toLowerCase();
            if (companyA !== companyB) {
                return companyA.localeCompare(companyB);
            }

            const scoreDelta = (b.score || 0) - (a.score || 0);
            if (scoreDelta !== 0) {
                return scoreDelta;
            }

            const timeA = new Date(a.first_seen || a.posted_date || 0).getTime() || 0;
            const timeB = new Date(b.first_seen || b.posted_date || 0).getTime() || 0;
            return timeB - timeA;
        });
    }

    function groupByCompany(listings) {
        const groups = new Map();

        listings.forEach((opp) => {
            const company = (opp.company_name || 'Unknown Company').trim() || 'Unknown Company';
            if (!groups.has(company)) {
                groups.set(company, []);
            }
            groups.get(company).push(opp);
        });

        return [...groups.entries()].sort(([a], [b]) =>
            a.localeCompare(b, undefined, { sensitivity: 'base' })
        );
    }

    function createListingElement(opportunity, allDetails) {
        const details = document.createElement('details');
        details.className = 'listing-item';

        const summary = document.createElement('summary');
        summary.className = 'listing-summary';

        const summaryLeft = document.createElement('div');
        summaryLeft.className = 'summary-left';

        const role = document.createElement('p');
        role.className = 'listing-role';
        role.textContent = opportunity.title || 'Untitled role';

        const company = document.createElement('p');
        company.className = 'listing-company';
        company.textContent = opportunity.company_name || 'Unknown Company';

        summaryLeft.appendChild(role);
        summaryLeft.appendChild(company);

        const summaryRight = document.createElement('div');
        summaryRight.className = 'summary-right';

        const salary = document.createElement('span');
        salary.className = 'listing-salary';
        salary.textContent = formatSalary(opportunity.salary_min, opportunity.salary_max, opportunity.salary_raw);

        const score = document.createElement('span');
        score.className = 'listing-score';
        score.textContent = `Score ${(opportunity.score || 0).toFixed(1)}`;

        summaryRight.appendChild(salary);

        if (isNewListing(opportunity)) {
            const newPill = document.createElement('span');
            newPill.className = 'pill-new';
            newPill.textContent = 'NEW';
            summaryRight.appendChild(newPill);
        }

        summaryRight.appendChild(score);

        const chevron = document.createElement('span');
        chevron.className = 'summary-chevron';
        chevron.textContent = '›';
        summaryRight.appendChild(chevron);

        summary.appendChild(summaryLeft);
        summary.appendChild(summaryRight);

        const detail = document.createElement('div');
        detail.className = 'listing-detail';

        const postedDate = opportunity.posted_date || opportunity.first_seen;
        const postedMeta = document.createElement('p');
        postedMeta.className = 'listing-meta';
        postedMeta.textContent = `Posted ${fmtDate(postedDate)} · First seen ${fmtDate(opportunity.first_seen)}`;

        const description = document.createElement('p');
        description.className = 'listing-description';
        description.textContent = normalizeDescription(opportunity.description);

        const actions = document.createElement('div');
        actions.className = 'listing-actions';

        const applyLink = document.createElement('a');
        applyLink.className = 'apply-btn';
        applyLink.textContent = 'APPLY';

        if (opportunity.url) {
            applyLink.href = opportunity.url;
            applyLink.target = '_blank';
            applyLink.rel = 'noopener noreferrer';
        } else {
            applyLink.classList.add('is-disabled');
            applyLink.removeAttribute('href');
            applyLink.textContent = 'APPLY unavailable';
        }

        actions.appendChild(applyLink);
        detail.appendChild(postedMeta);
        detail.appendChild(description);
        detail.appendChild(actions);

        details.appendChild(summary);
        details.appendChild(detail);

        details.addEventListener('toggle', () => {
            if (!details.open) return;

            allDetails.forEach((item) => {
                if (item !== details) {
                    item.open = false;
                }
            });
        });

        return details;
    }

    function updateSummary() {
        const totalListings = state.listings.length;
        const companyCount = new Set(
            state.listings.map((opp) => (opp.company_name || 'Unknown Company').trim() || 'Unknown Company')
        ).size;
        const newCount = state.listings.filter(isNewListing).length;

        if (els.summaryTotal) {
            els.summaryTotal.textContent = fmtInteger(totalListings);
        }
        if (els.summaryCompanies) {
            els.summaryCompanies.textContent = fmtInteger(companyCount);
        }
        if (els.summaryNew) {
            els.summaryNew.textContent = fmtInteger(newCount);
        }
        if (els.resultsCaption) {
            if (totalListings === 0) {
                els.resultsCaption.textContent = `No active listings found at score ${state.minScore}+`;
            } else {
                els.resultsCaption.textContent =
                    `Showing ${fmtInteger(totalListings)} active listings at score ${state.minScore}+`;
            }
        }
    }

    function renderListings() {
        if (!els.companyList) return;
        els.companyList.innerHTML = '';

        if (state.listings.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'No listings match this threshold right now.';
            els.companyList.appendChild(empty);
            return;
        }

        const grouped = groupByCompany(state.listings);
        const allDetails = [];

        grouped.forEach(([companyName, opportunities]) => {
            const section = document.createElement('section');
            section.className = 'company-group';

            const header = document.createElement('header');
            header.className = 'company-header';

            const title = document.createElement('h2');
            title.className = 'company-name';
            title.textContent = companyName;

            const count = document.createElement('span');
            count.className = 'company-count';
            count.textContent = `${opportunities.length} listing${opportunities.length === 1 ? '' : 's'}`;

            header.appendChild(title);
            header.appendChild(count);

            const list = document.createElement('div');
            list.className = 'company-listings';

            opportunities.forEach((opportunity) => {
                const listing = createListingElement(opportunity, allDetails);
                allDetails.push(listing);
                list.appendChild(listing);
            });

            section.appendChild(header);
            section.appendChild(list);
            els.companyList.appendChild(section);
        });
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

    function bindEvents() {
        els.thresholdForm?.addEventListener('submit', (event) => {
            event.preventDefault();
            const nextScore = clampScore(els.minScoreInput?.value);
            if (els.minScoreInput) {
                els.minScoreInput.value = String(nextScore);
            }
            if (nextScore !== state.minScore) {
                state.minScore = nextScore;
                updateMinScoreInUrl(state.minScore);
            }
            loadListings();
        });

        els.refreshBtn?.addEventListener('click', () => {
            loadListings();
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        state.minScore = getInitialMinScore();
        if (els.minScoreInput) {
            els.minScoreInput.value = String(state.minScore);
        }
        updateMinScoreInUrl(state.minScore);
        bindEvents();
        loadListings();
    });
})();
