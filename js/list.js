(function () {
    'use strict';

    const DEFAULT_MIN_SCORE = 75;
    const PAGE_SIZE = 100;
    const MAX_PAGES = 50;
    const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

    const state = {
        minScore: DEFAULT_MIN_SCORE,
        category: 'all',
        listings: [],
    };

    const $id = (id) => document.getElementById(id);

    const els = {
        thresholdForm: $id('threshold-form'),
        minScoreInput: $id('min-score'),
        scoreValue: $id('score-value'),
        categoryChips: $id('category-chips'),
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
        companyTrack: $id('company-track'),
        skeletonList: $id('skeleton-list'),
        newsletterForm: $id('newsletter-form'),
        newsletterEmail: $id('newsletter-email'),
        newsletterStatus: $id('newsletter-status'),
    };

    function scoreStyles(score) {
        // Interpolate bg from muted tan (score 0) to amber (score 100)
        const t = Math.max(0, Math.min(1, score / 100));
        const r = Math.round(220 + (184 - 220) * t);
        const g = Math.round(200 + (117 - 200) * t);
        const b = Math.round(158 + (20  - 158) * t);
        const bg = `rgb(${r},${g},${b})`;
        const color = score >= 83 ? '#fef5e0' : '#3d2200';
        return { background: bg, color };
    }

    function animateDetailOpen(detailEl) {
        clearTimeout(detailEl._animTimer);
        detailEl.style.cssText = 'height:0;overflow:hidden;opacity:0;transition:none';
        void detailEl.offsetHeight;
        const h = detailEl.scrollHeight;
        detailEl.style.cssText =
            `height:${h}px;overflow:hidden;opacity:1;` +
            'transition:height 400ms cubic-bezier(0.25,0.46,0.45,0.94),opacity 280ms ease 60ms';
        detailEl._animTimer = setTimeout(() => {
            detailEl.style.cssText = 'height:auto';
        }, 410);
    }

    function animateDetailClose(detailsEl, detailEl, onDone) {
        clearTimeout(detailEl._animTimer);
        const h = detailEl.scrollHeight || detailEl.offsetHeight;
        detailEl.style.cssText = `height:${h}px;overflow:hidden;opacity:1;transition:none`;
        void detailEl.offsetHeight;
        detailEl.style.cssText =
            `height:0;overflow:hidden;opacity:0;` +
            'transition:height 340ms cubic-bezier(0.25,0.46,0.45,0.94),opacity 200ms ease';
        detailEl._animTimer = setTimeout(() => {
            detailsEl.open = false;
            detailEl.style.cssText = '';
            if (onDone) onDone();
        }, 350);
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
        if (els.minScoreInput) els.minScoreInput.disabled = isLoading;
        if (els.refreshBtn) els.refreshBtn.disabled = isLoading;
        
        if (isLoading) {
            if (els.skeletonList) els.skeletonList.classList.remove('is-hidden');
            // Don't clear companyList immediately to avoid layout shift if possible, 
            // but for a clean "refresh" state we might want to.
            // For now, let's just show skeleton.
        } else {
            if (els.skeletonList) els.skeletonList.classList.add('is-hidden');
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
            const scoreDelta = (b.score || 0) - (a.score || 0);
            if (scoreDelta !== 0) return scoreDelta;

            const timeA = new Date(a.first_seen || a.posted_date || 0).getTime() || 0;
            const timeB = new Date(b.first_seen || b.posted_date || 0).getTime() || 0;
            return timeB - timeA;
        });
    }

    function createListingElement(opportunity, allDetails) {
        const details = document.createElement('details');
        details.className = 'listing-item';

        const summary = document.createElement('summary');
        summary.className = 'listing-summary';

        const scoreBadge = document.createElement('div');
        scoreBadge.className = 'score-badge';
        const { background: scoreBg, color: scoreColor } = scoreStyles(opportunity.score || 0);
        scoreBadge.style.background = scoreBg;
        scoreBadge.style.color = scoreColor;
        const scoreNum = document.createElement('span');
        scoreNum.textContent = Math.round(opportunity.score || 0);
        const scoreLabel = document.createElement('span');
        scoreLabel.className = 'score-badge-label';
        scoreLabel.textContent = 'score';
        scoreBadge.appendChild(scoreNum);
        scoreBadge.appendChild(scoreLabel);

        const info = document.createElement('div');
        info.className = 'listing-info';

        const role = document.createElement('p');
        role.className = 'listing-role';
        role.textContent = opportunity.title || 'Untitled role';

        const company = document.createElement('p');
        company.className = 'listing-company';
        company.textContent = opportunity.company_name || 'Unknown Company';

        info.appendChild(role);
        info.appendChild(company);

        const pills = document.createElement('div');
        pills.className = 'listing-pills';
        info.appendChild(pills);

        const aside = document.createElement('div');
        aside.className = 'listing-aside';

        if (isNewListing(opportunity)) {
            const newPill = document.createElement('span');
            newPill.className = 'pill-new';
            newPill.textContent = 'NEW';
            aside.appendChild(newPill);
        }

        const salary = document.createElement('span');
        salary.className = 'listing-salary';
        salary.textContent = formatSalary(opportunity.salary_min, opportunity.salary_max, opportunity.salary_raw);
        aside.appendChild(salary);

        const chevron = document.createElement('span');
        chevron.className = 'summary-chevron';
        chevron.textContent = '›';
        aside.appendChild(chevron);

        summary.appendChild(scoreBadge);
        summary.appendChild(info);
        summary.appendChild(aside);

        const detail = document.createElement('div');
        detail.className = 'listing-detail';

        const detailInner = document.createElement('div');
        detailInner.className = 'listing-detail-inner';

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
        applyLink.textContent = 'Apply';

        if (opportunity.url) {
            applyLink.href = opportunity.url;
            applyLink.target = '_blank';
            applyLink.rel = 'noopener noreferrer';
        } else {
            applyLink.classList.add('is-disabled');
            applyLink.removeAttribute('href');
            applyLink.textContent = 'No link available';
        }

        actions.appendChild(applyLink);
        detailInner.appendChild(postedMeta);
        detailInner.appendChild(description);
        detailInner.appendChild(actions);
        detail.appendChild(detailInner);

        details.appendChild(summary);
        details.appendChild(detail);

        summary.addEventListener('click', (e) => {
            e.preventDefault();
            if (details.open) {
                details.open = false;
                animateDetailClose(details, detail);
            } else {
                allDetails.forEach((item) => {
                    if (item !== details && item.open) {
                        const otherDetail = item.querySelector('.listing-detail');
                        if (otherDetail) animateDetailClose(item, otherDetail);
                        item.open = false;
                    }
                });
                details.open = true;
                animateDetailOpen(detail);
            }
        });

        return details;
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
        
        if (els.resultsCaption) {
            if (totalListings === 0) {
                els.resultsCaption.textContent = `No active listings found at score ${state.minScore}+`;
            } else {
                els.resultsCaption.textContent =
                    `Showing ${fmtInteger(totalListings)} active listings at score ${state.minScore}+`;
            }
        }
    }

    function renderFeaturedCompanies() {
        if (!els.companyTrack) return;
        
        // Pick top companies from currently loaded listings
        const counts = {};
        state.listings.forEach(opp => {
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

        els.companyTrack.innerHTML = '';
        sorted.forEach(([name]) => {
            const span = document.createElement('span');
            span.className = 'company-logo-text';
            span.textContent = name;
            els.companyTrack.appendChild(span);
        });
    }

    function renderListings() {
        if (!els.companyList) return;
        
        // Clear previous results but keep skeleton if it's there
        const listings = els.companyList.querySelectorAll('.listing-item, .empty-state');
        listings.forEach(l => l.remove());

        const filtered = state.listings.filter(opp => {
            if (state.category === 'all') return true;
            const desc = (opp.description || '').toLowerCase();
            const title = (opp.title || '').toLowerCase();
            const text = `${title} ${desc}`;
            
            if (state.category === 'news') return text.includes('news') || text.includes('journal');
            if (state.category === 'podcast') return text.includes('podcast') || text.includes('audio');
            if (state.category === 'video') return text.includes('video') || text.includes('film') || text.includes('documentary');
            if (state.category === 'social') return text.includes('social') || text.includes('tiktok') || text.includes('instagram');
            return true;
        });

        if (filtered.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'No listings match these filters right now.';
            els.companyList.appendChild(empty);
            return;
        }

        const allDetails = [];
        filtered.forEach((opportunity, index) => {
            const listing = createListingElement(opportunity, allDetails);
            listing.style.animationDelay = `${Math.min(index * 25, 350)}ms`;
            allDetails.push(listing);
            els.companyList.appendChild(listing);
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

            const category = chip.dataset.category;
            if (category === state.category) return;

            state.category = category;
            
            // Update active state
            els.categoryChips.querySelectorAll('.chip').forEach(c => c.classList.remove('is-active'));
            chip.classList.add('is-active');
            
            renderListings();
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
                els.newsletterStatus.textContent = 'Check your inbox — a confirmation link is on its way.';
                els.newsletterStatus.className = 'newsletter-status newsletter-status--success';
                if (els.newsletterEmail) els.newsletterEmail.value = '';
            } catch {
                els.newsletterStatus.textContent = 'Something went wrong. Please try again.';
                els.newsletterStatus.className = 'newsletter-status newsletter-status--error';
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        state.minScore = getInitialMinScore();
        if (els.minScoreInput) {
            els.minScoreInput.value = String(state.minScore);
            if (els.scoreValue) els.scoreValue.textContent = String(state.minScore);
        }
        updateMinScoreInUrl(state.minScore);
        bindEvents();
        loadListings();
    });
})();
