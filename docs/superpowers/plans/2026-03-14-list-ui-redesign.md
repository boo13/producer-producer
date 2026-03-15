# List UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign list.html into the primary Producer-Producer surface with inline job expansion, AI-powered sentence highlighting, and authenticated user actions (save/applied/ignore).

**Architecture:** Evolve the existing list.html, list.js, and list.css. Add auth integration using the existing `js/auth.js` and `js/api.js` modules. Render sentence classifications from the API response using CSS classes for the four visual tiers. Add header auth controls, action buttons, undo toast, and status filter toggle.

**Tech Stack:** Vanilla HTML/CSS/JS (no framework, no build step), Playwright for testing

**Repo:** `producer-producer`

**Depends on:** Plan 2 (AI Sentence Classification) — needs `sentence_classifications` in API response.

---

## Chunk 1: Header Auth & Signed-In State

### File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `list.html` | Add header-controls div, include auth.js script |
| Modify | `css/list.css` | Styles for header auth controls, signed-in state |
| Modify | `js/list.js` | Listen for `pp:auth-changed`, toggle UI state |

### Task 1: Add auth controls to header

**Files:**
- Modify: `list.html:34-38`
- Modify: `css/list.css`

- [ ] **Step 1: Add header-controls div to list.html**

In `list.html`, modify the header section (lines 34-38):

```html
<header class="header">
    <div class="header-inner">
        <a class="site-wordmark" href="/">Producer-Producer</a>
        <div class="header-controls">
            <span class="user-greeting is-hidden" id="user-greeting"></span>
            <button type="button" class="btn header-sign-out is-hidden" id="sign-out-btn">Sign out</button>
            <button type="button" class="btn header-sign-in" id="sign-in-btn">Sign in →</button>
        </div>
    </div>
</header>
```

- [ ] **Step 2: Add auth.js script to list.html**

Before the existing `js/api.js` script tag (line 131), add:

```html
<script src="js/auth.js?v=20260314"></script>
```

And update the existing script cache-bust versions:
```html
<script src="js/api.js?v=20260314"></script>
<script src="js/list.js?v=20260314"></script>
```

- [ ] **Step 3: Add header auth styles to list.css**

