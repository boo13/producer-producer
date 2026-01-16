// Track form load time for bot detection
const formLoadTime = Date.now();

// Rate limiting configuration (20 seconds)
const RATE_LIMIT_SECONDS = 20;
const RATE_LIMIT_KEY = 'pp_last_submit';

// Email validation regex (more strict than HTML5)
const EMAIL_REGEX = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

document.getElementById('subscribe-form').addEventListener('submit', function(e) {
    e.preventDefault();

    const form = this;
    const submitBtn = form.querySelector('.submit');
    const emailInput = document.getElementById('bd-email');
    const phoneField = document.getElementById('phone');

    // 1. Honeypot check
    if (phoneField.value !== '') {
        return false;
    }

    // 2. Timing-based bot detection (reject if submitted in < 2 seconds)
    const timeOnPage = (Date.now() - formLoadTime) / 1000;
    if (timeOnPage < 2) {
        return false;
    }

    // 3. Rate limiting check
    const lastSubmit = localStorage.getItem(RATE_LIMIT_KEY);
    if (lastSubmit) {
        const timeSinceLastSubmit = (Date.now() - parseInt(lastSubmit)) / 1000;
        if (timeSinceLastSubmit < RATE_LIMIT_SECONDS) {
            const remainingSeconds = Math.ceil(RATE_LIMIT_SECONDS - timeSinceLastSubmit);
            alert(`Please wait ${remainingSeconds} seconds before trying again.`);
            return false;
        }
    }

    // 4. Stronger email validation
    const email = emailInput.value.trim();
    if (!EMAIL_REGEX.test(email)) {
        alert('Please enter a valid email address.');
        emailInput.focus();
        return false;
    }

    // 5. Double-click protection
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    // Store submission timestamp
    localStorage.setItem(RATE_LIMIT_KEY, Date.now().toString());

    // Trigger confetti animation
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
    });

    // Submit the form after a brief delay to show confetti
    setTimeout(function() {
        form.submit();
    }, 300);
});
