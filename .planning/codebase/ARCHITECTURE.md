# Architecture

**Analysis Date:** 2026-01-16

## Pattern Overview

**Overall:** Static Single-Page Website

**Key Characteristics:**
- Single HTML page with embedded form
- Client-side JavaScript for form validation
- External API for email subscription (Buttondown)
- No server-side processing

## Layers

**Presentation Layer:**
- Purpose: Display subscription form UI
- Contains: HTML structure (`index.html`), CSS styling (`css/styles.css`)
- Depends on: Google Fonts CDN, local images
- Used by: End users via browser

**Behavior Layer:**
- Purpose: Form validation and submission handling
- Contains: JavaScript form handler (`js/subscribe-form.js`)
- Depends on: Buttondown API, canvas-confetti CDN
- Used by: Form submission events

## Data Flow

**Email Subscription Flow:**

1. User visits `index.html`
2. Form loads, JavaScript records page load time for bot detection
3. User enters email address
4. On submit, JavaScript validates:
   - Honeypot field is empty
   - Time on page > 2 seconds (bot detection)
   - Rate limit not exceeded (20s between submissions)
   - Email format is valid
5. If valid: trigger confetti animation, POST to Buttondown API
6. Buttondown handles email verification and list management

**State Management:**
- localStorage: Rate limiting timestamp (`pp_last_submit`)
- In-memory: Page load time for timing-based validation
- No persistent user state

## Key Abstractions

**Form Validation:**
- Purpose: Prevent spam and validate input
- Examples: Honeypot field, timing check, email regex, rate limiting
- Pattern: Event listener with guard clauses

**No other significant abstractions** - this is a minimal static site.

## Entry Points

**Browser Entry:**
- Location: `index.html`
- Triggers: User navigates to site
- Responsibilities: Render page, load CSS/JS assets

**JavaScript Entry:**
- Location: `js/subscribe-form.js`
- Triggers: Loaded after DOM ready
- Responsibilities: Attach form event listener, implement validation

## Error Handling

**Strategy:** Client-side alerts for validation errors

**Patterns:**
- Silent failure for bot detection (return false, no message)
- Alert() for rate limiting and email validation errors
- Form submission handled by Buttondown (external)

## Cross-Cutting Concerns

**Logging:**
- None (browser-only, no server logs)

**Validation:**
- Custom regex for email validation
- Honeypot field for bot detection
- Timing-based bot detection
- Client-side rate limiting via localStorage

**Authentication:**
- None (public subscription form)

---

*Architecture analysis: 2026-01-16*
*Update when major patterns change*