Add to `css/list.css` after the existing `.header-controls` block (or create it if it doesn't exist):

```css
.header-controls {
    grid-column: 7 / -1;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.75rem;
}

.user-greeting {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--ink-secondary);
}

.header-sign-in,
.header-sign-out {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.11em;
}
```

- [ ] **Step 4: Add auth state handling to list.js**

In `js/list.js`, add an event listener for `pp:auth-changed` to toggle the sign-in/sign-out controls:

```javascript
document.addEventListener('pp:auth-changed', function(e) {
    var detail = e.detail || {};
    var isAuth = detail.isAuthenticated;
    var user = detail.user;

    var greeting = document.getElementById('user-greeting');
    var signInBtn = document.getElementById('sign-in-btn');
    var signOutBtn = document.getElementById('sign-out-btn');

    if (isAuth && user) {
        greeting.textContent = user.email || '';
        greeting.classList.remove('is-hidden');
        signOutBtn.classList.remove('is-hidden');
        signInBtn.classList.add('is-hidden');
    } else {
        greeting.classList.add('is-hidden');
        signOutBtn.classList.add('is-hidden');
        signInBtn.classList.remove('is-hidden');
    }
});
```

Add click handler for sign-out:

```javascript
document.getElementById('sign-out-btn').addEventListener('click', function() {
    if (window.authFunctions) {
        window.authFunctions.logout();
    }
});
```

Add click handler for sign-in that scrolls to the newsletter/sign-in form:

```javascript
document.getElementById('sign-in-btn').addEventListener('click', function() {
    var form = document.getElementById('newsletter-form');
    if (form) {
        form.scrollIntoView({ behavior: 'smooth' });
        var emailInput = document.getElementById('newsletter-email');
        if (emailInput) emailInput.focus();
    }
});
```

Also update the `pp:auth-changed` handler above to toggle the intro section's newsletter form — when signed in, hide the form and show a "You're subscribed" confirmation; when signed out, restore it:

```javascript
// Inside the pp:auth-changed handler, after the header toggle:
var newsletterForm = document.getElementById('newsletter-form');
if (isAuth) {
    newsletterForm.classList.add('is-hidden');
} else {
    newsletterForm.classList.remove('is-hidden');
}
```

- [ ] **Step 5: Update newsletter form to trigger magic link auth**

In `js/list.js`, the existing newsletter form handler calls `window.api.requestMagicLink(email)`. This already sends the magic link. After the magic link is sent, show OTP input inline (matching v2 pattern). Read `v2/js/login.js` for the OTP flow pattern and adapt it.

Add an OTP input section to the newsletter form in `list.html`:

```html
<div class="otp-section is-hidden" id="otp-section">
    <p class="newsletter-label">Enter the 6-digit code from your email</p>
    <div class="newsletter-fields">
        <input type="text" class="newsletter-email" id="otp-input" placeholder="000000" maxlength="6" autocomplete="one-time-code" inputmode="numeric">
        <button type="button" class="newsletter-submit" id="otp-submit">Verify →</button>
    </div>
    <p class="newsletter-status is-hidden" id="otp-status"></p>
</div>
```

In `js/list.js`, handle OTP verification:

```javascript
document.getElementById('otp-submit').addEventListener('click', async function() {
    var code = document.getElementById('otp-input').value.trim();
    var email = state.pendingAuthEmail;
    if (!code || !email) return;

    try {
        var result = await window.api.verifyOtpCode(email, code);
        if (result && result.access_token) {
            localStorage.setItem('pp_auth_token', result.access_token);
            if (result.user) {
                localStorage.setItem('pp_user_data', JSON.stringify(result.user));
            }
            if (window.authFunctions) {
                window.authFunctions.updateAuthUI();
            }
            // Hide OTP section, show success
            document.getElementById('otp-section').classList.add('is-hidden');
            document.getElementById('newsletter-form').classList.add('is-hidden');
        }
    } catch (err) {
        var status = document.getElementById('otp-status');
        status.textContent = 'Invalid code. Try again.';
        status.classList.remove('is-hidden');
        status.classList.add('newsletter-status--error');
    }
});
```

`verifyOtpCode` does not exist on `js/api.js` — add it before the OTP handler above. In `js/api.js`, add the method to the `APIClient` class (after the existing `requestMagicLink` method):

```javascript
async verifyOtpCode(email, code) {
    const data = await this.request('/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
    });
    this.setToken(data.access_token);
    this.saveUser(data.user);
    return data;
}
```

Then update the file list for this task's commit to include `js/api.js`.

- [ ] **Step 6: Test manually**

Run: `cd /Users/randycounsman/Git/p-p/producer-producer && python3 -m http.server 8080`
Open: `http://localhost:8080/list.html`

Verify:
- "Sign in →" button visible in header when signed out
- Clicking "Sign in →" scrolls to newsletter form
- After auth, header shows email + "Sign out" button
- Signing out clears state and restores "Sign in →"

- [ ] **Step 7: Commit**

```bash
cd /Users/randycounsman/Git/p-p/producer-producer
git add list.html css/list.css js/list.js
git commit -m "feat: add auth controls to list.html header

Sign-in button scrolls to newsletter form, which now handles
magic link + OTP flow. Header shows user email when signed in."
```

---

## Chunk 2: Sentence Highlighting & Expanded Job Detail

### File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `css/list.css` | Add tier highlight/fade CSS classes |
| Modify | `js/list.js` | Render sentence classifications in expanded detail |

### Task 2: Add tier CSS classes

**Files:**
- Modify: `css/list.css`

- [ ] **Step 1: Add highlight/fade tier styles**

Add to `css/list.css` after the `.listing-description` block:

```css
/* ── Sentence Tier Highlighting ────────────────────────────────────────── */

.tier-highlight {
    background: #f5e6a3;
    border-bottom: 2px solid #e6d080;
    padding: 0.08rem 0.2rem;
    color: var(--ink-strong);
    font-weight: 600;
}

.tier-normal {
    color: var(--ink-body);
}

.tier-faded {
    color: var(--ink-muted);
}

.tier-very-faded {
    color: #c4b9a5;
    font-size: 0.78rem;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/randycounsman/Git/p-p/producer-producer
git add css/list.css
git commit -m "feat: add sentence tier CSS classes for highlight/fade treatment"
```

### Task 3: Render sentence classifications in expanded detail

**Files:**
- Modify: `js/list.js`

- [ ] **Step 1: Modify `createListingElement()` to render classified sentences**

In `js/list.js`, find the `createListingElement()` function (which builds the `<details>` element). Currently it renders the description as a single `<p class="listing-description">` with normalized text.

Replace the description rendering logic with:

```javascript
function renderDescription(opportunity, container) {
    var classifications = opportunity.sentence_classifications;

    if (!classifications || !classifications.length) {
        // Fallback: render raw description at normal tier
        var p = document.createElement('p');
        p.className = 'listing-description tier-normal';
        p.textContent = opportunity.description_cleaned || opportunity.description || '';
        container.appendChild(p);
        return;
    }

    // Group consecutive sentences by tier for cleaner rendering
    var groups = [];
    var currentGroup = null;

    classifications.forEach(function(item) {
        if (currentGroup && currentGroup.tier === item.tier) {
            currentGroup.sentences.push(item.text);
        } else {
            currentGroup = { tier: item.tier, sentences: [item.text] };
            groups.push(currentGroup);
        }
    });

    groups.forEach(function(group) {
        var p = document.createElement('p');
        p.className = 'listing-description';

        if (group.tier === 'highlight') {
            // Each highlighted sentence gets its own span for the marker effect
            group.sentences.forEach(function(sentence, i) {
                if (i > 0) p.appendChild(document.createTextNode(' '));
                var span = document.createElement('span');
                span.className = 'tier-highlight';
                span.textContent = sentence;
                p.appendChild(span);
            });
        } else {
            p.classList.add('tier-' + group.tier.replace('_', '-'));
            p.textContent = group.sentences.join(' ');
        }

        container.appendChild(p);
    });
}
```

Then update `createListingElement()` to call `renderDescription(opportunity, detailInner)` instead of the existing description rendering code.

- [ ] **Step 2: Ensure API response includes sentence_classifications**

The `getOpportunityFeed()` call in `js/api.js` already returns whatever the API sends. Since Plan 2 adds `sentence_classifications` to the response schema, it will be available as `opportunity.sentence_classifications` on each item. No API client changes needed.

- [ ] **Step 3: Test with mock data**

Temporarily add mock `sentence_classifications` to a listing in the browser console to verify rendering:

```javascript
// In browser console after page loads
var testClassifications = [
    {"text": "5+ years of experience in video production.", "tier": "highlight"},
    {"text": "Salary: $140,000 - $180,000.", "tier": "highlight"},
    {"text": "Lead a team of producers and editors.", "tier": "normal"},
    {"text": "Work closely with editorial leadership.", "tier": "normal"},
    {"text": "Great benefits including health insurance.", "tier": "faded"},
    {"text": "We are an equal opportunity employer.", "tier": "very_faded"}
];
```

Verify: highlighted sentences have yellow marker, normal is body color, faded is gray, very_faded is very light gray + smaller.

- [ ] **Step 4: Commit**

```bash
cd /Users/randycounsman/Git/p-p/producer-producer
git add js/list.js
git commit -m "feat: render sentence classifications with tier-based highlighting

Groups consecutive sentences by tier. Highlighted sentences get
yellow marker spans. Falls back to raw description when no
classifications are available."
```

---

## Chunk 3: Action Buttons, Undo Toast & Status Filter

### File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `list.html` | Add status filter toggle chips to filter bar |
| Modify | `css/list.css` | Styles for action buttons, undo toast |
| Modify | `js/list.js` | Action button handlers, undo toast, status filtering |

### Task 4: Add action buttons to expanded job detail

**Files:**
- Modify: `js/list.js`
- Modify: `css/list.css`

- [ ] **Step 1: Add action button styles to list.css**

```css
/* ── Action Buttons (expanded detail) ──────────────────────────────────── */

.listing-detail-actions {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
    align-items: center;
}

.action-btn {
    border: 1px solid var(--border-medium);
    background: transparent;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.38rem 0.85rem;
    cursor: pointer;
    transition: background 110ms ease, color 110ms ease, border-color 110ms ease;
    color: var(--ink-secondary);
}

.action-btn:hover {
    border-color: var(--ink-strong);
    color: var(--ink-strong);
}

.action-btn--save {
    border-color: var(--accent-red);
    color: var(--accent-red);
}

.action-btn--save:hover {
    background: var(--accent-red);
    color: #fff8f5;
}

.action-btn--save.is-active {
    background: var(--accent-red);
    color: #fff8f5;
}

.action-btn--applied.is-active {
    background: var(--ink-strong);
    color: var(--bg-page);
}

.action-btn--ignore {
    border-color: var(--border-light);
    color: var(--ink-muted);
}

.action-btn--ignore:hover {
    border-color: var(--border-medium);
    color: var(--ink-secondary);
}

.action-link {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-muted);
    text-decoration: none;
    margin-left: auto;
    transition: color 180ms ease;
}

.action-link:hover {
    color: var(--accent-amber);
}
```

- [ ] **Step 2: Render action buttons in createListingElement()**

In `js/list.js`, modify `createListingElement()` to add action buttons when signed in. Add after the metadata line, before the description:

```javascript
function createDetailActions(opportunity, detailInner) {
    var actionsDiv = document.createElement('div');
    actionsDiv.className = 'listing-detail-actions';

    // Auth-gated buttons: Save, Applied, Ignore
    if (window.api.isAuthenticated()) {
        // Save button
        var saveBtn = document.createElement('button');
        saveBtn.className = 'action-btn action-btn--save';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            updateStatus(opportunity, 'todo', saveBtn, appliedBtn);
        });

        // Applied button
        var appliedBtn = document.createElement('button');
        appliedBtn.className = 'action-btn action-btn--applied';
        appliedBtn.textContent = 'Applied';
        appliedBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            updateStatus(opportunity, 'applied', appliedBtn, saveBtn);
        });

        // Ignore button
        var ignoreBtn = document.createElement('button');
        ignoreBtn.className = 'action-btn action-btn--ignore';
        ignoreBtn.textContent = 'Ignore';
        ignoreBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            ignoreOpportunity(opportunity);
        });

        actionsDiv.appendChild(saveBtn);
        actionsDiv.appendChild(appliedBtn);
        actionsDiv.appendChild(ignoreBtn);
    }

    // View original link — always visible (not gated behind auth)
    var viewLink = document.createElement('a');
    viewLink.className = 'action-link';
    viewLink.href = opportunity.url || '#';
    viewLink.target = '_blank';
    viewLink.rel = 'noopener noreferrer';
    viewLink.textContent = 'View original ↗';

    actionsDiv.appendChild(viewLink);
    detailInner.appendChild(actionsDiv);
}

async function updateStatus(opportunity, status, activeBtn, otherBtn) {
    try {
        await window.api.updateOpportunityStatus(opportunity.id, status);
        activeBtn.classList.add('is-active');
        if (otherBtn) otherBtn.classList.remove('is-active');
    } catch (err) {
        console.error('Failed to update status:', err);
    }
}
```

- [ ] **Step 3: Verify action buttons work with existing API methods**

`js/api.js` already has `updateOpportunityStatus()` (line 486) and `isAuthenticated()` (line 155). No additions needed for action button functionality.

- [ ] **Step 4: Commit**

```bash
cd /Users/randycounsman/Git/p-p/producer-producer
git add js/list.js js/api.js css/list.css
git commit -m "feat: add save/applied/ignore action buttons to expanded job rows

Buttons only visible when signed in. Updates UserOpportunity status
via PUT /users/me/opportunities/:id."
```

### Task 5: Add undo toast for ignore action

**Files:**
- Modify: `js/list.js`
- Modify: `css/list.css`
- Modify: `list.html`

- [ ] **Step 1: Add toast HTML to list.html**

Before the closing `</body>` tag:

```html
<div class="undo-toast is-hidden" id="undo-toast">
    <span class="undo-toast-text" id="undo-toast-text"></span>
    <button type="button" class="undo-toast-btn" id="undo-toast-btn">Undo</button>
</div>
```

- [ ] **Step 2: Add toast styles to list.css**

```css
/* ── Undo Toast ────────────────────────────────────────────────────────── */

.undo-toast {
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    background: var(--ink-strong);
    color: var(--bg-page);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    padding: 0.65rem 1.25rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 1rem;
    z-index: 50;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: opacity 200ms ease, transform 200ms ease;
}

.undo-toast.is-hidden {
    opacity: 0;
    transform: translateX(-50%) translateY(1rem);
    pointer-events: none;
}

.undo-toast-btn {
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: transparent;
    color: var(--bg-page);
    font-family: var(--font-mono);
    font-size: 0.65rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.25rem 0.65rem;
    border-radius: 3px;
    cursor: pointer;
    transition: background 110ms ease;
}

.undo-toast-btn:hover {
    background: rgba(255, 255, 255, 0.15);
}
```

- [ ] **Step 3: Implement ignore + undo logic in list.js**

```javascript
var undoState = { timer: null, opportunityId: null, element: null };

function ignoreOpportunity(opportunity) {
    // Find and remove the listing element
    var listingEl = document.querySelector('[data-opportunity-id="' + opportunity.id + '"]');
    if (listingEl) {
        listingEl.style.transition = 'opacity 200ms ease, max-height 300ms ease';
        listingEl.style.opacity = '0';
        listingEl.style.maxHeight = listingEl.scrollHeight + 'px';
        requestAnimationFrame(function() {
            listingEl.style.maxHeight = '0';
            listingEl.style.overflow = 'hidden';
        });
    }

    // Clear any existing undo timer
    if (undoState.timer) {
        clearTimeout(undoState.timer);
        // Previous ignore is now permanent
        finalizeIgnore(undoState.opportunityId);
    }

    // Show toast
    var toast = document.getElementById('undo-toast');
    var toastText = document.getElementById('undo-toast-text');
    toastText.textContent = '"' + (opportunity.title || 'Job') + '" ignored.';
    toast.classList.remove('is-hidden');

    // Store undo state
    undoState.opportunityId = opportunity.id;
    undoState.element = listingEl;

    // Auto-dismiss after 5 seconds
    undoState.timer = setTimeout(function() {
        toast.classList.add('is-hidden');
        finalizeIgnore(opportunity.id);
        undoState = { timer: null, opportunityId: null, element: null };
    }, 5000);
}

function finalizeIgnore(opportunityId) {
    window.api.updateOpportunityStatus(opportunityId, 'ignored').catch(function(err) {
        console.error('Failed to ignore:', err);
    });
}

// Undo button handler
document.getElementById('undo-toast-btn').addEventListener('click', function() {
    if (undoState.timer) clearTimeout(undoState.timer);

    // Restore the element
    if (undoState.element) {
        undoState.element.style.transition = 'opacity 200ms ease, max-height 300ms ease';
        undoState.element.style.opacity = '1';
        undoState.element.style.maxHeight = '';
        undoState.element.style.overflow = '';
    }

    // Hide toast
    document.getElementById('undo-toast').classList.add('is-hidden');
    undoState = { timer: null, opportunityId: null, element: null };
});
```

Also: add `data-opportunity-id` attribute to listing elements in `createListingElement()`:

```javascript
detailsEl.setAttribute('data-opportunity-id', opportunity.id);
```

- [ ] **Step 4: Test manually**

Verify:
- Clicking Ignore animates the row out
- Toast appears at bottom with job title and "Undo" button
- Clicking Undo restores the row
- Ignoring a second job replaces the first toast
- After 5 seconds the toast auto-dismisses

- [ ] **Step 5: Commit**

```bash
cd /Users/randycounsman/Git/p-p/producer-producer
git add list.html css/list.css js/list.js
git commit -m "feat: add undo toast for ignore action

Job row animates out, toast shows for 5s with undo option.
New ignore replaces previous toast. API call deferred until
undo window closes."
```

### Task 6: Add status filter toggle (All Jobs / Saved / Applied)

**Files:**
- Modify: `list.html`
- Modify: `css/list.css`
- Modify: `js/list.js`

- [ ] **Step 1: Add status chips to filter bar in list.html**

In `list.html`, add a new filter group inside the `.threshold-form` (after category chips, around line 101):

```html
<div class="filter-group filter-group--status is-hidden" id="status-filter-group">
    <span class="filter-label">View</span>
    <div class="status-chips" id="status-chips">
        <button type="button" class="chip is-active" data-status="all">All Jobs</button>
        <button type="button" class="chip" data-status="saved">Saved</button>
        <button type="button" class="chip" data-status="applied">Applied</button>
    </div>
</div>
```

- [ ] **Step 2: Show/hide status filter based on auth state**

In `js/list.js`, inside the `pp:auth-changed` handler, toggle visibility:

```javascript
var statusGroup = document.getElementById('status-filter-group');
if (isAuth) {
    statusGroup.classList.remove('is-hidden');
} else {
    statusGroup.classList.add('is-hidden');
    // Reset to "All Jobs" when signed out
    state.statusFilter = 'all';
}
```

- [ ] **Step 3: Handle status chip clicks**

```javascript
document.getElementById('status-chips').addEventListener('click', function(e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;

    // Update active state
    document.querySelectorAll('#status-chips .chip').forEach(function(c) {
        c.classList.remove('is-active');
    });
    chip.classList.add('is-active');

    state.statusFilter = chip.getAttribute('data-status');
    loadListings();
});
```

- [ ] **Step 4: Modify `fetchAllListings()` to use different endpoint based on status**

```javascript
async function fetchAllListings(minScore) {
    if (state.statusFilter && state.statusFilter !== 'all' && window.api.isAuthenticated()) {
        // Use for-me endpoint with status filter
        var statusMap = { saved: 'todo', applied: 'applied' };
        var params = {
            min_score: minScore,
            status_filter: statusMap[state.statusFilter],
            limit: PAGE_SIZE,
        };
        var results = await window.api.getOpportunitiesForMe(params);
        return results || [];
    }

    // Existing pagination logic for public feed
    // ... (keep existing code)
}
```

`getOpportunitiesForMe` already exists in `js/api.js` (line 445). No additions needed.

**Important:** When the "All Jobs" status filter is active and the user is signed in, the public feed still shows all jobs including ones the user has ignored. Client-side filter these out by tracking ignored opportunity IDs:

```javascript
// After ignoreOpportunity() is called, add the ID to a local set:
var ignoredIds = new Set();

// In ignoreOpportunity(), after animation:
ignoredIds.add(opportunity.id);

// In the rendering loop for "All Jobs", skip ignored IDs:
if (state.statusFilter === 'all' && ignoredIds.has(opportunity.id)) continue;
```

- [ ] **Step 5: Add `statusFilter` to state initialization**

In `js/list.js`, add to the state object:

```javascript
var state = {
    minScore: DEFAULT_MIN_SCORE,
    category: 'all',
    statusFilter: 'all',
    listings: [],
};
```

- [ ] **Step 6: Test manually**

Verify:
- Status filter chips hidden when signed out
- Visible when signed in
- "Saved" shows only saved jobs
- "Applied" shows only applied jobs
- "All Jobs" shows everything (minus ignored)

- [ ] **Step 7: Commit**

```bash
cd /Users/randycounsman/Git/p-p/producer-producer
git add list.html css/list.css js/list.js js/api.js
git commit -m "feat: add status filter toggle (All Jobs / Saved / Applied)

Chips appear when signed in. Saved/Applied use the for-me endpoint
with status_filter parameter."
```

---

## Chunk 3 Complete

### Task 7: Final polish and cache busting

**Files:**
- Modify: `list.html`
- Modify: `css/list.css`

- [ ] **Step 1: Update all cache-bust version params in list.html**

Ensure all CSS and JS references use the current date version:

```html
<link rel="stylesheet" href="css/list.css?v=20260314">
<script src="js/auth.js?v=20260314"></script>
<script src="js/api.js?v=20260314"></script>
<script src="js/list.js?v=20260314"></script>
```

- [ ] **Step 2: Trim intro section copy**

In `list.html` line 63, replace the current verbose body text:

```html
<!-- REPLACE THIS: -->
<p class="intro-body">Producer-Producer aggregates job openings from newsrooms, podcast studios, documentary houses, and digital publishers — then scores each one with our proprietary algorithm. Roles are ranked by score so the most relevant opportunities surface first. No noise, no recruiter spam. Just the gigs worth your time.</p>

<!-- WITH THIS: -->
<p class="intro-body">We aggregate and score job openings from top media companies — so you see the best opportunities first. No noise, no recruiter spam.</p>
```

- [ ] **Step 3: Verify "View original" link visible when signed out**

Confirm that `createDetailActions()` (from Task 4) renders the "View original ↗" link outside the auth gate. This was handled in the implementation — just verify it works by expanding a job while signed out.

- [ ] **Step 4: Run Playwright smoke tests**

```bash
cd /Users/randycounsman/Git/p-p/producer-producer
playwright-cli tests/playwright-smoke.spec.ts
```

Expected: Existing smoke tests pass.

- [ ] **Step 5: Final commit**

```bash
cd /Users/randycounsman/Git/p-p/producer-producer
git add list.html css/list.css js/list.js js/api.js js/auth.js
git commit -m "feat: list.html redesign complete

Editorial list view with inline expand, AI sentence highlighting,
auth controls, save/applied/ignore actions with undo toast,
and status filter toggle."
```

---

## Plan Complete

**Verification checklist:**
1. Header shows sign-in/sign-out based on auth state
2. Newsletter form triggers magic link + OTP flow (unified sign-in/subscribe)
3. Expanded jobs show sentence-level highlight/fade when classifications available
4. Falls back to plain text when no classifications
5. Save/Applied/Ignore buttons visible only when signed in
6. Ignore removes row with 5-second undo toast
7. Status filter (All/Saved/Applied) visible when signed in
8. All existing Playwright smoke tests pass
