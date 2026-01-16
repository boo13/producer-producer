# Producer Producer Retro Desktop Landing Page

## What This Is

A redesigned single-page landing page for Producer Producer that transforms the current minimalist subscription form into a playful retro desktop collage. The page mimics vintage operating system aesthetics with beige windows, folder icons, speech bubbles, and system dialogs—all while preserving the functional Buttondown email subscription form at its center.

## Core Value

The subscription form must remain prominently accessible, high-contrast, and fully functional—everything else is visual enhancement that should not distract from the core conversion goal.

## Requirements

### Validated

- ✓ Email subscription via Buttondown embed — existing
- ✓ Client-side form validation (honeypot, timing, rate limiting) — existing
- ✓ Confetti animation on successful submission — existing
- ✓ Responsive layout (desktop and mobile) — existing
- ✓ GitHub Pages deployment — existing

### Active

- [ ] Retro desktop visual system (dark slate background, beige windows, 2px borders, drop shadows)
- [ ] Reusable `.window` component with title bar, window controls, and body sections
- [ ] Hero window containing title, description, and subscription form
- [ ] Decorative supporting windows (search bar, system error dialog, lost message bubble)
- [ ] Folder icons column mimicking file browser
- [ ] Media player widget with playback controls aesthetic
- [ ] Loading bar decorative element
- [ ] CSS custom properties for consistent palette and sizing
- [ ] Grid/flexbox layout for collage arrangement on desktop
- [ ] Vertical stack layout for mobile (<768px)
- [ ] Rotation modifiers for tilted window effect (`.tilt-left`, `.tilt-right`)
- [ ] ARIA labels for dialog-like decorative elements
- [ ] Preserve existing form accessibility and keyboard navigation

### Out of Scope

- Interactive drag-and-drop windows — static layout only per PRD
- Backend/email functionality changes — existing Buttondown integration stays as-is
- Brand-new imagery or illustrations — using SVG/pseudo-element accents and placeholder content
- JavaScript-heavy interactions — hover/focus affordances only
- Build system or bundling — keeping static HTML/CSS/JS approach

## Context

**Existing site:** Simple landing page with gradient background, centered white card, header image, and subscription form. Works well functionally but lacks personality.

**Design reference:** Retro desktop collage (see `Ref/Ref1.jpg`) with stacked windows, folders, system dialogs, and vintage OS aesthetic. Dark gray desktop background with cream/beige UI elements.

**Technical environment:** Static HTML/CSS/JS hosted on GitHub Pages. No build step. External dependencies: Buttondown API, canvas-confetti CDN, Google Fonts (Open Sans).

**User feedback themes:** Site needs more visual identity and personality to stand out; current design is generic.

## Constraints

- **Tech stack**: Pure HTML/CSS/JS — no build tools, frameworks, or new dependencies
- **Platform**: Must work on GitHub Pages (static hosting)
- **Accessibility**: Form must remain keyboard-navigable, ARIA labels on decorative dialogs
- **Browser support**: Modern browsers (Chrome, Safari, Firefox, Edge)
- **Performance**: Keep page weight reasonable; avoid large images

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Static collage (no drag-drop) | Simplicity; PRD explicitly excludes interactive windows | — Pending |
| CSS Grid for layout | Modern, flexible layout without JS | — Pending |
| CSS custom properties for theming | Easy palette consistency, future theme changes | — Pending |
| Keep existing form JS | Working spam protection; no need to rewrite | — Pending |

---
*Last updated: 2026-01-16 after initialization*
