/**
 * Opportunities UI - Load and display personalized job listings
 */

let currentOpportunities = [];

/**
 * Load opportunities from API
 */
async function loadOpportunities() {
    if (!window.api.isAuthenticated()) {
        showPlaceholderOpportunities();
        return;
    }

    try {
        window.authFunctions.showLoadingState('Loading opportunities...');

        // Get personalized opportunities (excluding ignored and applied)
        const opportunities = await window.api.getOpportunitiesForMe({
            min_score: 50,
            limit: 20,
        });

        currentOpportunities = opportunities;
        renderOpportunities(opportunities);
    } catch (err) {
        console.error('Failed to load opportunities:', err);
        window.authFunctions.showErrorMessage('Failed to load opportunities.');
    } finally {
        window.authFunctions.hideLoadingState();
    }
}

/**
 * Render opportunities in the notes window
 */
function renderOpportunities(opportunities) {
    const notesWindow = document.querySelector('.notes-window .window-body');
    if (!notesWindow) return;

    // Clear existing content
    notesWindow.innerHTML = '';

    if (!opportunities || opportunities.length === 0) {
        notesWindow.innerHTML = `
            <div class="note empty-state">
                <p class="note-title">No opportunities found</p>
                <p class="note-details">Check back later for new listings!</p>
            </div>
        `;
        return;
    }

    // Sort by score descending
    const sorted = [...opportunities].sort((a, b) => (b.score || 0) - (a.score || 0));

    // Render each opportunity
    sorted.forEach((opp, index) => {
        const note = createOpportunityElement(opp, index === 0);
        notesWindow.appendChild(note);
    });
}

/**
 * Create opportunity HTML element
 */
function createOpportunityElement(opp, isTopScore = false) {
    const note = document.createElement('div');
    note.className = 'note';
    note.dataset.opportunityId = opp.id;

    // Format salary
    const salary = formatSalary(opp.salary_min, opp.salary_max);

    // Format location
    const location = formatLocation(opp);

    // Format date
    const date = formatDate(opp.posted_date || opp.created_at);

    // Title with optional star
    const titleClass = isTopScore ? 'note-title note-title--star' : 'note-title';
    const starIcon = isTopScore
        ? '<img src="images/star-svgrepo-com.svg" alt="" class="note-star" aria-hidden="true">'
        : '';

    note.innerHTML = `
        <p class="${titleClass}">
            ${starIcon}
            ${escapeHtml(opp.title)}
        </p>
        <p class="note-company">${escapeHtml(opp.company_name || 'Unknown Company')}</p>
        <p class="note-details">${location} · ${salary} · ${date}</p>
        <p class="note-score">Score: <span>${(opp.score || 0).toFixed(2)}</span></p>
        <div class="note-actions">
            <button class="note-action-btn note-action-btn--todo" data-action="todo" data-id="${opp.id}">
                Save
            </button>
            <button class="note-action-btn note-action-btn--ignore" data-action="ignored" data-id="${opp.id}">
                Ignore
            </button>
            <button class="note-action-btn note-action-btn--applied" data-action="applied" data-id="${opp.id}">
                Applied
            </button>
            ${opp.apply_url ? `<a href="${escapeHtml(opp.apply_url)}" target="_blank" class="note-action-btn note-action-btn--link">Apply ↗</a>` : ''}
        </div>
    `;

    // Add click handlers for action buttons
    note.querySelectorAll('.note-action-btn[data-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const action = btn.dataset.action;
            const id = parseInt(btn.dataset.id);
            await updateOpportunityStatus(id, action);
        });
    });

    return note;
}

/**
 * Update opportunity status
 */
async function updateOpportunityStatus(opportunityId, status) {
    try {
        window.authFunctions.showLoadingState('Updating...');

        await window.api.updateOpportunityStatus(opportunityId, status);

        // Remove from current view if ignored or applied
        if (status === 'ignored' || status === 'applied') {
            currentOpportunities = currentOpportunities.filter(o => o.id !== opportunityId);
            renderOpportunities(currentOpportunities);
        }

        const statusMessages = {
            'todo': 'Saved to your list',
            'ignored': 'Opportunity ignored',
            'applied': 'Marked as applied',
        };

        window.authFunctions.showSuccessMessage(statusMessages[status] || 'Updated');
    } catch (err) {
        console.error('Failed to update opportunity:', err);
        window.authFunctions.showErrorMessage('Failed to update. Please try again.');
    } finally {
        window.authFunctions.hideLoadingState();
    }
}

/**
 * Format salary range
 */
function formatSalary(min, max) {
    if (!min && !max) return 'Salary not listed';

    const formatAmount = (amount) => {
        if (!amount) return null;
        return amount >= 1000
            ? `$${Math.round(amount / 1000)}k`
            : `$${amount}`;
    };

    const minStr = formatAmount(min);
    const maxStr = formatAmount(max);

    if (minStr && maxStr) {
        return `${minStr} – ${maxStr}`;
    }
    return minStr || maxStr || 'N/A';
}

/**
 * Format location
 */
function formatLocation(opp) {
    const parts = [];

    if (opp.location_city) parts.push(opp.location_city);
    if (opp.location_state) parts.push(opp.location_state);

    if (parts.length === 0) {
        return opp.location_raw || 'Location not specified';
    }

    return parts.join(', ');
}

/**
 * Format date
 */
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

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show placeholder opportunities for non-authenticated users
 */
function showPlaceholderOpportunities() {
    const notesWindow = document.querySelector('.notes-window .window-body');
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

/**
 * Initialize opportunities on page load
 */
document.addEventListener('DOMContentLoaded', () => {
    loadOpportunities();
});

// Export for global use
window.loadOpportunities = loadOpportunities;
