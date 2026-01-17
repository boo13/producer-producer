# Technical Debt & Missing Features Plan
**Date:** 2026-01-16
**Context:** Retro desktop aesthetic is core brand identity (preserved). Focus on technical issues and missing backend integration.

---

## Issues to Address

### Critical
1. **No actual job data** - Notes window shows hardcoded fake listings instead of API data
2. **No backend integration** - CLAUDE.md mentions "public API" but it's not connected
3. **Manual cache busting** - `?v=20260116` will be forgotten and cause cache issues
4. **Planning files in git** - `.planning/` directory exposed publicly
5. **Client-side security theater** - Honeypot/timing checks are bypassable, create false confidence

### Medium Priority
6. **External CDN dependency** - Confetti.js blocks render, could be CSS animation
7. **Commented code left in** - Line 154 of index.html
8. **Mobile hides all decorative work** - 70% of CSS/HTML invisible on mobile (acceptable if intentional)
9. **Continuous animations** - Waveform bars run indefinitely, minor perf impact

### Low Priority
10. **Draggable windows** - 200+ lines of JS for decoration (keep if brand-aligned, consider removing if not)

---

## Plan: 3 Phases

---

## Phase 1: COMPLETE

---

## Phase 2: Connect Real Job Data

### 2.1 Define API contract
**Where is the backend?**
- If it exists: Document the endpoint (e.g., `GET /api/jobs?status=featured&limit=4`)
- If not built yet: Create mock endpoint structure

Expected response format:
```json
{
  "jobs": [
    {
      "id": "xyz",
      "title": "Supervising Producer, Politics Video Podcast",
      "company": "Vox Media",
      "location": "New York, NY",
      "salary_min": 120000,
      "salary_max": 140000,
      "posted_date": "2025-12-05",
      "score": 100.0
    }
  ]
}
```

### 2.2 Replace hardcoded notes window data
**File:** `index.html` (lines 168-196)

Replace static `<div class="note">` blocks with:
```html
<div class="window-body">
    <div id="job-listings-container">
        <p class="loading-text">Loading top listings...</p>
    </div>
</div>
```

### 2.3 Create `js/job-listings.js`
```javascript
(async function loadJobListings() {
    const container = document.getElementById('job-listings-container');
    if (!container) return;

    try {
        const response = await fetch('/api/jobs?status=featured&limit=4');
        if (!response.ok) throw new Error('Failed to load jobs');

        const data = await response.json();

        container.innerHTML = data.jobs.map((job, index) => `
            <div class="note">
                <p class="note-title ${index === 0 ? 'note-title--star' : ''}">
                    ${index === 0 ? '<img src="images/star-svgrepo-com.svg" alt="" class="note-star" aria-hidden="true">' : ''}
                    ${job.title}
                </p>
                <p class="note-company">${job.company}</p>
                <p class="note-details">${job.location} · $${job.salary_min.toLocaleString()} – $${job.salary_max.toLocaleString()} · ${new Date(job.posted_date).toLocaleDateString()}</p>
                <p class="note-score">Score: <span>${job.score.toFixed(2)}</span></p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Job listings error:', error);
        container.innerHTML = '<p class="error-text">Unable to load listings.</p>';
    }
})();
```

Add to `index.html` before `</body>`:
```html
<script src="js/job-listings.js"></script>
```

### 2.4 Add fallback for API failure
**File:** `css/styles.css`
Add:
```css
.loading-text, .error-text {
    font-size: 0.85rem;
    color: var(--ink-light);
    text-align: center;
    padding: var(--spacing-md);
}
```

---

## Phase 3: Performance & Polish

### 3.1 Replace confetti.js with CSS (optional)
If you want to remove the external dependency:

**Remove from `index.html`:**
```html
<script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js"></script>
```

**Replace in `js/subscribe-form.js` (line 57-61):**
```javascript
// Add success feedback class
submitBtn.classList.add('submit-success');
setTimeout(() => submitBtn.classList.remove('submit-success'), 800);
```

**Add to `css/styles.css`:**
```css
.submit-success {
    animation: successPulse 0.6s ease;
}

@keyframes successPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); background: #27ae60; }
}
```

### 3.2 Evaluate draggable windows necessity
**Question for product owner:**
- Does dragging windows serve a brand/UX purpose?
- Are users expected to interact by dragging?
- Or is it "cool but not essential"?

**If not essential:** Remove lines 69-274 from `js/subscribe-form.js` (saves ~6KB)

### 3.3 Lazy load robot SVG
**File:** `index.html:234`
Change to:
```html
<img src="images/robot-neutral-svgrepo-com.svg" alt="" loading="lazy" fetchpriority="low">
```

### 3.4 Add loading state for job listings
Ensure notes window shows loading indicator while fetching API data (covered in 2.3).

---

## Verification Steps

After completing all phases:

1. **Test cache busting:**
   - Deploy changes
   - Update CSS/JS
   - Verify browser receives new files without manual cache clear

2. **Test job listings:**
   - Mock API endpoint returns data → notes window populates
   - API fails → fallback message appears
   - API slow → loading message shows

3. **Test mobile:**
   - Confirm decorative elements hidden on <768px
   - Hero window and notes window remain functional

4. **Test form submission:**
   - Newsletter signup still works
   - Rate limiting still functions
   - No console errors about honeypot/timing

5. **Verify cleanup:**
   - `.planning/` not visible in git
   - No commented code in HTML
   - No external security false confidence

---

## Files to Modify

- `.gitignore` (new line)
- `_headers` or `.htaccess` (new file)
- `index.html` (3 sections: cache-busting removal, notes window replacement, script tag addition)
- `js/subscribe-form.js` (remove security theater, optionally remove confetti)
- `js/job-listings.js` (new file)
- `css/styles.css` (optional: success animation, loading states)

---

## Files to Remove (via git)

- `.planning/MILESTONES.md`
- `.planning/PROJECT.md`
- `.planning/agent-history.json`

---

## Decision Points

**Before starting Phase 2, answer:**
1. Where is the job listings API hosted?
2. What is the endpoint URL?
3. Is authentication required?
4. What's the expected response format?

**Before starting Phase 3.1:**
1. Keep or remove confetti.js?

**Before starting Phase 3.2:**
1. Keep or remove draggable windows?

---

## Success Criteria

- [ ] No `.planning/` files in git
- [ ] Cache busting is automatic (headers-based)
- [ ] Notes window shows real job data from API
- [ ] No client-side "security" checks creating false confidence
- [ ] Page load time < 2s on 3G
- [ ] No console errors on homepage
- [ ] Mobile experience functional (hero + notes visible)
