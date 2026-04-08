/**
 * Add Job Module for Producer-Producer v2
 * Handles the FAB button and modal form for adding external job URLs
 */

(function initAddJobV2() {
    'use strict';

    // State management
    const state = {
        isOpen: false,
    };

    // DOM references
    let fabBtn = null;
    let modal = null;
    let form = null;
    let cancelBtn = null;
    let errorEl = null;

    // ==========================================================================
    // Modal Management
    // ==========================================================================

    /**
     * Open the add job modal
     */
    function openModal() {
        if (!modal) return;

        state.isOpen = true;
        modal.hidden = false;

        // Focus first input
        const firstInput = form?.querySelector('input');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 50);
        }

        console.log('[AddJobV2] Modal opened');
    }

    /**
     * Close the add job modal
     */
    function closeModal() {
        if (!modal) return;

        state.isOpen = false;
        modal.hidden = true;

        // Reset form
        if (form) {
            form.reset();
        }

        // Clear error
        hideError();

        // Re-enable submit button
        const submitBtn = form?.querySelector('.add-job__submit');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Job';
        }

        console.log('[AddJobV2] Modal closed');
    }

    // ==========================================================================
    // Error Handling
    // ==========================================================================

    /**
     * Show error message in form
     * @param {string} message - Error message to display
     */
    function showError(message) {
        if (!errorEl) return;

        errorEl.textContent = message;
        errorEl.classList.add('add-job__error--visible');
    }

    /**
     * Hide error message
     */
    function hideError() {
        if (!errorEl) return;

        errorEl.textContent = '';
        errorEl.classList.remove('add-job__error--visible');
    }

    // ==========================================================================
    // Toast Notification
    // ==========================================================================

    /**
     * Show a success toast notification
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

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string}
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==========================================================================
    // Form Handling
    // ==========================================================================

    /**
     * Handle form submission
     * @param {Event} e - Submit event
     */
    async function handleSubmit(e) {
        e.preventDefault();

        hideError();

        // Get form data
        const formData = new FormData(form);
        const data = {
            url: formData.get('url')?.trim(),
            title: formData.get('title')?.trim(),
            company_name: formData.get('company_name')?.trim(),
            location: formData.get('location')?.trim() || null,
            notes: formData.get('notes')?.trim() || null,
        };

        // Validate required fields
        if (!data.url) {
            showError('Please enter a job URL');
            return;
        }
        if (!data.title) {
            showError('Please enter a job title');
            return;
        }
        if (!data.company_name) {
            showError('Please enter a company name');
            return;
        }

        // Validate URL format
        try {
            new URL(data.url);
        } catch {
            showError('Please enter a valid URL');
            return;
        }

        // Show loading state
        const submitBtn = form.querySelector('.add-job__submit');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Adding...';
        }

        console.log('[AddJobV2] Submitting job:', data);

        try {
            // Create the opportunity via API
            const opportunity = await window.api.addOpportunity(data);
            console.log('[AddJobV2] Opportunity created:', opportunity);

            // If authenticated, evaluate for user to add to their queue
            if (window.api?.isAuthenticated?.()) {
                try {
                    await window.api.evaluateOpportunity(opportunity.id);
                    console.log('[AddJobV2] Opportunity evaluated for user');
                } catch (evalErr) {
                    console.warn('[AddJobV2] Failed to evaluate opportunity:', evalErr);
                    // Don't fail the whole operation if evaluate fails
                }
            } else {
                console.log('[AddJobV2] User not authenticated - job added to public feed only');
            }

            // Success!
            closeModal();
            showToast('Job added!');

            // Reload opportunities to show the new job
            if (window.opportunitiesV2?.loadOpportunities) {
                window.opportunitiesV2.loadOpportunities();
            }

        } catch (err) {
            console.error('[AddJobV2] Failed to add job:', err);
            showError(err.message || 'Failed to add job. Please try again.');

            // Re-enable submit button on error
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Add Job';
            }
        }
    }

    // ==========================================================================
    // Event Listeners
    // ==========================================================================

    /**
     * Handle modal backdrop click
     * @param {Event} e - Click event
     */
    function handleBackdropClick(e) {
        // Close if clicking on the backdrop (not the modal content)
        if (e.target === modal) {
            closeModal();
        }
    }

    /**
     * Handle escape key to close modal
     * @param {KeyboardEvent} e - Keyboard event
     */
    function handleEscapeKey(e) {
        if (e.key === 'Escape' && state.isOpen) {
            closeModal();
        }
    }

    // ==========================================================================
    // FAB Visibility
    // ==========================================================================

    /**
     * Update FAB visibility based on current view
     * Hide when applications list is visible
     */
    function updateFabVisibility() {
        if (!fabBtn) return;

        const isApplicationsVisible = window.applicationsV2?.isVisible?.() || false;
        fabBtn.hidden = isApplicationsVisible;
    }

    // ==========================================================================
    // Initialization
    // ==========================================================================

    /**
     * Initialize the add job module
     */
    function init() {
        // Get DOM references
        fabBtn = document.getElementById('add-job-fab');
        modal = document.getElementById('add-job-modal');
        form = document.getElementById('add-job-form');
        cancelBtn = document.getElementById('add-job-cancel');
        errorEl = document.getElementById('add-job-error');

        if (!fabBtn || !modal || !form) {
            console.warn('[AddJobV2] Required elements not found');
            return;
        }

        // FAB click opens modal
        fabBtn.addEventListener('click', openModal);

        // Form submit
        form.addEventListener('submit', handleSubmit);

        // Cancel button
        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeModal);
        }

        // Backdrop click
        modal.addEventListener('click', handleBackdropClick);

        // Escape key
        document.addEventListener('keydown', handleEscapeKey);

        // Listen for view changes to update FAB visibility
        // The applications module triggers tab clicks, so we observe those
        const tabs = document.querySelectorAll('.app-header__tab');
        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                // Small delay to let view change complete
                setTimeout(updateFabVisibility, 10);
            });
        });

        console.log('[AddJobV2] Initialized');
    }

    // Initialize on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export public interface
    window.addJobV2 = {
        openModal,
        closeModal,
        isOpen: () => state.isOpen,
    };
})();
