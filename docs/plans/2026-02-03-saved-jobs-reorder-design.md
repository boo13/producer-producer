# Saved Jobs Display and Reordering Design

**Date:** 2026-02-03
**Status:** Approved

## Overview

Add custom drag-to-reorder functionality for saved jobs with persistent ordering across logins. Replace location display with posting date and default to oldest-first sorting.

## User Stories

1. As a user, I want to see when jobs were posted so I can prioritize older opportunities that may expire sooner
2. As a user, I want to drag jobs to reorder my saved list so I can organize by personal priority
3. As a user, I want my custom order to persist across devices and sessions

## Design Decisions

### Data Model

**New field on `user_opportunities` table:**
```python
display_order = Column(Integer, nullable=True)  # NULL = use default sort
```

**Sorting logic:**
- Jobs with `display_order` set: sort by `display_order` ASC (lowest number = top)
- Jobs without `display_order`: fall back to `posted_date` ASC (oldest first)
- Custom-ordered jobs appear before auto-sorted jobs

**API changes:**
- `PUT /users/me/opportunities/{id}` - accepts optional `display_order` field
- `PUT /users/me/opportunities/reorder` - new bulk endpoint (accepts array of `{opportunity_id, display_order}`)
- `GET /users/me/opportunities` - returns `display_order` in response, sorts accordingly

### Frontend Display

**Replace location with posting date:**
```
Before: "New York, NY"
After:  "Jan 15, 2026"
```

**Visual layout:**
```
┌─────────────────────────────────────┐
│ Senior Producer                  ≡  │  ← drag handle top right
│ Netflix                              │
│ Jan 15, 2026                         │
│                        [Mark Applied]│
└─────────────────────────────────────┘
```

**Default sort order:**
- Oldest posting date at top, newest at bottom
- Rationale: Older jobs may expire sooner
- After user reorders, custom order takes precedence
- New saved jobs append to bottom with `max(display_order) + 100`

### Drag-to-Reorder Implementation

**Technology:**
- Native HTML5 drag-and-drop (no external dependencies)
- Matches v2 philosophy of minimal libraries

**Interaction flow:**
1. User grabs drag handle (≡) on top right
2. Item becomes semi-transparent while dragging
3. Drop zones appear between list items
4. On drop, items reorder visually immediately (optimistic update)
5. API call in background to persist new order

**Order calculation:**
- When user drops item at position N: assign `display_order = N * 100`
- Spacing by 100s allows future insertions without renumbering
- Example: position 0 = 0, position 1 = 100, position 2 = 200
- Single bulk API call: `PUT /users/me/opportunities/reorder` with array of all items

**Edge cases:**
- **Drag while API pending:** Queue next reorder, disable dragging until current save completes
- **API failure:** Revert visual order, show error toast
- **New job saved during session:** Append to bottom with `max(display_order) + 100`
- **Concurrent sessions:** Last write wins (acceptable UX for personal list)

## Backend Implementation

### Database Migration

```sql
-- Add display_order column
ALTER TABLE user_opportunities
ADD COLUMN display_order INTEGER NULL;

-- Index for efficient sorting
CREATE INDEX idx_user_opps_display_order
ON user_opportunities(user_id, display_order);
```

### Schema Updates

**UserOpportunityUpdate:**
```python
class UserOpportunityUpdate(BaseModel):
    status: str | None = None
    score: float | None = None
    ignore_reason: str | None = None
    display_order: int | None = None  # NEW
```

**UserOpportunityResponse:**
```python
class UserOpportunityResponse(BaseModel):
    # ... existing fields
    display_order: int | None = None  # NEW
```

### New Endpoint: Bulk Reorder

```python
@router.put("/users/me/opportunities/reorder")
def reorder_user_opportunities(
    items: list[dict[str, int]],  # [{"opportunity_id": 123, "display_order": 100}, ...]
    current_user: CurrentUser,
    db: Session,
) -> dict:
    """Bulk update display_order for multiple opportunities.

    Validates all opportunities belong to current user before updating.
    Returns count of updated items.
    """
    # Implementation:
    # 1. Extract opportunity_ids from request
    # 2. Query all user_opportunities for current user with those IDs
    # 3. Validate count matches (all belong to user)
    # 4. Update display_order for each in single transaction
    # 5. Return {"updated": count}
```

### Updated GET Sorting

**In `get_user_opportunities()`:**
```python
query = (
    db.query(UserOpportunity)
    .filter(UserOpportunity.user_id == current_user.id)
    .options(joinedload(UserOpportunity.opportunity))
)

if status_filter:
    query = query.filter(UserOpportunity.status == status_filter)

# NEW SORTING LOGIC
query = query.order_by(
    UserOpportunity.display_order.asc().nullsfirst(),  # Custom order first
    Opportunity.posted_date.asc(),  # Then oldest posted first
)

user_opportunities = query.offset(offset).limit(limit).all()
```

## Frontend Implementation

### Files to Modify

**`v2/js/applications.js`:**
- Update `formatLocation()` → `formatDate()` (reuse from opportunities.js)
- Modify `renderList()` to show date instead of location
- Add drag handle to item markup (top right position)
- Implement drag-and-drop event handlers
- Add `reorderList()` function to call bulk API endpoint
- Handle optimistic updates and error rollback

**`v2/css/` (styles):**
- Add drag handle styling (≡ icon, top-right position)
- Add dragging state styles (opacity, cursor)
- Add drop zone indicators
- Ensure drag handle is accessible (large touch target)

### API Client Updates

**`v2/js/api.js`:**
```javascript
/**
 * Opportunities: Bulk reorder saved jobs
 */
async reorderOpportunities(items) {
    return await this.request('/users/me/opportunities/reorder', {
        method: 'PUT',
        body: JSON.stringify(items),
    });
}
```

## Testing Plan

### Backend Tests
1. Migration runs successfully on existing data
2. GET endpoint returns display_order field
3. GET endpoint sorts by display_order, then posted_date
4. PUT single opportunity updates display_order
5. PUT bulk reorder validates ownership
6. PUT bulk reorder updates multiple items in transaction

### Frontend Tests
1. Saved jobs show date instead of location
2. Default sort is oldest-first when no custom order
3. Drag handle appears on top right
4. Dragging reorders list visually
5. API call persists order
6. Error reverts visual order
7. New saved job appends to bottom

### Manual QA
1. Reorder jobs, refresh page → order persists
2. Reorder jobs, log out/in → order persists
3. Save new job → appears at bottom
4. Mark job as applied → removes from list, doesn't affect remaining order

## Rollout Plan

1. **Phase 1: Backend** - Migration, schema updates, API endpoints
2. **Phase 2: Frontend Display** - Replace location with date, default sort
3. **Phase 3: Drag-to-Reorder** - Add drag functionality, persistence
4. **Phase 4: Polish** - Error handling, loading states, accessibility

## Success Metrics

- Users can see posting dates on saved jobs
- Users can drag to reorder their list
- Custom order persists across sessions
- No increase in API errors or performance degradation
