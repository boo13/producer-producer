# Saved Jobs Reorder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add drag-to-reorder functionality for saved jobs with persistent ordering and display posting date instead of location.

**Architecture:** Backend adds `display_order` field to `user_opportunities` table with new bulk reorder endpoint. Frontend replaces location with date display and implements HTML5 drag-and-drop with optimistic updates.

**Tech Stack:** SQLAlchemy, Alembic, FastAPI (backend), Vanilla JS, HTML5 drag-and-drop (frontend)

---

## Task 1: Backend - Database Migration

**Files:**
- Create: `/Users/randycounsman/Git/producer-producer-api/alembic/versions/005_add_display_order_to_user_opportunities.py`

**Step 1: Create migration file**

Create new Alembic migration:

```python
"""Add display_order field to user_opportunities for custom sorting.

Revision ID: 005
Revises: 004
Create Date: 2026-02-03
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add display_order column
    op.add_column(
        "user_opportunities",
        sa.Column("display_order", sa.Integer(), nullable=True),
    )

    # Add index for efficient sorting
    op.create_index(
        "ix_user_opportunities_display_order",
        "user_opportunities",
        ["user_id", "display_order"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_opportunities_display_order", table_name="user_opportunities")
    op.drop_column("user_opportunities", "display_order")
```

**Step 2: Run migration**

```bash
cd /Users/randycounsman/Git/producer-producer-api
alembic upgrade head
```

Expected: Migration runs successfully, `display_order` column added.

**Step 3: Commit**

```bash
git add alembic/versions/005_add_display_order_to_user_opportunities.py
git commit -m "feat(db): add display_order to user_opportunities

Adds display_order field for custom saved job sorting.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Backend - Update Models

**Files:**
- Modify: `/Users/randycounsman/Git/producer-producer-api/fly_app/models.py:474-511`

**Step 1: Add display_order field to UserOpportunity model**

In the `UserOpportunity` class (around line 499, after the `score` field):

```python
# User-specific score (computed using their preferences)
score: Mapped[float | None] = mapped_column(Float)

# Custom display order for saved jobs (NULL = use default sort)
display_order: Mapped[int | None] = mapped_column(Integer)

