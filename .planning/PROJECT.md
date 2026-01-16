# Producer Producer Retro Desktop Landing Page

## What This Is

A single-page landing page for Producer Producer featuring a playful retro desktop collage aesthetic. The page mimics vintage operating system visuals with beige windows, folder icons, speech bubbles, and system dialogs—all surrounding a functional Buttondown email subscription form.

## Core Value

The subscription form must remain prominently accessible, high-contrast, and fully functional—everything else is visual enhancement that should not distract from the core conversion goal.

## Requirements

### Validated

- ✓ Email subscription via Buttondown embed — existing
- ✓ Client-side form validation (honeypot, timing, rate limiting) — existing
- ✓ Confetti animation on successful submission — existing
- ✓ Responsive layout (desktop and mobile) — existing
- ✓ GitHub Pages deployment — existing
- ✓ Retro desktop visual system (dark slate background, beige windows, 2px borders, drop shadows) — v1.0
- ✓ Reusable `.window` component with title bar, window controls, and body sections — v1.0
- ✓ Hero window containing title, description, and subscription form — v1.0
- ✓ Decorative supporting windows (search bar, system error dialog, lost message bubble) — v1.0
- ✓ Folder icons column mimicking file browser — v1.0
- ✓ Media player widget with playback controls aesthetic — v1.0
- ✓ Loading bar decorative element — v1.0
- ✓ CSS custom properties for consistent palette and sizing — v1.0
- ✓ Grid/flexbox layout for collage arrangement on desktop — v1.0
- ✓ Vertical stack layout for mobile (<768px) — v1.0
- ✓ Rotation modifiers for tilted window effect (`.tilt-left`, `.tilt-right`) — v1.0
- ✓ ARIA labels for dialog-like decorative elements — v1.0
- ✓ Preserve existing form accessibility and keyboard navigation — v1.0

### Active

(None — v1.0 complete)

### Out of Scope

- Interactive drag-and-drop windows — static layout only per PRD
- Backend/email functionality changes — existing Buttondown integration stays as-is
- Brand-new imagery or illustrations — using SVG/pseudo-element accents and placeholder content
- JavaScript-heavy interactions — hover/focus affordances only
- Build system or bundling — keeping static HTML/CSS/JS approach

## Context

**Shipped v1.0** with 646 lines HTML/CSS.

**Tech stack:** Static HTML/CSS/JS hosted on GitHub Pages. External dependencies: Buttondown API, canvas-confetti CDN, Google Fonts (Open Sans).

**What shipped:** Full retro desktop collage with hero window (subscription form), search window, error dialog, speech bubble, folder icons, media player, and loading bar. Responsive layout hides decorative elements on mobile (<768px) to focus on the form.

**Known issues:** None.

## Constraints

- **Tech stack**: Pure HTML/CSS/JS — no build tools, frameworks, or new dependencies
- **Platform**: Must work on GitHub Pages (static hosting)
- **Accessibility**: Form must remain keyboard-navigable, ARIA labels on decorative dialogs
- **Browser support**: Modern browsers (Chrome, Safari, Firefox, Edge)
- **Performance**: Keep page weight reasonable; avoid large images

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Static collage (no drag-drop) | Simplicity; PRD explicitly excludes interactive windows | ✓ Good |
| CSS Grid/Flexbox for layout | Modern, flexible layout without JS | ✓ Good |
| CSS custom properties for theming | Easy palette consistency, future theme changes | ✓ Good |
| Keep existing form JS | Working spam protection; no need to rewrite | ✓ Good |
| Controls positioned left (macOS-style) | Matches reference image aesthetic | ✓ Good |
| Hide decorative elements on mobile | Focus on form conversion, simpler than repositioning | ✓ Good |
| 768px mobile breakpoint | Standard tablet/phone threshold | ✓ Good |
| Pure CSS folder/waveform shapes | No images needed, smaller page weight | ✓ Good |

---
*Last updated: 2026-01-16 after v1.0 milestone*
