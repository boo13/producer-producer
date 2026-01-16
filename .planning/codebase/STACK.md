# Technology Stack

**Analysis Date:** 2026-01-16

## Languages

**Primary:**
- HTML5 - Page structure (`index.html`)
- CSS3 - Styling (`css/styles.css`)
- JavaScript (ES6+) - Form handling (`js/subscribe-form.js`)

**Secondary:**
- None

## Runtime

**Environment:**
- Browser-only (static site)
- No server-side runtime

**Package Manager:**
- None (no package.json)
- External dependencies loaded via CDN

## Frameworks

**Core:**
- None (vanilla HTML/CSS/JS)

**Testing:**
- None configured

**Build/Dev:**
- None (no build step required)

## Key Dependencies

**Critical:**
- Buttondown API - Email subscription service (form posts to `buttondown.com/api/emails/embed-subscribe/Producer-Producer`)
- canvas-confetti 1.9.2 - Visual feedback on form submission (via CDN)
- Google Fonts (Open Sans) - Typography

**Infrastructure:**
- None (static files served directly)

## Configuration

**Environment:**
- No environment variables
- All configuration inline in code

**Build:**
- No build configuration

## Platform Requirements

**Development:**
- Any platform with a web browser
- No build tools required
- Simple file serving (or just open index.html)

**Production:**
- Static file hosting
- Currently served via GitHub Pages (CNAME: producer-producer.com)
- No server-side processing needed

---

*Stack analysis: 2026-01-16*
*Update after major dependency changes*
