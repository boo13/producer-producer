---
title: Two-Step OTP Login Modal - XSS, State Leaks, and Accessibility Issues Fixed
date: 2026-02-16
category: logic-errors
severity: high
component: v2/js/login.js
tags:
  - XSS vulnerability
  - timer leak
  - state management
  - accessibility
  - error handling
  - vanilla-js
  - modal
  - OTP
symptoms:
  - XSS vulnerability in toast notifications via innerHTML interpolation
  - Verify button remains disabled after successful authentication when modal reopened
  - Stale setTimeout timer fires after modal closed during resend cooldown
  - Inconsistent error handling patterns between login and OTP submit handlers
  - Modal title inaccessible to screen readers when switching to OTP step
root_cause: Initial implementation of two-step OTP flow did not properly manage component state lifecycle, timer cleanup, XSS prevention, and accessibility requirements in vanilla JS
resolution: Replaced innerHTML with textContent, centralized button reset in showOtpStep(), tracked resend feedback timer, standardized try/catch/finally, removed redundant call, added dynamic modal title updates
pr: https://github.com/boo13/producer-producer/pull/1
commit: 4da1444
---

# Two-Step OTP Login Modal: 6 Issues Fixed

## Overview

A comprehensive security and UX audit of the OTP login modal (`v2/js/login.js`) identified six interconnected issues spanning XSS vulnerability, state management leaks, timer cleanup problems, inconsistent error handling, redundant logic, and accessibility gaps. All were resolved in a single commit on PR #1.

---

## Issue 1: XSS Vulnerability in showToast

**Problem:** The `showToast()` function used `innerHTML` with string interpolation to insert user-facing messages.

**Root Cause:** `innerHTML` with interpolated variables is a known XSS vector. If `message` ever originates from server responses or user input, malicious scripts could execute.

**Fix:** Replaced `innerHTML` with safe DOM APIs:
```js
// Before (unsafe)
toast.innerHTML = `<span class="undo-toast__text">${message}</span>`;

// After (safe)
const span = document.createElement('span');
span.className = 'undo-toast__text';
span.textContent = message;
toast.appendChild(span);
```

**Why:** `textContent` treats all content as plain text, never parsing HTML or executing scripts.

---

## Issue 2: Verify Button State Leak Across Modal Opens

**Problem:** After successful OTP verification, the submit button remained disabled with "Verifying..." text. Reopening the modal and reaching the OTP step again left the button stuck.

**Root Cause:** `showOtpStep()` did not reset button state. It was only updated during form submission, not during view initialization.

**Fix:** Added explicit button reset in `showOtpStep()`:
```js
const verifyBtn = otpForm?.querySelector('.login__submit');
if (verifyBtn) {
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Verify';
}
```

---

## Issue 3: setTimeout Timer Leak in Resend Handler

**Problem:** After a successful resend, `setTimeout(() => startResendCooldown(), 1500)` was never stored. Closing the modal during that 1.5s window meant `clearCooldownTimer()` couldn't cancel it, causing a stale timer to fire on reset state.

**Root Cause:** Missing timer ID tracking. Untracked timeouts persist in the event loop.

**Fix:** Added `resendFeedbackTimer` module state:
```js
let resendFeedbackTimer = null;

// In handleResend:
resendFeedbackTimer = setTimeout(() => startResendCooldown(), 1500);

// In clearCooldownTimer:
if (resendFeedbackTimer) {
    clearTimeout(resendFeedbackTimer);
    resendFeedbackTimer = null;
}
```

---

## Issue 4: Inconsistent Error Handling Pattern

**Problem:** `handleOtpSubmit()` manually re-enabled the button in the `catch` block and again after try/catch. `handleLoginSubmit()` correctly used `finally`. Inconsistent patterns are harder to maintain.

**Fix:** Refactored to `try/catch/finally`:
```js
} catch (err) {
    showOtpError(err.message || 'Verification failed.');
} finally {
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Verify';
    }
}
```

---

## Issue 5: Redundant Error Clearing Logic

**Problem:** `showOtpError('')` called immediately before `hideOtpError()`. The first sets text to `''` but adds the visible class; the second removes it. Net effect identical to just calling `hideOtpError()`.

**Fix:** Removed redundant `showOtpError('')`, kept only `hideOtpError()`.

---

## Issue 6: Missing Accessibility - Modal Title Not Updating

**Problem:** The modal `<h2>` stayed "Login" when transitioning to the OTP step. Screen readers had no way to announce the context change.

**Fix:** Dynamic title updates on step transitions:
```js
// In showEmailStep:
if (loginTitle) loginTitle.textContent = 'Login';

// In showOtpStep:
if (loginTitle) loginTitle.textContent = 'Enter Code';
```

---

## Prevention Checklist

When reviewing vanilla JS modals or multi-step UI:

### Security
- [ ] Search diff for `innerHTML =`. Every instance must use only static content, or switch to `textContent`/`createElement`
- [ ] API responses and user inputs must go through `.textContent`, never `.innerHTML`

### Timer & Resource Cleanup
- [ ] Every `setTimeout()`/`setInterval()` must be assigned to a tracked variable
- [ ] All tracked timers must be cleared in the modal close/reset handler
- [ ] Check for timeout stacking on rapid clicks -- `clearTimeout()` before setting a new one

### Button & UI State
- [ ] Every button that can be disabled must have an explicit reset in modal-close or step-transition
- [ ] Use `finally` blocks for guaranteed cleanup, not scattered re-enables in catch branches
- [ ] Test the full cycle: Open -> Use -> Close -> Reopen. Verify nothing persists

### Accessibility
- [ ] Modal title or heading updates announced on step transitions
- [ ] Error regions use `role="alert"` for screen reader announcements
- [ ] Focus moves to relevant input on step transition

---

## Best Practices for Vanilla JS Modals

### Timer Management
Every timer gets a module-scoped variable. Clear before setting. Clear on every exit path.

### DOM Manipulation Safety
Use `.textContent` for any data that could originate from users or APIs. Reserve `innerHTML` for static templates only.

### Button State
Create a single reset point per button. Call it from `finally` blocks and from step-transition/modal-close functions.

### Error Handling Consistency
Use `try/catch/finally` uniformly. Consolidate error messages. Don't scatter cleanup across multiple code paths.

### Multi-Step Transitions
Each transition explicitly resets the previous step, then initializes the next. A single cleanup function handles all state for a given step.

---

## Related Files

- `v2/js/login.js` -- the fixed file (modal state machine)
- `v2/js/auth.js` -- auth state management, `pp:auth-changed` event dispatch
- `v2/js/api.js` -- `requestMagicLink()`, `verifyOtpCode()` API methods
- `v2/index.html` -- OTP step markup with `inputmode="numeric"`, `autocomplete="one-time-code"`
- `.planning/phases/05-settings-newsletter/05-01-PLAN.md` -- original login modal phase plan

## Review Heuristics

| Pattern in Diff | Risk | Action |
|-----------------|------|--------|
| `innerHTML = interpolated` | XSS | Switch to `.textContent` |
| `setTimeout(...)` without assignment | Timer leak | Store ID, clear on cleanup |
| `.disabled = false` in `catch` only | Inconsistent cleanup | Move to `finally` |
| `showError(''); hideError()` | Redundant | Consolidate to one call |
| No title/heading update on step change | Accessibility gap | Update `textContent` dynamically |
| No focus management on transition | Accessibility gap | Call `.focus()` on next input |
