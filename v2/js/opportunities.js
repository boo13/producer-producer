/**
 * Opportunities Module for Producer-Producer v2
 * Handles loading and rendering job cards in the swipe interface
 */

(function initOpportunitiesV2() {
    'use strict';

    // State management
    const state = {
        opportunities: [],
        currentIndex: 0,
        actionHistory: [],
    };

    // DOM references
    let cardStackEl = null;

    // ==========================================================================
    // Helper Functions
    // ==========================================================================

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

    // ==========================================================================
    // Card Creation
    // ==========================================================================

    /**
     * Create a job card DOM element
     * @param {Object} opportunity - Opportunity data from API
     * @param {number} stackPosition - Position in stack (1 = top, 2, 3 = underneath)
     * @returns {HTMLElement}
     */
    function createCardElement(opportunity, stackPosition) {
        const card = document.createElement('article');
        card.className = 'job-card';
        card.dataset.opportunityId = String(opportunity.id);
        card.dataset.stackPosition = String(stackPosition);

        const salary = formatSalary(opportunity.salary_min, opportunity.salary_max);
        const location = formatLocation(opportunity);
        const date = formatDate(opportunity.posted_date || opportunity.created_at || opportunity.first_seen);

        card.innerHTML = `
            <div class="swipe-overlay-left" aria-hidden="true">NOPE</div>
            <div class="swipe-overlay-right" aria-hidden="true">SAVE</div>
            <div class="job-card__header">
                <h2 class="job-card__title">${escapeHtml(opportunity.title)}</h2>
                <p class="job-card__company">${escapeHtml(opportunity.company_name || 'Unknown Company')}</p>
            </div>
            <p class="job-card__meta">${escapeHtml(location)}</p>
            <p class="job-card__meta">${escapeHtml(salary)}</p>
            <p class="job-card__meta">${escapeHtml(date)}</p>
            ${opportunity.score ? `<span class="job-card__score">Score: ${opportunity.score.toFixed(1)}</span>` : ''}
        `;

        return card;
    }

    // ==========================================================================
    // Rendering
    // ==========================================================================

    /**
     * Render the card stack with the current opportunities
     */
    function renderCards() {
        if (!cardStackEl) {
            cardStackEl = document.getElementById('card-stack');
        }

        if (!cardStackEl) {
            console.warn('[OpportunitiesV2] Card stack element not found');
            return;
        }

        // Clear existing cards
        cardStackEl.innerHTML = '';

        // Show empty state if no opportunities
        if (state.opportunities.length === 0 || state.currentIndex >= state.opportunities.length) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <h2 class="empty-state__title">No more jobs</h2>
                <p class="empty-state__message">You've seen all available opportunities. Check back later for fresh leads!</p>
            `;
            cardStackEl.appendChild(emptyState);
            console.log('[OpportunitiesV2] Empty state rendered');
            return;
        }

        // Render top 3 cards for smooth transitions
        const cardsToRender = Math.min(3, state.opportunities.length - state.currentIndex);

        for (let i = 0; i < cardsToRender; i++) {
            const opportunityIndex = state.currentIndex + i;
            const opportunity = state.opportunities[opportunityIndex];
            const stackPosition = i + 1; // 1 = top, 2, 3 = underneath

            const card = createCardElement(opportunity, stackPosition);
            cardStackEl.appendChild(card);

            // Register top card with SwipeManager if authenticated
            if (stackPosition === 1 && window.SwipeManager) {
                window.SwipeManager.registerCard(card, {
                    onDecision: (direction) => {
                        handleSwipeDecision(opportunity, direction);
                    },
                });
            }
        }

        console.log(`[OpportunitiesV2] Rendered ${cardsToRender} cards, index: ${state.currentIndex}/${state.opportunities.length}`);
    }

    // ==========================================================================
    // Swipe Handling
    // ==========================================================================

    /**
     * Handle swipe decision (left = ignore, right = save)
     * @param {Object} opportunity - The swiped opportunity
     * @param {string} direction - 'left' or 'right'
     */
    async function handleSwipeDecision(opportunity, direction) {
        const status = direction === 'right' ? 'todo' : 'ignored';

        // Save to action history for undo
        state.actionHistory.push({
            opportunity,
            index: state.currentIndex,
            status,
        });

        // Move to next card
        state.currentIndex++;

        // Update API if authenticated
        if (window.api?.isAuthenticated?.()) {
            try {
                await window.api.updateOpportunityStatus(opportunity.id, status);
                console.log(`[OpportunitiesV2] Opportunity ${opportunity.id} marked as ${status}`);
            } catch (err) {
                console.error('[OpportunitiesV2] Failed to update opportunity status:', err);
            }
        }

        // Re-render cards
        renderCards();
    }

    // ==========================================================================
    // Data Loading
    // ==========================================================================

    /**
     * Load opportunities from API
     */
    async function loadOpportunities() {
        console.log('[OpportunitiesV2] Loading opportunities...');

        try {
            // Always load the public ranked feed
            let opportunities = await window.api.getOpportunityFeed({
                min_score: 50,
                limit: 50,
            });

            // If authenticated, filter out ignored/applied
            if (window.api?.isAuthenticated?.()) {
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

            // Sort by score descending
            state.opportunities = [...(opportunities || [])].sort(
                (a, b) => (b.score || 0) - (a.score || 0)
            );
            state.currentIndex = 0;
            state.actionHistory = [];

            console.log(`[OpportunitiesV2] Loaded ${state.opportunities.length} opportunities`);

            renderCards();
        } catch (err) {
            console.error('[OpportunitiesV2] Failed to load opportunities:', err);

            // Show error in card stack
            if (cardStackEl) {
                cardStackEl.innerHTML = `
                    <div class="empty-state">
                        <h2 class="empty-state__title">Failed to load</h2>
                        <p class="empty-state__message">Could not load opportunities. Please try again later.</p>
                    </div>
                `;
            }
        }
    }

    // ==========================================================================
    // Undo Support
    // ==========================================================================

    /**
     * Undo the last swipe action
     */
    async function undoLastAction() {
        const lastAction = state.actionHistory.pop();
        if (!lastAction) {
            console.log('[OpportunitiesV2] Nothing to undo');
            return;
        }

        // Restore the opportunity at its previous position
        state.currentIndex = Math.max(0, state.currentIndex - 1);

        // Revert API status if authenticated
        if (window.api?.isAuthenticated?.()) {
            try {
                await window.api.updateOpportunityStatus(lastAction.opportunity.id, 'todo');
                console.log(`[OpportunitiesV2] Reverted opportunity ${lastAction.opportunity.id} to todo`);
            } catch (err) {
                console.error('[OpportunitiesV2] Failed to revert status:', err);
            }
        }

        renderCards();
    }

    // ==========================================================================
    // Initialization
    // ==========================================================================

    /**
     * Initialize the opportunities module
     */
    function init() {
        cardStackEl = document.getElementById('card-stack');

        if (!cardStackEl) {
            console.warn('[OpportunitiesV2] Card stack element not found, waiting for DOM...');
            return;
        }

        loadOpportunities();
    }

    // Listen for auth changes to reload opportunities
    document.addEventListener('pp:auth-changed', () => {
        console.log('[OpportunitiesV2] Auth state changed, reloading opportunities');
        loadOpportunities();
    });

    // Initialize on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export public interface
    window.opportunitiesV2 = {
        loadOpportunities,
        renderCards,
        undoLastAction,
        getState: () => ({ ...state }),
    };
})();
