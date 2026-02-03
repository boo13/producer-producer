/**
 * Login Module for Producer-Producer v2
 * Handles login modal, magic link requests, and auth button visibility.
 */

(function() {
    'use strict';

    // DOM elements
    let loginModal;
    let loginForm;
    let loginEmailInput;
    let loginNewsletterCheckbox;
    let loginError;
    let loginBtn;
    let loginCloseBtn;

    /**
     * Initialize login modal
     */
    function initLoginModal() {
        loginModal = document.getElementById('login-modal');
        loginForm = document.getElementById('login-form');
        loginEmailInput = document.getElementById('login-email');
        loginNewsletterCheckbox = document.getElementById('login-newsletter');
        loginError = document.getElementById('login-error');
        loginBtn = document.getElementById('login-btn');
        loginCloseBtn = document.getElementById('login-close');

        if (!loginModal || !loginForm) {
            console.warn('[Login] Modal elements not found');
            return;
        }

        // Login button click -> open modal
        if (loginBtn) {
            loginBtn.addEventListener('click', openLogin);
        }

        // Close button click -> close modal
        if (loginCloseBtn) {
            loginCloseBtn.addEventListener('click', closeLogin);
        }

        // Backdrop click -> close modal
        loginModal.addEventListener('click', (e) => {
            if (e.target === loginModal) {
                closeLogin();
            }
        });

        // Form submit -> handle login
        loginForm.addEventListener('submit', handleLoginSubmit);

        // Listen for auth changes -> update button visibility
        document.addEventListener('pp:auth-changed', updateLoginButtonVisibility);

        // Initial button visibility check
        updateLoginButtonVisibility();
    }

    /**
     * Open login modal
     */
    function openLogin() {
        if (!loginModal) return;

        // Clear previous state
        if (loginForm) loginForm.reset();
        hideError();

        // Re-check the newsletter checkbox by default
        if (loginNewsletterCheckbox) {
            loginNewsletterCheckbox.checked = true;
        }

        // Show modal
        loginModal.hidden = false;

        // Focus email input
        if (loginEmailInput) {
            setTimeout(() => loginEmailInput.focus(), 100);
        }
    }

    /**
     * Close login modal
     */
    function closeLogin() {
        if (!loginModal) return;
        loginModal.hidden = true;
    }

    /**
     * Handle login form submission
     */
    async function handleLoginSubmit(e) {
        e.preventDefault();

        const email = loginEmailInput?.value?.trim();
        if (!email) {
            showError('Please enter your email address');
            return;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showError('Please enter a valid email address');
            return;
        }

        hideError();

        // Disable submit button
        const submitBtn = loginForm.querySelector('.login__submit');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
        }

        try {
            // Request magic link
            await window.api.requestMagicLink(email);

            // Show success toast
            showToast('Magic link sent! Check your email.');

            // Close modal after delay
            setTimeout(() => {
                closeLogin();
            }, 2000);

        } catch (err) {
            console.error('[Login] Magic link request failed:', err);
            showError(err.message || 'Failed to send magic link. Please try again.');
        } finally {
            // Re-enable submit button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Magic Link';
            }
        }
    }

    /**
     * Update login button visibility based on auth state
     */
    function updateLoginButtonVisibility() {
        const isAuthenticated = window.api?.isAuthenticated();

        // Login button: show when NOT authenticated
        if (loginBtn) {
            loginBtn.hidden = isAuthenticated;
        }
    }

    /**
     * Show error message in modal
     */
    function showError(message) {
        if (!loginError) return;
        loginError.textContent = message;
        loginError.classList.add('login__error--visible');
    }

    /**
     * Hide error message
     */
    function hideError() {
        if (!loginError) return;
        loginError.textContent = '';
        loginError.classList.remove('login__error--visible');
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
    document.addEventListener('DOMContentLoaded', initLoginModal);

    // Export for external use
    window.loginFunctions = {
        openLogin,
        closeLogin,
        updateLoginButtonVisibility,
    };
})();
