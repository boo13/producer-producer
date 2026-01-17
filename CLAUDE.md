# Producer Producer

A public-facing website for video producers to find industry-relevant job listings.

## Project Overview

**Domain:** producer-producer.com

This site provides curated job listings specifically for video producers, filtering out unrelated "producer" roles (music producers, manufacturing producers, etc.) using AI and automation.

**Design Philosophy:** Retro faux desktop aesthetic with interactive macOS-inspired window behaviors.

## Architecture

- **Frontend:** Public website with interactive retro desktop UI
- **Backend:** Public API (derived from existing private API server)
- **AI/Automation:** Filters and classifies jobs to identify video production roles

## Key Features

### Job Listings
- Curated job listings for video production industry
- AI-powered job classification to filter irrelevant postings
- Public API access to job data

### Interactive Desktop UI
- **Draggable windows** - Drag windows by title bar to reposition
- **Click to bring to front** - Click anywhere on window to bring it forward (respects decorative/functional tiers)
- **Minimize/restore** - Double-click title bar or click minimize button to collapse window
- **Genie animation** - Trash window appears with smooth zoom effect from trash icon
- **Newsletter signup** - Embedded Buttondown form with confetti success animation

## Development

### Getting Started

```bash
# Serve locally (any method works)
python3 -m http.server 8080

# Or use any static server
npx serve
```

Open `http://localhost:8080` in your browser.

### Project Structure

```
producer-producer/
├── index.html              # Main HTML (retro desktop UI)
├── css/
│   └── styles.css         # All styling and animations
├── js/
│   └── subscribe-form.js  # Form handling + window interactions
├── images/
│   ├── robot-neutral-svgrepo-com.svg
│   ├── star-svgrepo-com.svg
│   └── Globe_icon.svg.png
├── CLAUDE.md              # This file (project overview)
├── IMPLEMENTATION_01.16.md # Interactive features documentation
└── PLAN_01.16.md          # Technical debt roadmap
```

### Interactive Features Implementation

See `IMPLEMENTATION_01.16.md` for complete documentation of:
- Click window to bring to front
- Minimize/restore windows
- Genie appearance animation

**Key files:**
- `js/subscribe-form.js` - Lines 69-352 (draggable windows + interactions)
- `css/styles.css` - Lines 636-657 (minimize/restore transitions)

## API

The public API exposes job listing data. Documentation to be added as endpoints are defined.

**Expected endpoint:** `GET /api/jobs?status=featured&limit=4`

See `PLAN_01.16.md` Phase 2 for backend integration plan.

## Deployment

**Target:** producer-producer.com (GitHub Pages)

### Cache Busting

**Current (manual):**
```html
<link rel="stylesheet" href="css/styles.css?v=20260116b">
<script src="js/subscribe-form.js?v=20260116b">
```

**When shipping CSS or JS updates:**
1. Bump the `?v=YYYYMMDD` string in `index.html`
2. Use format: `YYYYMMDD` for dates, append letter for same-day iterations (`a`, `b`, etc.)

**TODO:** Replace with header-based cache control (see `PLAN_01.16.md` Phase 1.4)

## Window Tier System

Windows use a two-tier z-index system to maintain visual hierarchy:

**Decorative tier (1-99):**
- Media player
- Search window
- Error dialog
- Recently deleted window

**Functional tier (100-999):**
- Hero window (newsletter signup)
- Notes window (job listings)

Clicking a window brings it to the front within its tier. Functional windows always appear above decorative windows.

## Browser Support

- Chrome/Edge (primary target)
- Safari
- Firefox
- Mobile responsive (<768px hides decorative elements)

## Accessibility

- Keyboard navigation supported
- ARIA attributes for window states (`aria-expanded`, `aria-hidden`)
- Respects `prefers-reduced-motion`
- Screen reader friendly

## Notes

- This is the public version of an existing private API
- Focus on UX for video producers seeking work
- Job classification logic distinguishes video producers from other "producer" roles
- Retro desktop aesthetic is intentional and core to brand identity
- Interactive features enhance engagement without interfering with primary goal (newsletter signups)
