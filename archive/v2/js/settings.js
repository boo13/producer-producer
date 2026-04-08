/**
 * Settings Module for Producer-Producer v2
 * Handles settings modal, config loading/saving, and settings button visibility.
 */

(function() {
    'use strict';

    // DOM elements
    let settingsModal;
    let settingsForm;
    let settingsDigestEnabled;
    let settingsDigestThreshold;
    let settingsError;
    let settingsBtn;
    let settingsCloseBtn;
    let settingsCancelBtn;

    /**
     * Initialize settings modal
     */
    function initSettings() {
        settingsModal = document.getElementById('settings-modal');
        settingsForm = document.getElementById('settings-form');
        settingsDigestEnabled = document.getElementById('settings-digest-enabled');
        settingsDigestThreshold = document.getElementById('settings-digest-threshold');
        settingsError = document.getElementById('settings-error');
        settingsBtn = document.getElementById('settings-btn');
        settingsCloseBtn = document.getElementById('settings-close');
        settingsCancelBtn = document.getElementById('settings-cancel');

        if (!settingsModal || !settingsForm) {
            console.warn('[Settings] Modal elements not found');
            return;
        }

        // Settings button click -> open modal
        if (settingsBtn) {
            settingsBtn.addEventListener('click', openSettings);
        }

        // Close button click -> close modal
        if (settingsCloseBtn) {
            settingsCloseBtn.addEventListener('click', closeSettings);
        }

        // Cancel button click -> close modal
        if (settingsCancelBtn) {
            settingsCancelBtn.addEventListener('click', closeSettings);
        }

        // Backdrop click -> close modal
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                closeSettings();
            }
        });

        // Form submit -> handle save
        settingsForm.addEventListener('submit', handleSettingsSave);

        // Listen for auth changes -> update button visibility
        document.addEventListener('pp:auth-changed', updateSettingsButtonVisibility);

        // Initial button visibility check
        updateSettingsButtonVisibility();
    }

    /**
     * Open settings modal and load current config
     */
    async function openSettings() {
        if (!settingsModal) return;

        // Clear previous error
        hideError();

        // Show modal first (so user sees loading state)
        settingsModal.hidden = false;

        // Fetch and populate current config
        try {
            const config = await window.api.getUserConfig();
            populateForm(config);
        } catch (err) {
            console.error('[Settings] Failed to load config:', err);
            showError('Failed to load settings');
        }
    }

    /**
     * Close settings modal
     */
    function closeSettings() {
        if (!settingsModal) return;
        settingsModal.hidden = true;
    }

    /**
     * Populate form with config data
     */
    function populateForm(config) {
        if (!config) return;

        // Digest enabled
        if (settingsDigestEnabled && config.digest_enabled !== undefined) {
            settingsDigestEnabled.checked = config.digest_enabled;
        }

        // Digest threshold
        if (settingsDigestThreshold && config.digest_threshold !== undefined) {
            settingsDigestThreshold.value = config.digest_threshold;
        }
    }

    /**
     * Handle settings form save
     */
    async function handleSettingsSave(e) {
        e.preventDefault();

        hideError();

        // Collect form data
        const config = {
            digest_enabled: settingsDigestEnabled?.checked ?? true,
            digest_threshold: parseInt(settingsDigestThreshold?.value, 10) || 80,
        };

        // Validate threshold range
        if (config.digest_threshold < 0 || config.digest_threshold > 100) {
            showError('Digest threshold must be between 0 and 100');
            return;
        }

        // Disable submit button
        const submitBtn = settingsForm.querySelector('.settings__submit');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
        }

        try {
            await window.api.updateUserConfig(config);

            // Show success toast
            showToast('Settings saved!');

            // Close modal
            closeSettings();

        } catch (err) {
            console.error('[Settings] Failed to save:', err);
            showError(err.message || 'Failed to save settings');
        } finally {
            // Re-enable submit button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save';
            }
        }
    }

    /**
     * Update settings button visibility based on auth state
     */
    function updateSettingsButtonVisibility() {
        const isAuthenticated = window.api?.isAuthenticated();

        // Settings button: show only when authenticated
        if (settingsBtn) {
            settingsBtn.hidden = !isAuthenticated;
        }
    }

    /**
     * Show error message in modal
     */
    function showError(message) {
        if (!settingsError) return;
        settingsError.textContent = message;
        settingsError.classList.add('settings__error--visible');
    }

    /**
     * Hide error message
     */
    function hideError() {
        if (!settingsError) return;
        settingsError.textContent = '';
        settingsError.classList.remove('settings__error--visible');
    }

    /**
     * Show toast notification (reuses undo-toast pattern)
     */
    function showToast(message) {
        // Remove any existing toast
        const existingToast = document.querySelector('.undo-toast');
        if (existingToast) {
            existingToast.remove();
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = 'undo-toast';
        toast.innerHTML = `<span class="undo-toast__text">${message}</span>`;

        document.body.appendChild(toast);

        // Auto-dismiss after 3 seconds
        setTimeout(() => {
            toast.classList.add('undo-toast--fade');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Initialize on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', initSettings);

    // Export for external use
    window.settingsFunctions = {
        openSettings,
        closeSettings,
        updateSettingsButtonVisibility,
    };
})();
