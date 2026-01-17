/**
 * Settings Modal - User configuration management
 */

/**
 * Initialize settings modal
 */
function initSettingsModal() {
    const settingsBtn = document.querySelector('.settings-btn');
    const settingsWindow = document.querySelector('.settings-window');

    if (!settingsBtn || !settingsWindow) return;

    // Open settings
    settingsBtn.addEventListener('click', () => {
        openSettings();
    });

    // Close button
    const closeBtn = settingsWindow.querySelector('.window-control.close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeSettings();
        });
    }

    // Settings form submission
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveSettings();
        });
    }
}

/**
 * Open settings modal
 */
async function openSettings() {
    const settingsWindow = document.querySelector('.settings-window');
    if (!settingsWindow) return;

    try {
        window.authFunctions.showLoadingState('Loading settings...');

        // Fetch current configuration
        const config = await window.api.getUserConfig();

        // Populate form
        populateSettingsForm(config);

        // Show window
        settingsWindow.classList.remove('is-hidden');
        settingsWindow.setAttribute('aria-hidden', 'false');

        // Bring to front
        bringSettingsToFront();
    } catch (err) {
        console.error('Failed to load settings:', err);
        window.authFunctions.showErrorMessage('Failed to load settings.');
    } finally {
        window.authFunctions.hideLoadingState();
    }
}

/**
 * Close settings modal
 */
function closeSettings() {
    const settingsWindow = document.querySelector('.settings-window');
    if (!settingsWindow) return;

    settingsWindow.classList.add('is-hidden');
    settingsWindow.setAttribute('aria-hidden', 'true');
}

/**
 * Populate settings form with config data
 */
function populateSettingsForm(config) {
    // Locations (comma-separated)
    const locationsInput = document.getElementById('settings-locations');
    if (locationsInput && config.locations) {
        locationsInput.value = config.locations.join(', ');
    }

    // Minimum salary
    const minSalaryInput = document.getElementById('settings-min-salary');
    if (minSalaryInput && config.min_salary !== null && config.min_salary !== undefined) {
        minSalaryInput.value = config.min_salary;
    }

    // Include keywords (comma-separated)
    const includeKeywordsInput = document.getElementById('settings-include-keywords');
    if (includeKeywordsInput && config.include_keywords) {
        includeKeywordsInput.value = config.include_keywords.join(', ');
    }

    // Exclude keywords (comma-separated)
    const excludeKeywordsInput = document.getElementById('settings-exclude-keywords');
    if (excludeKeywordsInput && config.exclude_keywords) {
        excludeKeywordsInput.value = config.exclude_keywords.join(', ');
    }

    // Digest threshold
    const digestThresholdInput = document.getElementById('settings-digest-threshold');
    if (digestThresholdInput && config.digest_threshold !== null && config.digest_threshold !== undefined) {
        digestThresholdInput.value = config.digest_threshold;
    }

    // Digest enabled
    const digestEnabledInput = document.getElementById('settings-digest-enabled');
    if (digestEnabledInput && config.digest_enabled !== null && config.digest_enabled !== undefined) {
        digestEnabledInput.checked = config.digest_enabled;
    }
}

/**
 * Save settings
 */
async function saveSettings() {
    try {
        window.authFunctions.showLoadingState('Saving settings...');

        // Collect form data
        const config = {
            locations: parseCommaSeparatedList(document.getElementById('settings-locations')?.value),
            min_salary: parseInt(document.getElementById('settings-min-salary')?.value) || null,
            include_keywords: parseCommaSeparatedList(document.getElementById('settings-include-keywords')?.value),
            exclude_keywords: parseCommaSeparatedList(document.getElementById('settings-exclude-keywords')?.value),
            digest_threshold: parseInt(document.getElementById('settings-digest-threshold')?.value) || 80,
            digest_enabled: document.getElementById('settings-digest-enabled')?.checked ?? true,
        };

        // Save via API
        await window.api.updateUserConfig(config);

        window.authFunctions.showSuccessMessage('Settings saved successfully!');

        // Close settings
        closeSettings();

        // Reload opportunities with new config
        if (typeof window.loadOpportunities === 'function') {
            window.loadOpportunities();
        }
    } catch (err) {
        console.error('Failed to save settings:', err);
        window.authFunctions.showErrorMessage(err.message || 'Failed to save settings.');
    } finally {
        window.authFunctions.hideLoadingState();
    }
}

/**
 * Parse comma-separated list into array
 */
function parseCommaSeparatedList(value) {
    if (!value || typeof value !== 'string') return [];

    return value
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);
}

/**
 * Bring settings window to front
 */
function bringSettingsToFront() {
    const settingsWindow = document.querySelector('.settings-window');
    if (!settingsWindow) return;

    const tier = settingsWindow.getAttribute('data-window-tier') || 'functional';
    const windows = document.querySelectorAll('.desktop .window');
    let maxZ = tier === 'decorative' ? 1 : 100;
    const tierMax = tier === 'decorative' ? 99 : 999;

    windows.forEach((win) => {
        const winTier = win.getAttribute('data-window-tier') || 'decorative';
        if (winTier === tier) {
            const zIndex = parseInt(window.getComputedStyle(win).zIndex || '0', 10);
            if (!Number.isNaN(zIndex)) {
                maxZ = Math.max(maxZ, zIndex);
            }
        }
    });

    settingsWindow.style.zIndex = String(Math.min(maxZ + 1, tierMax));
}

/**
 * Initialize on page load
 */
document.addEventListener('DOMContentLoaded', () => {
    initSettingsModal();
});
