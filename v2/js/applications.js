/**
 * Applications Module for Producer-Producer v2
 * Handles loading and displaying saved jobs (applications tracker)
 */

(function initApplicationsV2() {
    'use strict';

    // State management
    const state = {
        applications: [],  // Saved jobs (todo status)
        appliedIds: new Set(),  // Jobs already marked as applied
        isVisible: false,
    };

    // DOM references
    let listContainerEl = null;

    // ==========================================================================
    // Helper Functions
    // ==========================================================================

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

    // ==========================================================================
    // List Rendering
    // ==========================================================================

    /**
     * Render the applications list
     */
    function renderList() {
        if (!listContainerEl) {
            listContainerEl = document.getElementById('applications-list');
        }

        if (!listContainerEl) {
            console.warn('[ApplicationsV2] Applications list element not found');
            return;
        }

        // Clear existing content
        listContainerEl.innerHTML = '';

        // Show empty state if no applications
        if (state.applications.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'app-list__empty';
            emptyState.innerHTML = `
                <h2 class="app-list__empty-title">No saved jobs yet</h2>
                <p class="app-list__empty-message">Swipe right on jobs you like!</p>
            `;
            listContainerEl.appendChild(emptyState);
            console.log('[ApplicationsV2] Empty state rendered');
            return;
        }

        // Render each application
        state.applications.forEach((app) => {
            const opp = app.opportunity || app;
            const oppId = app.opportunity_id || opp.id;
            const isApplied = state.appliedIds.has(oppId);

            const item = document.createElement('div');
            item.className = 'app-list__item';
            item.dataset.opportunityId = String(oppId);

            const location = formatLocation(opp);

            item.innerHTML = `
                <div class="app-list__info">
                    <p class="app-list__title">${escapeHtml(opp.title)}</p>
                    <p class="app-list__company">${escapeHtml(opp.company_name || 'Unknown Company')}</p>
                    <p class="app-list__meta">${escapeHtml(location)}</p>
                </div>
                <div class="app-list__actions">
                    <button class="app-list__btn${isApplied ? ' app-list__btn--applied' : ''}" type="button">
                        ${isApplied ? 'Applied' : 'Mark Applied'}
                    </button>
                </div>
            `;

            // Wire up button if not already applied
            if (!isApplied) {
                const btn = item.querySelector('.app-list__btn');
                btn.addEventListener('click', () => markAsApplied(oppId));
            }

            listContainerEl.appendChild(item);
        });

        console.log(`[ApplicationsV2] Rendered ${state.applications.length} applications`);
    }

    // ==========================================================================
    // Data Loading
    // ==========================================================================

    /**
     * Load saved applications from API
     */
    async function loadApplications() {
        console.log('[ApplicationsV2] Loading applications...');

        if (!window.api?.isAuthenticated?.()) {
            console.log('[ApplicationsV2] Not authenticated, showing empty state');
            state.applications = [];
            state.appliedIds.clear();
            renderList();
            return;
        }

        try {
            // Load both todo (saved) and applied jobs
            const [todoJobs, appliedJobs] = await Promise.all([
                window.api.getUserOpportunities({ status_filter: 'todo', limit: 100 }),
                window.api.getUserOpportunities({ status_filter: 'applied', limit: 100 }),
            ]);

            state.applications = todoJobs || [];
            state.appliedIds = new Set((appliedJobs || []).map((j) => j.opportunity_id));

            console.log(`[ApplicationsV2] Loaded ${state.applications.length} saved jobs, ${state.appliedIds.size} applied`);

            renderList();
        } catch (err) {
            console.error('[ApplicationsV2] Failed to load applications:', err);

            // Show error in list
            if (listContainerEl) {
                listContainerEl.innerHTML = `
                    <div class="app-list__empty">
                        <h2 class="app-list__empty-title">Failed to load</h2>
                        <p class="app-list__empty-message">${err.message || 'Could not load saved jobs. Please try again.'}</p>
                    </div>
                `;
            }
        }
    }

    // ==========================================================================
    // Actions
    // ==========================================================================

    /**
     * Mark a job as applied
     * @param {number|string} opportunityId - The opportunity ID to mark
     */
    async function markAsApplied(opportunityId) {
        console.log(`[ApplicationsV2] Marking as applied: ${opportunityId}`);

        try {
            await window.api.updateOpportunityStatus(opportunityId, 'applied');

            // Update local state
            state.appliedIds.add(Number(opportunityId));

            // Remove from applications list (it's now applied, not todo)
            state.applications = state.applications.filter(
                (app) => (app.opportunity_id || app.opportunity?.id || app.id) !== Number(opportunityId)
            );

            // Show toast
            showToast('Marked as applied');

            // Re-render
            renderList();

            console.log(`[ApplicationsV2] Successfully marked ${opportunityId} as applied`);
        } catch (err) {
            console.error('[ApplicationsV2] Failed to mark as applied:', err);
            showToast('Failed to update status');
        }
    }

    /**
     * Show a simple toast notification
     * @param {string} message - Message to display
     */
    function showToast(message) {
        // Remove existing toast if any
        const existingToast = document.querySelector('.undo-toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'undo-toast';
        toast.innerHTML = `
            <span class="undo-toast__text">${escapeHtml(message)}</span>
        `;

        document.getElementById('app').appendChild(toast);

        // Auto-dismiss after 3 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('undo-toast--fade');
                setTimeout(() => toast.remove(), 300);
            }
        }, 3000);
    }

    // ==========================================================================
    // View Management
    // ==========================================================================

    /**
     * Show the applications list view
     */
    function show() {
        const cardStack = document.getElementById('card-stack');
        const actionButtons = document.querySelector('.action-buttons');
        listContainerEl = document.getElementById('applications-list');

        if (cardStack) cardStack.hidden = true;
        if (actionButtons) actionButtons.hidden = true;
        if (listContainerEl) listContainerEl.hidden = false;

        state.isVisible = true;

        // Refresh data when showing
        loadApplications();

        console.log('[ApplicationsV2] View shown');
    }

    /**
     * Hide the applications list view
     */
    function hide() {
        const cardStack = document.getElementById('card-stack');
        const actionButtons = document.querySelector('.action-buttons');
        listContainerEl = document.getElementById('applications-list');

        if (cardStack) cardStack.hidden = false;
        if (actionButtons) actionButtons.hidden = false;
        if (listContainerEl) listContainerEl.hidden = true;

        state.isVisible = false;

        console.log('[ApplicationsV2] View hidden');
    }

    /**
     * Toggle between swipe and applications views
     */
    function toggle() {
        if (state.isVisible) {
            hide();
        } else {
            show();
        }
    }

    /**
     * Check if applications view is currently visible
     * @returns {boolean}
     */
    function isVisible() {
        return state.isVisible;
    }

    // ==========================================================================
    // Initialization
    // ==========================================================================

    /**
     * Initialize the applications module
     */
    function init() {
        listContainerEl = document.getElementById('applications-list');

        if (!listContainerEl) {
            console.warn('[ApplicationsV2] Applications list element not found, waiting for DOM...');
            return;
        }

        console.log('[ApplicationsV2] Initialized');
    }

    // Listen for auth changes to reload applications
    document.addEventListener('pp:auth-changed', () => {
        if (state.isVisible) {
            console.log('[ApplicationsV2] Auth state changed, reloading applications');
            loadApplications();
        }
    });

    // Initialize on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export public interface
    window.applicationsV2 = {
        loadApplications,
        show,
        hide,
        toggle,
        isVisible,
    };
})();
