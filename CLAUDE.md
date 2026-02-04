# Producer Producer

A public-facing website for video producers to find industry-relevant job listings.

## Project Overview

**Domain:** producer-producer.com

This site provides curated job listings specifically for video producers, filtering out unrelated "producer" roles (music producers, manufacturing producers, etc.) using AI and automation.

**Design Philosophy:** 
V1 - Retro faux desktop aesthetic with interactive macOS-inspired window behaviors.
v2 - TBD

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
│   ├── api.js             # API client (auth, opportunities, user config)
│   ├── auth.js            # Authentication UI (login/logout)
│   ├── opportunities.js   # Job listings display and actions
│   ├── settings.js        # User settings modal
│   ├── subscribe-form.js  # Form handling + window interactions
│   └── space-invader.js   # Decorative animation
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

## API Integration (Phase 4 - IMPLEMENTED)

The frontend now connects to the producer-producer-api backend at `api.producer-producer.com`.

### Authentication
- **Magic link login** - Passwordless authentication via email
- **JWT tokens** - Stored in localStorage, auto-attached to API requests
- **Session management** - Auto-logout on 401 responses

### Key Endpoints Used

**Auth:**
- `POST /auth/magic-link` - Request login email
- `GET /auth/verify?token=xxx` - Verify magic link token
- `GET /auth/me` - Get current user info

**User Configuration:**
- `GET /users/me/config` - Get user filter preferences
- `PUT /users/me/config` - Update preferences

**Opportunities:**
- `GET /opportunities/for-me` - Get personalized opportunities
- `PUT /users/me/opportunities/{id}` - Update opportunity status (todo/ignored/applied)

### Features Implemented

1. **Login Window** - Magic link authentication with email input
2. **Settings Modal** - Configure locations, salary, keywords, email digest
3. **Dynamic Job Listings** - Personalized opportunities loaded from API
4. **Job Actions** - Save, ignore, or mark as applied
5. **Auth State Management** - Show/hide UI elements based on login status

### JavaScript Modules

- **api.js** - Singleton API client with request handling, token management
- **auth.js** - Login/logout UI, magic link verification, auth state updates
- **opportunities.js** - Fetch and render job listings, handle job actions
- **settings.js** - Settings modal with form population and saving

### Local Development

The API client automatically detects localhost and uses `http://localhost:8000` for local development. For production, it uses `https://api.producer-producer.com`.

```bash
# Run API locally (in producer-producer-api repo)
docker compose up -d

# Or run directly
uvicorn fly_app.main:app --reload

# Serve frontend (in producer-producer repo)
python3 -m http.server 8080
```

Open `http://localhost:8080` and the frontend will connect to the local API.

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
3. Current version: `20260117` (Phase 4 implementation)

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
- Login window (authentication)
- Settings window (user configuration)
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
