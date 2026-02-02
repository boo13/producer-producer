/**
 * Authentication Module for Producer-Producer v2
 * Handles magic link authentication, token verification, and auth state.
 *
 * Decoupled from UI - dispatches 'pp:auth-changed' event for UI components to listen.
 */

// Check for magic link token in URL on page load
(function handleMagicLinkVerification() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token) {
        verifyMagicLink(token);
    }
})();

/**
 * Verify magic link token
 */
async function verifyMagicLink(token) {
    try {
        showLoadingState('Verifying login...');

        await window.api.verifyMagicLink(token);

        // Remove token from URL
        const url = new URL(window.location);
        url.searchParams.delete('token');
        window.history.replaceState({}, '', url);

        showSuccessMessage('Login successful!');

        // Update UI via event
        updateAuthUI();

        // Redirect to v2 home after successful login
        setTimeout(() => {
            window.location.href = '/v2/';
        }, 1500);
    } catch (err) {
        console.error('Magic link verification failed:', err);
        showErrorMessage(err.message || 'Login failed. Please try again.');
    } finally {
        hideLoadingState();
    }
}

/**
 * Request magic link via email
 */
async function requestMagicLink(email) {
    try {
        showLoadingState('Sending magic link...');

        await window.api.requestMagicLink(email);

        showSuccessMessage(`Magic link sent to ${email}! Check your inbox.`);

        return true;
    } catch (err) {
        console.error('Magic link request failed:', err);
        showErrorMessage(err.message || 'Failed to send magic link. Please try again.');
        return false;
    } finally {
        hideLoadingState();
    }
}

/**
 * Logout user
 */
function logout() {
    window.api.logout();
    updateAuthUI();

    // Reload page to clear any user-specific data
    window.location.reload();
}

/**
 * Update auth UI by dispatching event
 * UI components listen for 'pp:auth-changed' and update themselves
 */
function updateAuthUI() {
    const isAuthenticated = window.api.isAuthenticated();
    const user = window.api.getCurrentUser();

    document.dispatchEvent(new CustomEvent('pp:auth-changed', {
        detail: {
            isAuthenticated,
            user,
        },
    }));
}

/**
 * Show loading state (no-op for now, UI will implement)
 */
function showLoadingState(message = 'Loading...') {
    console.log('[Auth Loading]', message);
}

/**
 * Hide loading state (no-op for now, UI will implement)
 */
function hideLoadingState() {
    console.log('[Auth Loading] Complete');
}

/**
 * Show success message (console for now, UI will implement)
 */
function showSuccessMessage(message) {
    console.log('[Auth Success]', message);
}

/**
 * Show error message (console for now, UI will implement)
 */
function showErrorMessage(message) {
    console.error('[Auth Error]', message);
}

/**
 * Initialize auth on page load
 */
document.addEventListener('DOMContentLoaded', () => {
    // Dispatch initial auth state
    updateAuthUI();
});

// Export functions for global use
window.authFunctions = {
    updateAuthUI,
    logout,
    requestMagicLink,
    verifyMagicLink,
    showLoadingState,
    hideLoadingState,
    showSuccessMessage,
    showErrorMessage,
};
