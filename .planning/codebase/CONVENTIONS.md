# Coding Conventions

**Analysis Date:** 2026-01-16

## Naming Patterns

**Files:**
- kebab-case for multi-word files (`subscribe-form.js`)
- lowercase for single-word files (`styles.css`)

**Functions:**
- Not applicable (minimal JS with no named functions)
- Event listener uses anonymous function

**Variables:**
- camelCase for variables (`formLoadTime`, `emailInput`)
- UPPER_SNAKE_CASE for constants (`RATE_LIMIT_SECONDS`, `RATE_LIMIT_KEY`, `EMAIL_REGEX`)

**CSS Classes:**
- kebab-case for classes (`form-box`, `input-main`, `phone-field`)
- Single-word classes common (`container`, `title`, `description`, `submit`)

## Code Style

**Formatting:**
- No formatter configured
- 4-space indentation in HTML and CSS
- 4-space indentation in JS

**JavaScript:**
- `const` for all variable declarations
- Semicolons required
- Single quotes not consistently used (double quotes in some strings)
- Anonymous functions preferred over arrow functions in event listeners

**CSS:**
- One property per line
- Properties grouped logically (layout, then appearance)
- Media queries at end of file
- Vendor prefixes for older browser support (`-webkit-`, `-moz-`, `-o-`)

**HTML:**
- 4-space indentation
- Attributes on same line as tag
- Self-closing tags not used (HTML5 style)

## Import Organization

**HTML:**
- External CSS linked in `<head>`
- External JS (confetti) loaded via CDN in `<head>`
- Local JS loaded at end of `<body>`

**CSS:**
- External font import at top (`@import url()`)
- Reset styles first (`*` selector)
- General styles before component styles
- Media queries last

## Error Handling

**Patterns:**
- Silent return for bot detection (no user feedback)
- `alert()` for user-facing validation errors
- No try/catch (simple synchronous code)

**Error Types:**
- Validation errors shown via alert()
- Rate limiting shown via alert with countdown

## Logging

**Framework:**
- None (browser console only)
- No explicit console.log statements in code

## Comments

**When to Comment:**
- Header comments for code sections (e.g., "// Track form load time for bot detection")
- Inline comments for constants (e.g., "// Rate limiting configuration (20 seconds)")

**Style:**
- Single-line `//` comments
- Comment explains purpose, not mechanics

## Function Design

**Size:**
- Single event listener function handles all form logic (~55 lines)
- Linear flow with early returns

**Parameters:**
- Event object `e` for form submission handler

**Return Values:**
- `return false` for validation failures
- Implicit return (form submission continues)

## Module Design

**Exports:**
- Not applicable (no module system)
- Global scope for constants
- Single IIFE-like structure via event listener

---

*Convention analysis: 2026-01-16*
*Update when patterns change*
