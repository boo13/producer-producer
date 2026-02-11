# User Testing TODO - Saved Jobs Reorder Feature

## Quick Start

1. Visit https://producer-producer.com/v2/
2. Log in
3. Save some jobs by swiping right
4. Navigate to "Saved Jobs" tab
5. Test drag-to-reorder functionality

---

## Testing Checklist

### Core Functionality
- [X] Saved jobs show posting date (e.g., "Feb 1, 2026") instead of location
- [X] Drag handle (≡) appears in top-right of each saved job item
- [X] Drag handle changes cursor to "grab" on hover
- [ ] Can drag items by the handle to reorder
- [X] Visual feedback during drag (item becomes semi-transparent)
- [X] Blue drop indicator shows above/below items during drag
- [ ] Items reorder visually when dropped
- [ ] Order persists after page refresh
- [ ] Order persists after logout/login

### Edge Cases
- [ ] Marking job as applied removes it (doesn't affect remaining order)
- [ ] Newly saved job appears at bottom of list
- [ ] Can't drag while reorder API call is in progress

### Error Handling Test

Open browser console and run:
```javascript
// Break the API temporarily
const originalReorder = window.api.reorderOpportunities;
window.api.reorderOpportunities = () => Promise.reject(new Error('Test error'));

// Try reordering - should show "Failed to save order" toast and revert
```

Then restore:
```javascript
window.api.reorderOpportunities = originalReorder;
```

Expected: Error toast appears, list reverts to original order.

### Cross-Browser Testing (Optional)
- [ ] Chrome/Edge (primary target)
- [ ] Safari
- [ ] Firefox

---

## Known Issues / Bugs Found

(Add any issues you find here with screenshots/descriptions)

---

## Backend Deployment Reminder

Before frontend changes take effect, the backend migration needs to run on production:

```bash
cd /Users/randycounsman/Git/producer-producer-api
fly ssh console -a producer-producer-api
cd /app && alembic upgrade head
```

This adds the `display_order` column to the database.
