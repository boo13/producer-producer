# Roadmap: Producer Producer v2

## Overview

Transform the retro desktop job board into a mobile-first swipe interface. Start with foundation (copy/adapt v1 modules), build the core swipe loop, add job management features, then polish the visual design.

## Domain Expertise

None

## Phases

- [x] **Phase 1: Foundation** - v2 directory structure, adapt existing JS modules
- [x] **Phase 2: Swipe UI** - Mobile-first card interface with swipe gestures
- [x] **Phase 3: Applications Tracker** - View/manage saved jobs, mark as applied
- [x] **Phase 4: Add Job** - + button to add external job URLs
- [x] **Phase 5: Settings & Newsletter** - Newsletter toggle in signup flow and settings
- [ ] **Phase 6: Visual Polish** - Tinder-meets-terminal aesthetic

## Phase Details

### Phase 1: Foundation
**Goal**: Set up v2/ directory with adapted versions of api.js, auth.js, swipe.js and basic HTML shell
**Depends on**: Nothing (first phase)
**Research**: Unlikely (copying existing patterns)
**Plans**: TBD

### Phase 2: Swipe UI
**Goal**: Full-screen job cards with swipe left (ignore) and swipe right (save) functionality
**Depends on**: Phase 1
**Research**: Unlikely (existing swipe.js, internal UI work)
**Plans**: TBD

### Phase 3: Applications Tracker
**Goal**: View saved jobs, manage application status, mark as applied
**Depends on**: Phase 2
**Research**: Unlikely (existing API endpoints)
**Plans**: TBD

### Phase 4: Add Job
**Goal**: + button to manually add external job URLs (LinkedIn, company sites, etc.)
**Depends on**: Phase 3
**Research**: Likely (backend API coordination)
**Research topics**:
- Check if add-job endpoint exists in producer-producer-api
- Determine payload structure for external URLs
- Understand job validation/scraping flow (if any)
**Backend repo**: ../producer-producer-api
**Plans**: TBD

### Phase 5: Settings & Newsletter
**Goal**: Newsletter toggle in signup flow and settings modal
**Depends on**: Phase 1 (can run parallel to 2-4 if needed)
**Research**: Unlikely (existing patterns from v1)
**Plans**: TBD

### Phase 6: Visual Polish
**Goal**: Tinder-meets-terminal aesthetic with VT323 typography and pixel accents
**Depends on**: Phases 2-5 (polish after features built)
**Research**: Unlikely (CSS/styling work)
**Skill**: Use `frontend-design` skill for visual design work
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 1/1 | Complete | 2026-02-02 |
| 2. Swipe UI | 2/2 | Complete | 2026-02-02 |
| 3. Applications Tracker | 1/1 | Complete | 2026-02-02 |
| 4. Add Job | 1/1 | Complete | 2026-02-03 |
| 5. Settings & Newsletter | 1/1 | Complete | 2026-02-03 |
| 6. Visual Polish | 0/TBD | Not started | - |
