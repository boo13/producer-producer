/**
 * Opportunities UI - Load and display personalized job listings with swipe/status/undo
 */

const opportunitiesState = {
    all: [],
    companyFilter: null,
    cardsById: new Map(),
    renderTimeout: null,
    actionHistory: [],
    activeCardId: null,
};

const statusFeed = document.querySelector('.status-feed');
const NOTES_WINDOW_SELECTOR = '.notes-window .window-body';

const cloneOpportunity = (opp) => {
    if (typeof window.structuredClone === 'function') {
        return window.structuredClone(opp);
    }
    return JSON.parse(JSON.stringify(opp));
};

const triggerHaptic = (duration = 15) => {
    if (navigator?.vibrate) {
        navigator.vibrate(duration);
    }
};

const scheduleRender = (delay = 0) => {
    if (opportunitiesState.renderTimeout) {
        clearTimeout(opportunitiesState.renderTimeout);
    }
    opportunitiesState.renderTimeout = window.setTimeout(() => {
        opportunitiesState.renderTimeout = null;
        renderOpportunities();
    }, delay);
};

/**
 * Update the Opportunities window title based on auth state.
 */
function updateOpportunitiesWindowTitle() {
    const titleEl = document.querySelector('.notes-window .window-title');
    if (!titleEl) return;

    titleEl.textContent = window.api?.isAuthenticated?.()
        ? 'Your Opportunities'
        : 'Opportunities';
}

/**
 * Load opportunities from API
 */
async function loadOpportunities() {
    try {
        window.authFunctions.showLoadingState('Loading opportunities...');

        // Always load the public ranked feed so logged-out visitors can use the site.
        let opportunities = await window.api.getOpportunityFeed({
            min_score: 50,
            limit: 50,
        });

        // If logged in, hide ignored/applied opportunities.
        if (window.api.isAuthenticated()) {
            const [ignored, applied] = await Promise.all([
                window.api.getUserOpportunities({ status_filter: 'ignored', limit: 200 }),
                window.api.getUserOpportunities({ status_filter: 'applied', limit: 200 }),
            ]);

            const hiddenIds = new Set([
                ...(ignored || []).map((uo) => uo.opportunity_id),
                ...(applied || []).map((uo) => uo.opportunity_id),
            ]);

            opportunities = (opportunities || []).filter((opp) => !hiddenIds.has(opp.id));
        }

        opportunitiesState.all = [...(opportunities || [])].sort(
            (a, b) => (b.score || 0) - (a.score || 0),
        );
        opportunitiesState.actionHistory = [];
        opportunitiesState.companyFilter = null;
        window.companiesWindow?.setOpportunities(opportunitiesState.all);
        scheduleRender();
    } catch (err) {
        console.error('Failed to load opportunities:', err);
        window.authFunctions.showErrorMessage('Failed to load opportunities.');
    } finally {
        window.authFunctions.hideLoadingState();
    }
}

const getVisibleOpportunities = () => {
    if (!opportunitiesState.companyFilter) {
        return opportunitiesState.all;
    }
    return opportunitiesState.all.filter(
        (opp) =>
            (opp.company_name || 'Unknown Company') ===
            opportunitiesState.companyFilter,
    );
};