# When this opportunity was added to user's list
created_at: Mapped[datetime] = mapped_column(
```

**Step 2: Verify model loads**

```bash
cd /Users/randycounsman/Git/producer-producer-api
python -c "from fly_app.models import UserOpportunity; print('Model OK')"
```

Expected: "Model OK" printed, no errors.

**Step 3: Commit**

```bash
git add fly_app/models.py
git commit -m "feat(models): add display_order to UserOpportunity

Supports custom ordering of saved jobs.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Backend - Update Schemas

**Files:**
- Modify: `/Users/randycounsman/Git/producer-producer-api/fly_app/schemas.py:239-256`

**Step 1: Add display_order to UserOpportunityResponse**

In `UserOpportunityResponse` class (after line 247):

```python
opportunity_id: int
created_at: datetime
updated_at: datetime
display_order: int | None = None  # NEW
opportunity: OpportunityResponse | None = None
```

**Step 2: Add display_order to UserOpportunityUpdate**

In `UserOpportunityUpdate` class (after line 255):

```python
status: Literal["todo", "applied", "ignored", "expired"] | None = None
score: float | None = None
ignore_reason: str | None = None
display_order: int | None = None  # NEW
```

**Step 3: Verify schemas load**

```bash
cd /Users/randycounsman/Git/producer-producer-api
python -c "from fly_app.schemas import UserOpportunityResponse, UserOpportunityUpdate; print('Schemas OK')"
```

Expected: "Schemas OK" printed, no errors.

**Step 4: Commit**

```bash
git add fly_app/schemas.py
git commit -m "feat(schemas): add display_order to user opportunity schemas

Allows API to send/receive custom sort order.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Backend - Update GET Endpoint Sorting

**Files:**
- Modify: `/Users/randycounsman/Git/producer-producer-api/fly_app/routers/users.py:104-160`

**Step 1: Update sorting in get_user_opportunities**

Find the query around line 126 and update the ordering (replace the existing `order_by`):

```python
if status_filter:
    query = query.filter(UserOpportunity.status == status_filter)

# Order by custom display_order first, then by posted_date (oldest first)
query = query.order_by(
    UserOpportunity.display_order.asc().nulls_last(),
    UserOpportunity.created_at.desc(),  # Keep existing fallback for now
)

# Apply pagination
user_opportunities = query.offset(offset).limit(limit).all()
```

**Step 2: Test GET endpoint manually**

```bash
# Start dev server in one terminal
cd /Users/randycounsman/Git/producer-producer-api
uvicorn fly_app.main:app --reload

# In another terminal, test the endpoint (replace TOKEN with valid token)
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:8000/users/me/opportunities?status_filter=todo
```

Expected: JSON response with opportunities, `display_order` field present (null values OK).

**Step 3: Commit**

```bash
git add fly_app/routers/users.py
git commit -m "feat(api): sort saved jobs by display_order then created_at

Custom order takes precedence over default sort.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Backend - Add Bulk Reorder Endpoint

**Files:**
- Modify: `/Users/randycounsman/Git/producer-producer-api/fly_app/routers/users.py:162-212`

**Step 1: Add bulk reorder endpoint after update_user_opportunity**

After the `update_user_opportunity` function (around line 211), add:

```python
@router.put("/me/opportunities/reorder")
def reorder_user_opportunities(
    items: list[dict[str, int]],
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """Bulk update display_order for multiple opportunities.

    Expects: [{"opportunity_id": 123, "display_order": 0}, ...]
    Returns: {"updated": count}
    """
    if not items:
        return {"updated": 0}

    # Extract opportunity IDs
    opportunity_ids = [item["opportunity_id"] for item in items]

    # Query all user_opportunities for current user with these IDs
    user_opps = (
        db.query(UserOpportunity)
        .filter(
            UserOpportunity.user_id == current_user.id,
            UserOpportunity.opportunity_id.in_(opportunity_ids),
        )
        .all()
    )

    # Validate all opportunities belong to user
    if len(user_opps) != len(opportunity_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Some opportunities not found or don't belong to user",
        )

    # Create lookup map for efficient updates
    order_map = {item["opportunity_id"]: item["display_order"] for item in items}

    # Update display_order for each
    updated_count = 0
    for user_opp in user_opps:
        new_order = order_map.get(user_opp.opportunity_id)
        if new_order is not None:
            user_opp.display_order = new_order
            updated_count += 1

    db.commit()

    logger.info(
        f"User {current_user.id} reordered {updated_count} opportunities"
    )

    return {"updated": updated_count}
```

**Step 2: Test bulk reorder endpoint**

```bash
# With dev server running, test bulk reorder (replace TOKEN and IDs)
curl -X PUT http://localhost:8000/users/me/opportunities/reorder \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"opportunity_id": 123, "display_order": 0}, {"opportunity_id": 124, "display_order": 100}]'
```

Expected: `{"updated": 2}` response, 200 status.

**Step 3: Commit**

```bash
git add fly_app/routers/users.py
git commit -m "feat(api): add bulk reorder endpoint for saved jobs

POST /users/me/opportunities/reorder updates display_order.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Frontend - Add API Client Method

**Files:**
- Modify: `/Users/randycounsman/Git/producer-producer/v2/js/api.js:279-339`

**Step 1: Add reorderOpportunities method**

After the `updateOpportunityStatus` method (around line 278), add:

```javascript
/**
 * Opportunities: Bulk reorder saved jobs
 * @param {Array<{opportunity_id: number, display_order: number}>} items - Array of items to reorder
 */
async reorderOpportunities(items) {
    return await this.request('/users/me/opportunities/reorder', {
        method: 'PUT',
        body: JSON.stringify(items),
    });
}

/**
 * Opportunities: Get single opportunity
 */
async getOpportunity(id) {
```

**Step 2: Verify syntax**

```bash
cd /Users/randycounsman/Git/producer-producer
node -c v2/js/api.js
```

Expected: No output (file is valid JavaScript).

**Step 3: Commit**

```bash
git add v2/js/api.js
git commit -m "feat(api-client): add reorderOpportunities method

Calls bulk reorder endpoint.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Frontend - Update Applications Display (Date)

**Files:**
- Modify: `/Users/randycounsman/Git/producer-producer/v2/js/applications.js:30-41,86-92`

**Step 1: Add formatDate helper**

Replace `formatLocation` function (lines 30-41) with:

```javascript
function formatDate(dateString) {
    if (!dateString) return 'Date unknown';

    try {
        const date = new Date(dateString);
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    } catch (err) {
        return 'Date unknown';
    }
}
```

**Step 2: Update renderList to use date instead of location**

In the `renderList()` function (around line 86), change:

```javascript
const item = document.createElement('div');
item.className = 'app-list__item';
item.dataset.opportunityId = String(oppId);

const date = formatDate(opp.posted_date || opp.created_at || opp.first_seen);

item.innerHTML = `
    <div class="app-list__info">
        <p class="app-list__title">${escapeHtml(opp.title)}</p>
        <p class="app-list__company">${escapeHtml(opp.company_name || 'Unknown Company')}</p>
        <p class="app-list__meta">${escapeHtml(date)}</p>
    </div>
    <div class="app-list__actions">
        <button class="app-list__btn${isApplied ? ' app-list__btn--applied' : ''}" type="button">
            ${isApplied ? 'Applied' : 'Mark Applied'}
        </button>
    </div>
`;
```

**Step 3: Test display in browser**

```bash
cd /Users/randycounsman/Git/producer-producer
python3 -m http.server 8080
```

Navigate to `http://localhost:8080/v2/`, log in, view saved jobs.

Expected: Jobs show date (e.g. "Feb 1, 2026") instead of location.

**Step 4: Commit**

```bash
git add v2/js/applications.js
git commit -m "feat(ui): show posting date instead of location for saved jobs

Helps users prioritize older opportunities.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Frontend - Add Drag Handle Markup

**Files:**
- Modify: `/Users/randycounsman/Git/producer-producer/v2/js/applications.js:86-99`

**Step 1: Add drag handle to item markup**

Update the `item.innerHTML` in `renderList()`:

```javascript
item.innerHTML = `
    <div class="app-list__info">
        <p class="app-list__title">${escapeHtml(opp.title)}</p>
        <p class="app-list__company">${escapeHtml(opp.company_name || 'Unknown Company')}</p>
        <p class="app-list__meta">${escapeHtml(date)}</p>
    </div>
    <button class="app-list__drag-handle" type="button" aria-label="Drag to reorder" draggable="true">
        <span aria-hidden="true">≡</span>
    </button>
    <div class="app-list__actions">
        <button class="app-list__btn${isApplied ? ' app-list__btn--applied' : ''}" type="button">
            ${isApplied ? 'Applied' : 'Mark Applied'}
        </button>
    </div>
`;
```

**Step 2: Verify markup in browser**

Refresh page, inspect element.

Expected: Drag handle button appears (may be unstyled, that's next task).

**Step 3: Commit**

```bash
git add v2/js/applications.js
git commit -m "feat(ui): add drag handle markup to saved jobs

Prepares for drag-to-reorder functionality.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Frontend - Style Drag Handle

**Files:**
- Modify: `/Users/randycounsman/Git/producer-producer/v2/css/styles.css`

**Step 1: Add drag handle styles**

Find the `.app-list__item` styles section and add after it:

```css
/* Drag handle for reordering */
.app-list__drag-handle {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 8px;
    background: transparent;
    border: none;
    cursor: grab;
    font-size: 20px;
    line-height: 1;
    color: #666;
    touch-action: none;
    user-select: none;
}

.app-list__drag-handle:hover {
    color: #000;
}

.app-list__drag-handle:active {
    cursor: grabbing;
}

/* Dragging state */
.app-list__item--dragging {
    opacity: 0.5;
    transform: rotate(2deg);
}

/* Drop zone indicator */
.app-list__item--drop-above::before {
    content: '';
    position: absolute;
    top: -2px;
    left: 0;
    right: 0;
    height: 4px;
    background: #007bff;
    border-radius: 2px;
}

.app-list__item--drop-below::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    right: 0;
    height: 4px;
    background: #007bff;
    border-radius: 2px;
}

/* Ensure item is positioned for absolute children */
.app-list__item {
    position: relative;
}
```

**Step 2: Update cache buster**

Find the `<link rel="stylesheet">` tag in `/Users/randycounsman/Git/producer-producer/v2/index.html` and bump the version:

```html
<link rel="stylesheet" href="css/styles.css?v=20260203a">
```

**Step 3: Test styling in browser**

Hard refresh (`Cmd+Shift+R`), verify drag handle appears in top-right with ≡ symbol.

Expected: Drag handle visible, changes color on hover.

**Step 4: Commit**

```bash
git add v2/css/styles.css v2/index.html
git commit -m "style(ui): add drag handle and dragging state styles

Visual feedback for drag-to-reorder.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Frontend - Implement Drag-and-Drop Logic

**Files:**
- Modify: `/Users/randycounsman/Git/producer-producer/v2/js/applications.js:76-110`

**Step 1: Add drag state tracking**

At the top of the file, update the state object (around line 10):

```javascript
const state = {
    applications: [],
    appliedIds: new Set(),
    isVisible: false,
    draggedItem: null,  // NEW
    isReordering: false,  // NEW
};
```

**Step 2: Add drag event handlers in renderList**

After creating the item element and before appending (around line 99), add:

```javascript
// Wire up button if not already applied
if (!isApplied) {
    const btn = item.querySelector('.app-list__btn');
    btn.addEventListener('click', () => markAsApplied(oppId));
}

// Wire up drag-and-drop handlers
const dragHandle = item.querySelector('.app-list__drag-handle');
setupDragHandlers(item, dragHandle);

listContainerEl.appendChild(item);
```

**Step 3: Add drag handler setup function**

Before the `renderList()` function, add these helper functions:

```javascript
// ==========================================================================
// Drag-and-Drop
// ==========================================================================

/**
 * Set up drag-and-drop event handlers for an item
 * @param {HTMLElement} item - The list item element
 * @param {HTMLElement} dragHandle - The drag handle button
 */
function setupDragHandlers(item, dragHandle) {
    dragHandle.addEventListener('dragstart', (e) => handleDragStart(e, item));
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', (e) => handleDrop(e, item));
    item.addEventListener('dragleave', handleDragLeave);
}

/**
 * Handle drag start
 */
function handleDragStart(e, item) {
    if (state.isReordering) {
        e.preventDefault();
        return;
    }

    state.draggedItem = item;
    item.classList.add('app-list__item--dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', item.innerHTML);
}

/**
 * Handle drag end
 */
function handleDragEnd(e) {
    if (state.draggedItem) {
        state.draggedItem.classList.remove('app-list__item--dragging');
        state.draggedItem = null;
    }

    // Remove all drop indicators
    document.querySelectorAll('.app-list__item--drop-above, .app-list__item--drop-below').forEach((el) => {
        el.classList.remove('app-list__item--drop-above', 'app-list__item--drop-below');
    });
}

/**
 * Handle drag over
 */
function handleDragOver(e) {
    if (!state.draggedItem) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const item = e.currentTarget;
    if (item === state.draggedItem) return;

    // Remove existing indicators
    item.classList.remove('app-list__item--drop-above', 'app-list__item--drop-below');

    // Determine if we should drop above or below
    const rect = item.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;

    if (e.clientY < midpoint) {
        item.classList.add('app-list__item--drop-above');
    } else {
        item.classList.add('app-list__item--drop-below');
    }
}

/**
 * Handle drag leave
 */
function handleDragLeave(e) {
    const item = e.currentTarget;
    item.classList.remove('app-list__item--drop-above', 'app-list__item--drop-below');
}

/**
 * Handle drop
 */
async function handleDrop(e, targetItem) {
    e.preventDefault();

    if (!state.draggedItem || state.draggedItem === targetItem) {
        handleDragEnd();
        return;
    }

    // Determine drop position
    const rect = targetItem.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const dropBefore = e.clientY < midpoint;

    // Reorder visually
    if (dropBefore) {
        targetItem.parentNode.insertBefore(state.draggedItem, targetItem);
    } else {
        targetItem.parentNode.insertBefore(state.draggedItem, targetItem.nextSibling);
    }

    handleDragEnd();

    // Persist to backend
    await saveReorderedList();
}

/**
 * Save the reordered list to backend
 */
async function saveReorderedList() {
    if (state.isReordering) return;

    state.isReordering = true;

    try {
        // Get all items in current DOM order
        const items = Array.from(listContainerEl.querySelectorAll('.app-list__item'));

        // Build reorder payload
        const reorderPayload = items.map((item, index) => ({
            opportunity_id: Number(item.dataset.opportunityId),
            display_order: index * 100,
        }));

        // Call API
        await window.api.reorderOpportunities(reorderPayload);

        console.log('[ApplicationsV2] Reorder saved successfully');
    } catch (err) {
        console.error('[ApplicationsV2] Failed to save reorder:', err);
        showToast('Failed to save order');

        // Reload to revert to server order
        loadApplications();
    } finally {
        state.isReordering = false;
    }
}
```

**Step 4: Test drag-and-drop in browser**

Refresh page, try dragging saved jobs to reorder.

Expected:
- Drag handle cursor changes to "grabbing"
- Item becomes semi-transparent while dragging
- Blue drop indicator shows above/below items
- Items reorder visually on drop
- No console errors

**Step 5: Commit**

```bash
git add v2/js/applications.js
git commit -m "feat(ui): implement drag-to-reorder for saved jobs

HTML5 drag-and-drop with optimistic updates.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Testing and Polish

**Files:**
- Test: All implemented features

**Step 1: Manual testing checklist**

Test these scenarios:

1. ✓ Saved jobs show posting date instead of location
2. ✓ Drag handle appears in top-right of each item
3. ✓ Can drag items to reorder
4. ✓ Visual feedback (opacity, drop indicators) during drag
5. ✓ Order persists after page refresh
6. ✓ Order persists after logout/login
7. ✓ Newly saved job appears at bottom of list
8. ✓ Marking job as applied removes it without affecting remaining order
9. ✓ Error toast shows if reorder API fails

**Step 2: Test API failure scenario**

In browser console:

```javascript
// Temporarily break API
const originalReorder = window.api.reorderOpportunities;
window.api.reorderOpportunities = () => Promise.reject(new Error('Test error'));

// Try reordering - should show error toast and revert
```

Expected: Error toast appears, list reverts to original order.

**Step 3: Restore API and verify recovery**

```javascript
window.api.reorderOpportunities = originalReorder;
```

**Step 4: Cross-browser testing**

Test in:
- Chrome/Edge (primary)
- Safari
- Firefox

Expected: Drag-and-drop works in all browsers.

**Step 5: Document completion**

No commit needed - testing complete.

---

## Task 12: Final Review and Deployment

**Step 1: Review all changes**

```bash
# Frontend
cd /Users/randycounsman/Git/producer-producer
git log --oneline -10

# Backend
cd /Users/randycounsman/Git/producer-producer-api
git log --oneline -10
```

Expected: All commits present with clear messages.

**Step 2: Create summary commit (optional)**

```bash
cd /Users/randycounsman/Git/producer-producer
git commit --allow-empty -m "feat: saved jobs reorder complete

Summary of changes:
- Replaced location with posting date
- Added drag-to-reorder functionality
- Custom order persists across sessions

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Step 3: Deployment instructions**

**Backend:**
```bash
cd /Users/randycounsman/Git/producer-producer-api
# Run migration on production
fly ssh console -a producer-producer-api
cd /app && alembic upgrade head
```

**Frontend:**
```bash
cd /Users/randycounsman/Git/producer-producer
git push origin main
# GitHub Pages will auto-deploy
```

**Step 4: Verify in production**

1. Visit https://producer-producer.com/v2/
2. Log in
3. Save some jobs
4. Verify date display
5. Drag to reorder
6. Refresh page - order should persist

Expected: All features working in production.

---

## Success Criteria

- ✓ Saved jobs display posting date instead of location
- ✓ Default sort is oldest-first
- ✓ Drag handle visible and functional
- ✓ Drag-to-reorder works smoothly
- ✓ Custom order persists across sessions
- ✓ Error handling shows user feedback
- ✓ No console errors
- ✓ Works in Chrome, Safari, Firefox

## Notes

- Migration is backwards compatible (nullable field)
- Existing saved jobs will have `NULL` display_order and sort by created_at
- First drag-reorder assigns display_order to all items
- Spacing by 100s allows future manual insertions without gaps
