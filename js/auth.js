/**
 * Authentication UI - Login/Logout functionality
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

        // Update UI
        updateAuthUI();

        // Redirect to home page after successful login
        setTimeout(() => {
            window.location.href = '/';
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
 * Update auth UI based on login state
 */
function updateAuthUI() {
    const isAuthenticated = window.api.isAuthenticated();
    const user = window.api.getCurrentUser();

    // Update login window visibility
    const loginWindow = document.querySelector('.login-window');
    const newsletterWindow = document.querySelector('.hero-window');
    const logoutBtn = document.querySelector('.logout-btn');
    const userGreeting = document.querySelector('.user-greeting');

    if (loginWindow) {
        if (isAuthenticated) {
            loginWindow.classList.add('is-hidden');
            loginWindow.setAttribute('aria-hidden', 'true');
        } else {
            loginWindow.classList.remove('is-hidden');
            loginWindow.setAttribute('aria-hidden', 'false');
        }
    }

    if (newsletterWindow) {
        if (isAuthenticated) {
            newsletterWindow.classList.add('is-hidden');
            newsletterWindow.setAttribute('aria-hidden', 'true');
        } else {
            newsletterWindow.classList.remove('is-hidden');
            newsletterWindow.setAttribute('aria-hidden', 'false');
        }
    }

    // Update user greeting
    if (userGreeting && user) {
        const name = user.name || user.email.split('@')[0];
        userGreeting.textContent = `Hello, ${name}`;
        userGreeting.classList.remove('is-hidden');
    } else if (userGreeting) {
        userGreeting.classList.add('is-hidden');
    }

    // Show/hide logout button
    if (logoutBtn) {
        if (isAuthenticated) {
            logoutBtn.classList.remove('is-hidden');
        } else {
            logoutBtn.classList.add('is-hidden');
        }
    }

    // Show/hide settings buttons (desktop + mobile shortcut)
    const settingsBtns = document.querySelectorAll('.settings-btn, .mobile-settings-btn');
    settingsBtns.forEach((settingsBtn) => {
        if (isAuthenticated) {
            settingsBtn.classList.remove('is-hidden');
        } else {
            settingsBtn.classList.add('is-hidden');
        }
    });

    document.dispatchEvent(new CustomEvent('pp:auth-changed', {
        detail: {
            isAuthenticated,
            user,
        },
    }));
}

/**
 * Initialize login form
 */
function initLoginForm() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const emailInput = loginForm.querySelector('#login-email');
        const email = emailInput?.value?.trim();

        if (!email) {
            showErrorMessage('Please enter your email address.');
            return;
        }

        const success = await requestMagicLink(email);

        if (success) {
            // Clear input
            emailInput.value = '';
        }
    });
}

/**
 * Show loading state
 */
function showLoadingState(message = 'Loading...') {
    const loadingBar = document.querySelector('.loading-bar');
    const loadingLabel = loadingBar?.querySelector('.loading-label');

    if (loadingBar) {
        loadingBar.classList.add('is-visible');
        if (loadingLabel) {
            loadingLabel.textContent = message;
        }
    }
}

/**
 * Hide loading state
 */
function hideLoadingState() {
    const loadingBar = document.querySelector('.loading-bar');
    if (loadingBar) {
        loadingBar.classList.remove('is-visible');
    }
}

/**
 * Show success message
 */
function showSuccessMessage(message) {
    const speechBubble = document.querySelector('.speech-bubble-text');
    if (speechBubble) {
        speechBubble.textContent = message;
        speechBubble.parentElement.classList.add('is-visible', 'is-success');

        setTimeout(() => {
            speechBubble.parentElement.classList.remove('is-visible', 'is-success');
        }, 5000);
    } else {
        alert(message);
    }
}

/**
 * Show error message
 */
function showErrorMessage(message) {
    const speechBubble = document.querySelector('.speech-bubble-text');
    if (speechBubble) {
        speechBubble.textContent = message;
        speechBubble.parentElement.classList.add('is-visible', 'is-error');

        setTimeout(() => {
            speechBubble.parentElement.classList.remove('is-visible', 'is-error');
        }, 5000);
    } else {
        alert(message);
    }
}

/**
 * Initialize auth on page load
 */
document.addEventListener('DOMContentLoaded', () => {
    initLoginForm();
    updateAuthUI();

    // Add logout button handler
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
});

// Export functions for global use
window.authFunctions = {
    updateAuthUI,
    logout,
    showLoadingState,
    hideLoadingState,
    showSuccessMessage,
    showErrorMessage,
};