function renderOpportunities() {
    const notesWindow = document.querySelector(NOTES_WINDOW_SELECTOR);
    if (!notesWindow) return;

    opportunitiesState.cardsById.clear();
    notesWindow.innerHTML = '';

    if (opportunitiesState.companyFilter) {
        const filterBanner = document.createElement('div');
        filterBanner.className = 'company-filter-banner';
        filterBanner.innerHTML = `Filtering by <strong>${escapeHtml(opportunitiesState.companyFilter)}</strong> <button type="button" class="clear-company-filter">Clear filter</button>`;
        filterBanner
            .querySelector('.clear-company-filter')
            .addEventListener('click', () => {
                opportunitiesState.companyFilter = null;
                window.companiesWindow?.clearSelection?.();
                scheduleRender();
            });
        notesWindow.appendChild(filterBanner);
    }

    const visible = getVisibleOpportunities();

    if (!visible.length) {
        const empty = document.createElement('div');
        empty.className = 'note empty-state';
        empty.innerHTML = opportunitiesState.companyFilter
            ? `<p class="note-title">No opportunities for ${escapeHtml(opportunitiesState.companyFilter)}.</p><p class="note-details">Try clearing the company filter.</p>`
            : `<p class="note-title">No opportunities found</p><p class="note-details">You swiped through everything! Check back later for fresh leads.</p>`;
        notesWindow.appendChild(empty);
        if (
            !opportunitiesState.companyFilter &&
            opportunitiesState.all.length === 0
        ) {
            window.AudioManager?.play('fanfare');
            confetti({ particleCount: 120, spread: 60 });
        }
        return;
    }

    visible.forEach((opp, index) => {
        const card = createOpportunityElement(opp, index === 0);
        opportunitiesState.cardsById.set(opp.id, card);
        notesWindow.appendChild(card);
    });

    const firstCard = notesWindow.querySelector('.opportunity-card');
    if (firstCard) {
        setActiveCard(parseInt(firstCard.dataset.opportunityId, 10));
    }
}

function createOpportunityElement(opp, isTopScore = false) {
    const card = document.createElement('article');
    card.className = 'note opportunity-card';
    card.dataset.opportunityId = String(opp.id);
    card.dataset.company = opp.company_name || 'Unknown Company';
    card.tabIndex = 0;

    const salary = formatSalary(opp.salary_min, opp.salary_max);
    const location = formatLocation(opp);
    const date = formatDate(opp.posted_date || opp.created_at || opp.first_seen);

    card.innerHTML = `
        <div class="swipe-overlay swipe-overlay-left" aria-hidden="true">IGNORE</div>
        <div class="swipe-overlay swipe-overlay-right" aria-hidden="true">SAVE</div>
        <div class="card-header">
            <p class="${isTopScore ? 'note-title note-title--star' : 'note-title'}">
                ${isTopScore ? '<img src="images/star-svgrepo-com.svg" alt="" class="note-star" aria-hidden="true">' : ''}
                ${escapeHtml(opp.title)}
            </p>
            <p class="note-company">${escapeHtml(opp.company_name || 'Unknown Company')}</p>
            <p class="note-details">${escapeHtml(location)} · ${escapeHtml(salary)} · ${escapeHtml(date)}</p>
            <p class="note-score">Score: <span>${(opp.score || 0).toFixed(2)}</span></p>
        </div>
        <div class="note-actions">
            <button class="note-action-btn note-action-btn--todo" data-action="todo">Save</button>
            <button class="note-action-btn note-action-btn--ignore" data-action="ignored">Ignore</button>
            <button class="note-action-btn note-action-btn--applied" data-action="applied">Applied</button>
            ${(opp.apply_url || opp.url) ? `<a href="${escapeHtml(opp.apply_url || opp.url)}" target="_blank" class="note-action-btn note-action-btn--link">Apply ↗</a>` : ''}
        </div>
    `;

    card.addEventListener('focusin', () => setActiveCard(opp.id));
    card.addEventListener('swipe:activate', () => setActiveCard(opp.id));

    const requiresAuthButtons = card.querySelectorAll('.note-action-btn[data-action]');

    if (!window.api?.isAuthenticated?.()) {
        requiresAuthButtons.forEach((btn) => {
            btn.setAttribute('disabled', 'true');
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                window.authFunctions?.showErrorMessage(
                    'Log in to save, ignore, or track applications.',
                );
            });
        });
    } else {
        requiresAuthButtons.forEach((btn) => {
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                const action = btn.getAttribute('data-action');
                const direction = action === 'ignored' ? 'left' : 'right';
                if (
                    action !== 'ignored' &&
                    action !== 'todo' &&
                    action !== 'applied'
                ) {
                    return;
                }
                window.SwipeManager?.forceDecision(card, direction);
                handleOpportunityAction(opp, action);
            });
        });

        window.SwipeManager?.registerCard(card, {
            onDecision: (direction) => {
                const action = direction === 'right' ? 'todo' : 'ignored';
                handleOpportunityAction(opp, action);
            },
        });
    }

    return card;
}

