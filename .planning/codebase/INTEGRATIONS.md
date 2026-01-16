# External Integrations

**Analysis Date:** 2026-01-16

## APIs & External Services

**Email Subscription:**
- Buttondown - Newsletter subscription management
  - Integration method: HTML form POST to `https://buttondown.com/api/emails/embed-subscribe/Producer-Producer`
  - Auth: None required (public embed endpoint)
  - List: Producer-Producer newsletter

**CDN Dependencies:**
- canvas-confetti 1.9.2 - Visual celebration effect
  - Source: `https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js`
  - Usage: Called on successful form validation

- Google Fonts - Typography
  - Source: `https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700;800&display=swap`
  - Font: Open Sans (multiple weights)

## Data Storage

**Databases:**
- None (static site)

**File Storage:**
- None (images served statically)

**Caching:**
- Browser localStorage used for rate limiting only
  - Key: `pp_last_submit`
  - Value: Timestamp of last form submission
  - Purpose: Client-side rate limiting (20 second cooldown)

## Authentication & Identity

**Auth Provider:**
- None (public anonymous form)

**OAuth Integrations:**
- None

## Monitoring & Observability

**Error Tracking:**
- None

**Analytics:**
- None configured

**Logs:**
- None (browser console only)

## CI/CD & Deployment

**Hosting:**
- GitHub Pages
  - Domain: producer-producer.com (configured via CNAME file)
  - Deployment: Automatic on push to main branch
  - SSL: Provided by GitHub Pages

**CI Pipeline:**
- None configured

## Environment Configuration

**Development:**
- Required env vars: None
- Secrets location: None
- Mock/stub services: Open `index.html` directly in browser

**Staging:**
- Not applicable (no staging environment)

**Production:**
- Secrets management: None (no secrets)
- All configuration inline in code

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None (form submission handled by Buttondown)

---

*Integration audit: 2026-01-16*
*Update when adding/removing external services*
