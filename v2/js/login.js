/**
 * Login Module for Producer-Producer v2
 * Handles login modal with email step and OTP code verification step.
 */

(function() {
    'use strict';

    // Module state
    let currentEmail = null;
    let resendCooldownTimer = null;

    // DOM elements (email step)
    let loginModal;
    let loginForm;
    let loginEmailInput;
    let loginNewsletterCheckbox;
    let loginError;
    let loginBtn;
    let loginCloseBtn;

    // DOM elements (OTP step)
    let otpStep;
    let otpForm;
    let otpInput;
    let otpEmailDisplay;
    let otpError;
    let resendBtn;
    let wrongEmailBtn;

    /**
     * Initialize login modal
     */
    function initLoginModal() {
        // Email step elements
        loginModal = document.getElementById('login-modal');
        loginForm = document.getElementById('login-form');
        loginEmailInput = document.getElementById('login-email');
        loginNewsletterCheckbox = document.getElementById('login-newsletter');
        loginError = document.getElementById('login-error');
        loginBtn = document.getElementById('login-btn');
        loginCloseBtn = document.getElementById('login-close');

        // OTP step elements
        otpStep = document.getElementById('login-otp-step');
        otpForm = document.getElementById('login-otp-form');
        otpInput = document.getElementById('login-otp-input');
        otpEmailDisplay = document.getElementById('login-otp-email');
        otpError = document.getElementById('login-otp-error');
        resendBtn = document.getElementById('login-resend');
        wrongEmailBtn = document.getElementById('login-wrong-email');

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

        // Email form submit
        loginForm.addEventListener('submit', handleLoginSubmit);

        // OTP form submit
        if (otpForm) {
            otpForm.addEventListener('submit', handleOtpSubmit);
        }

        // OTP input sanitization + clear error on typing
        if (otpInput) {
            otpInput.addEventListener('input', () => {
                otpInput.value = sanitizeOtpInput(otpInput.value);
                hideOtpError();
            });
        }

        // Resend code
        if (resendBtn) {
            resendBtn.addEventListener('click', handleResend);
        }

        // Wrong email -> back to email step
        if (wrongEmailBtn) {
            wrongEmailBtn.addEventListener('click', showEmailStep);
        }

        // Listen for auth changes -> update button visibility
        document.addEventListener('pp:auth-changed', updateLoginButtonVisibility);

        // Initial button visibility check
        updateLoginButtonVisibility();
    }

    /**
     * Open login modal (always resets to email step)
     */
    function openLogin() {
        if (!loginModal) return;

        showEmailStep();

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
        resetState();
    }

    /**
     * Reset module state
     */
    function resetState() {
        currentEmail = null;
        clearCooldownTimer();
    }

    /**
     * Show email step, hide OTP step
     */
    function showEmailStep() {
        // Reset email form
        if (loginForm) {
            loginForm.reset();
            loginForm.hidden = false;
        }
        hideError();

        // Re-check newsletter by default
        if (loginNewsletterCheckbox) {
            loginNewsletterCheckbox.checked = true;
        }

        // Hide OTP step
        if (otpStep) {
            otpStep.hidden = true;
        }

        // Reset OTP state
        if (otpInput) otpInput.value = '';
        hideOtpError();
        clearCooldownTimer();
        currentEmail = null;
    }

    /**
     * Show OTP step, hide email form
     */
    function showOtpStep(email) {
        currentEmail = email;

        // Hide email form
        if (loginForm) loginForm.hidden = true;

        // Show OTP step
        if (otpStep) otpStep.hidden = false;

        // Display email
        if (otpEmailDisplay) otpEmailDisplay.textContent = email;

        // Clear OTP input and errors
        if (otpInput) otpInput.value = '';
        hideOtpError();

        // Focus OTP input
        if (otpInput) {
            setTimeout(() => otpInput.focus(), 100);
        }
    }

    /**
     * Handle email form submission -- send code, transition to OTP step
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
            await window.api.requestMagicLink(email);

            // Transition to OTP step
            showOtpStep(email);
            startResendCooldown();

        } catch (err) {
            console.error('[Login] Code request failed:', err);
            showError(err.message || 'Failed to send code. Please try again.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Code';
            }
        }
    }

    /**
     * Handle OTP form submission -- verify code
     */
    async function handleOtpSubmit(e) {
        e.preventDefault();

        const code = otpInput?.value?.trim();
        if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
            showOtpError('Please enter a 6-digit code');
            return;
        }

        hideOtpError();

        // Disable verify button (double-submit prevention)
        const submitBtn = otpForm.querySelector('.login__submit');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Verifying...';
        }

        try {
            await window.api.verifyOtpCode(currentEmail, code);

            // Dispatch auth change event
            if (window.authFunctions?.updateAuthUI) {
                window.authFunctions.updateAuthUI();
            }

            // Show success toast
            showToast('Logged in!');

            // Close modal after brief delay
            setTimeout(() => {
                closeLogin();
            }, 1000);

        } catch (err) {
            console.error('[Login] OTP verification failed:', err);
            showOtpError(err.message || 'Verification failed. Please try again.');
            // Re-enable button on error (preserve entered code per spec)
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Verify';
            }
            return;
        }

        // Re-enable on success path too (for next modal open)
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Verify';
        }
    }

    /**
     * Handle resend code
     */
    async function handleResend() {
        if (!currentEmail) return;
        if (resendBtn?.classList.contains('login__link--disabled')) return;

        // Disable during request
        if (resendBtn) {
            resendBtn.classList.add('login__link--disabled');
            resendBtn.textContent = 'Sending...';
        }

        try {
            await window.api.requestMagicLink(currentEmail);
            showOtpError(''); // Clear any existing error
            hideOtpError();
            // Brief feedback
            if (resendBtn) resendBtn.textContent = 'New code sent';
            setTimeout(() => startResendCooldown(), 1500);
        } catch (err) {
            console.error('[Login] Resend failed:', err);
            showOtpError(err.message || 'Failed to resend code');
            // Re-enable resend on error
            if (resendBtn) {
                resendBtn.classList.remove('login__link--disabled');
                resendBtn.textContent = 'Resend code';
            }
        }
    }

    /**
     * Start 60-second resend cooldown
     */
    function startResendCooldown() {
        clearCooldownTimer();

        let secondsLeft = 60;
        if (resendBtn) {
            resendBtn.classList.add('login__link--disabled');
            resendBtn.textContent = `Resend code (${secondsLeft}s)`;
        }

        resendCooldownTimer = setInterval(() => {
            secondsLeft--;
            if (secondsLeft <= 0) {
                clearCooldownTimer();
                if (resendBtn) {
                    resendBtn.classList.remove('login__link--disabled');
                    resendBtn.textContent = 'Resend code';
                }
            } else if (resendBtn) {
                resendBtn.textContent = `Resend code (${secondsLeft}s)`;
            }
        }, 1000);
    }

    /**
     * Clear cooldown timer
     */
    function clearCooldownTimer() {
        if (resendCooldownTimer) {
            clearInterval(resendCooldownTimer);
            resendCooldownTimer = null;
        }
    }

    /**
     * Strip non-numeric characters from OTP input
     */
    function sanitizeOtpInput(value) {
        return value.replace(/\D/g, '');
    }

    /**
     * Update login button visibility based on auth state
     */
    function updateLoginButtonVisibility() {
        const isAuthenticated = window.api?.isAuthenticated();

        if (loginBtn) {
            loginBtn.hidden = isAuthenticated;
        }
    }

    /**
     * Show error message in email step
     */
    function showError(message) {
        if (!loginError) return;
        loginError.textContent = message;
        loginError.classList.add('login__error--visible');
    }

    /**
     * Hide error message in email step
     */
    function hideError() {
        if (!loginError) return;
        loginError.textContent = '';
        loginError.classList.remove('login__error--visible');
    }

    /**
     * Show error message in OTP step
     */
    function showOtpError(message) {
        if (!otpError) return;
        otpError.textContent = message;
        otpError.classList.add('login__error--visible');
    }

    /**
     * Hide error message in OTP step
     */
    function hideOtpError() {
        if (!otpError) return;
        otpError.textContent = '';
        otpError.classList.remove('login__error--visible');
    }

    /**
     * Show toast notification (reuses undo-toast pattern)
     */
    function showToast(message) {
        const existingToast = document.querySelector('.undo-toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'undo-toast';
        toast.innerHTML = `<span class="undo-toast__text">${message}</span>`;

        document.body.appendChild(toast);

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