function setActiveCard(opportunityId) {
    if (opportunitiesState.activeCardId === opportunityId) {
        return;
    }

    if (opportunitiesState.cardsById.has(opportunitiesState.activeCardId)) {
        const previous = opportunitiesState.cardsById.get(
            opportunitiesState.activeCardId,
        );
        previous?.classList.remove('is-active');
    }

    const next = opportunitiesState.cardsById.get(opportunityId);
    if (next) {
        next.classList.add('is-active');
        opportunitiesState.activeCardId = opportunityId;
    }
}

async function handleOpportunityAction(opportunity, status) {
    if (!opportunity) return;

    if (!window.api.isAuthenticated()) {
        window.authFunctions?.showErrorMessage('Log in to save, ignore, or track applications.');
        return;
    }

    const flyOffDelay = window.SwipeManager?.config?.flyOffDuration || 0;

    try {
        await window.api.updateOpportunityStatus(opportunity.id, status);

        const index = opportunitiesState.all.findIndex(
            (item) => item.id === opportunity.id,
        );
        if (index > -1) {
            const removed = opportunitiesState.all.splice(index, 1)[0];
            opportunitiesState.actionHistory.push({
                opportunity: cloneOpportunity(removed),
                index,
                status,
            });
        }

        if (status === 'ignored') {
            addStatusRow('ignored', opportunity);
            window.AudioManager?.play('swoosh');
        } else if (status === 'todo') {
            addStatusRow('todo', opportunity);
            window.AudioManager?.play('pop');
        } else if (status === 'applied') {
            addStatusRow('applied', opportunity);
            window.AudioManager?.play('bloop');
        }

        triggerHaptic();
        window.companiesWindow?.setOpportunities(opportunitiesState.all);
        if (status === 'todo' || status === 'applied') {
            window.applicationsWindow?.notifyStatusChange(status);
        }
        scheduleRender(flyOffDelay);
    } catch (err) {
        console.error('Failed to update opportunity:', err);
        window.authFunctions.showErrorMessage(
            'Failed to update. Please try again.',
        );
        scheduleRender(flyOffDelay);
    }
}

function addStatusRow(status, opportunity) {
    if (!statusFeed) return;

    const row = document.createElement('div');
    row.className = `status-row status-row--${status}`;
    row.dataset.opportunityId = String(opportunity.id);

    const iconSpan = document.createElement('span');
    iconSpan.className = 'status-icon';
    const icons = { ignored: '🚫', todo: '💾', applied: '✅' };
    iconSpan.textContent = icons[status] || 'ℹ️';

    const textSpan = document.createElement('span');
    textSpan.className = 'status-text';
    const actionText = {
        ignored: 'ignored',
        todo: 'saved',
        applied: 'marked applied',
    };
    textSpan.textContent = `${opportunity.title} @ ${opportunity.company_name || 'Unknown Company'} ${actionText[status] || ''}.`;

    const actions = document.createElement('div');
    actions.className = 'status-actions';

    if (status === 'ignored') {
        const reasons = ['Not a fit', 'Not interested'];
        reasons.forEach((reason) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'reason-btn';
            button.dataset.reason = reason;
            button.textContent = reason;
            button.addEventListener('click', () =>
                submitIgnoreReason(opportunity.id, reason, row, button),
            );
            actions.appendChild(button);
        });

        const otherWrap = document.createElement('div');
        otherWrap.className = 'reason-other';

        const otherBtn = document.createElement('button');
        otherBtn.type = 'button';
        otherBtn.className = 'reason-btn reason-btn--other';
        otherBtn.textContent = 'Other…';
        otherWrap.appendChild(otherBtn);

        const textarea = document.createElement('textarea');
        textarea.className = 'reason-textarea';
        textarea.placeholder = 'Tell us why…';
        textarea.rows = 2;
        otherWrap.appendChild(textarea);

        const submitBtn = document.createElement('button');
        submitBtn.type = 'button';
        submitBtn.className = 'reason-submit';
        submitBtn.textContent = 'Submit';
        otherWrap.appendChild(submitBtn);

        otherBtn.addEventListener('click', () => {
            otherWrap.classList.toggle('is-expanded');
            if (otherWrap.classList.contains('is-expanded')) {
                textarea.focus();
            }
        });

        submitBtn.addEventListener('click', () => {
            const value = textarea.value.trim();
            if (!value) {
                textarea.focus();
                return;
            }
            submitIgnoreReason(opportunity.id, value, row, submitBtn);
        });

        actions.appendChild(otherWrap);
    }

    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'undo-btn';
    undoBtn.textContent = 'Undo';
    undoBtn.addEventListener('click', undoLastAction);
    actions.appendChild(undoBtn);

    row.appendChild(iconSpan);
    row.appendChild(textSpan);
    row.appendChild(actions);

    statusFeed.prepend(row);
    while (statusFeed.childElementCount > 3) {
        statusFeed.removeChild(statusFeed.lastElementChild);
    }
}

async function submitIgnoreReason(opportunityId, reason, row, sourceBtn) {
    if (!row || row.classList.contains('reason-set')) {
        return;
    }

    row.classList.add('reason-set');
    sourceBtn?.classList.add('is-selected');
    window.AudioManager?.play('bloop');

    try {
        await window.api.updateOpportunityStatus(opportunityId, 'ignored', {
            ignore_reason: reason,
        });
    } catch (err) {
        console.error('Failed to save ignore reason:', err);
    }
}

async function undoLastAction() {
    const lastAction = opportunitiesState.actionHistory.pop();
    if (!lastAction) {
        window.authFunctions?.showErrorMessage('Nothing to undo.');
        return;
    }

    opportunitiesState.all.splice(
        lastAction.index ?? 0,
        0,
        lastAction.opportunity,
    );
    window.companiesWindow?.setOpportunities(opportunitiesState.all);
    window.applicationsWindow?.notifyStatusChange('todo');
    window.AudioManager?.play('pop');
    triggerHaptic();

    try {
        await window.api.updateOpportunityStatus(
            lastAction.opportunity.id,
            'todo',
        );
    } catch (err) {
        console.error('Failed to revert status:', err);
    }

    const row = statusFeed?.querySelector(
        `[data-opportunity-id="${lastAction.opportunity.id}"]`,
    );
    row?.remove();
    scheduleRender();
}

function applyQuickReason(index) {
    if (!statusFeed) return;
    const row = statusFeed.querySelector(
        '.status-row--ignored:not(.reason-set)',
    );
    if (!row) return;
    const buttons = row.querySelectorAll('.reason-btn[data-reason]');
    const button = buttons[index];
    button?.click();
}

function triggerOtherReason() {
    if (!statusFeed) return;
    const row = statusFeed.querySelector(
        '.status-row--ignored:not(.reason-set)',
    );
    if (!row) return;
    const otherBtn = row.querySelector('.reason-btn--other');
    otherBtn?.click();
    row.querySelector('.reason-textarea')?.focus();
}

function registerKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        if (
            event.target &&
            ['INPUT', 'TEXTAREA'].includes(event.target.tagName)
        ) {
            return;
        }

        const activeOpportunity =
            opportunitiesState.all.find(
                (opp) => opp.id === opportunitiesState.activeCardId,
            ) || opportunitiesState.all[0];
        if (!activeOpportunity) {
            return;
        }

        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            if (!window.api?.isAuthenticated?.()) {
                window.authFunctions?.showErrorMessage(
                    'Log in to save, ignore, or track applications.',
                );
                return;
            }
            const card = opportunitiesState.cardsById.get(activeOpportunity.id);
            window.SwipeManager?.forceDecision(card, 'left');
            handleOpportunityAction(activeOpportunity, 'ignored');
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            if (!window.api?.isAuthenticated?.()) {
                window.authFunctions?.showErrorMessage(
                    'Log in to save, ignore, or track applications.',
                );
                return;
            }
            const card = opportunitiesState.cardsById.get(activeOpportunity.id);
            window.SwipeManager?.forceDecision(card, 'right');
            handleOpportunityAction(activeOpportunity, 'todo');
        } else if (event.key === '1') {
            event.preventDefault();
            applyQuickReason(0);
        } else if (event.key === '2') {
            event.preventDefault();
            applyQuickReason(1);
        } else if (event.key === '3') {
            event.preventDefault();
            triggerOtherReason();
        } else if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 'z'
        ) {
            event.preventDefault();
            undoLastAction();
        }
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatSalary(min, max) {
    if (!min && !max) return 'Salary not listed';

    const formatAmount = (amount) => {
        if (!amount) return null;
        return amount >= 1000 ? `$${Math.round(amount / 1000)}k` : `$${amount}`;
    };

    const minStr = formatAmount(min);
    const maxStr = formatAmount(max);

    if (minStr && maxStr) {
        return `${minStr} – ${maxStr}`;
    }
    return minStr || maxStr || 'N/A';
}

function formatLocation(opp) {
    const parts = [];

    if (opp.location_city || opp.city) parts.push(opp.location_city || opp.city);
    if (opp.location_state || opp.state) parts.push(opp.location_state || opp.state);

    if (parts.length === 0) {
        return opp.location_raw || 'Location not specified';
    }

    return parts.join(', ');
}

function formatDate(dateString) {
    if (!dateString) return 'Date unknown';

    try {
        const date = new Date(dateString);
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    } catch (err) {
        return dateString;
    }
}

function showPlaceholderOpportunities() {
    const notesWindow = document.querySelector(NOTES_WINDOW_SELECTOR);
    if (!notesWindow) return;

    notesWindow.innerHTML = `
        <div class="note">
            <p class="note-title note-title--star">
                <img src="images/star-svgrepo-com.svg" alt="" class="note-star" aria-hidden="true">
                Supervising Producer, Politics Video Podcast
            </p>
            <p class="note-company">Vox Media</p>
            <p class="note-details">New York, NY · $120,000 – $140,000 · Dec 5, 2025</p>
            <p class="note-score">Score: <span>100.00</span></p>
        </div>
        <div class="note">
            <p class="note-title">Director, Content Strategy</p>
            <p class="note-company">Hulu</p>
            <p class="note-details">Santa Monica, CA · $188,400 – $252,600 · Dec 18, 2025</p>
            <p class="note-score">Score: <span>77.32</span></p>
        </div>
        <div class="note empty-state" style="margin-top: 2rem; border-top: 1px solid #ccc; padding-top: 1rem;">
            <p class="note-title">🔒 Log in to see personalized opportunities</p>
            <p class="note-details">These are sample listings. Sign in to get your personalized job feed.</p>
        </div>
    `;
}

registerKeyboardShortcuts();

document.addEventListener('DOMContentLoaded', () => {
    updateOpportunitiesWindowTitle();
    loadOpportunities();
});

document.addEventListener('pp:auth-changed', () => {
    updateOpportunitiesWindowTitle();
    loadOpportunities();
});

window.loadOpportunities = loadOpportunities;
window.opportunitiesView = {
    filterByCompany: (company) => {
        opportunitiesState.companyFilter = company;
        scheduleRender();
    },
    clearCompanyFilter: () => {
        opportunitiesState.companyFilter = null;
        scheduleRender();
    },
    refresh: loadOpportunities,
};
