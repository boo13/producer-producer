# Saved Jobs Reorder - Deployment Instructions

## Summary

This deployment adds drag-to-reorder functionality for saved jobs with persistent custom ordering. Users can now:
- See posting dates instead of locations in saved jobs
- Drag jobs to reorder by priority
- Have custom order persist across sessions

---

## Pre-Deployment Checklist

- [x] Backend code committed (7 commits)
- [x] Frontend code committed (6 commits)
- [x] Design documented (docs/plans/2026-02-03-saved-jobs-reorder-design.md)
- [x] Implementation plan created (docs/plans/2026-02-03-saved-jobs-reorder-implementation.md)
- [ ] Backend deployed to Fly.io
- [ ] Database migration run on production
- [ ] Frontend deployed to GitHub Pages

---

## Deployment Steps

### 1. Backend Deployment (producer-producer-api)

**Commits to deploy:**
```
0824d7c feat(db): add display_order to user_opportunities
4ef83f2 feat(models): add display_order to UserOpportunity
dbfb9d0 fix(models): add display_order index to UserOpportunity model
3e23988 feat(schemas): add display_order to user opportunity schemas
e5eefd8 feat(api): sort saved jobs by display_order then created_at
4145212 feat(api): add bulk reorder endpoint for saved jobs
cea0593 fix(api): add validation and duplicate detection to reorder endpoint
```

**Deploy commands:**
```bash
cd /Users/randycounsman/Git/producer-producer-api

# Push to main
git push origin main

# Deploy to Fly.io
fly deploy

# Run migration on production
fly ssh console -a producer-producer-api
cd /app && alembic upgrade head
exit
```

**Verify migration:**
- SSH into the app and check: `alembic current`
- Should show: `005 (head)` - add_display_order_to_user_opportunities

---

### 2. Frontend Deployment (producer-producer)

**Commits to deploy:**
```
bb47c74 docs: add saved jobs reorder design
db2cf1e docs: add saved jobs reorder implementation plan
da4ae6a feat(api-client): add reorderOpportunities method
71952e9 feat(ui): show posting date instead of location for saved jobs
a2c717d feat(ui): add drag handle markup to saved jobs
5665ede style(ui): add drag handle and dragging state styles
e1b691c feat(ui): implement drag-to-reorder for saved jobs
```

**Deploy commands:**
```bash
cd /Users/randycounsman/Git/producer-producer

# Push to main (GitHub Pages auto-deploys)
git push origin main
```

**Verify deployment:**
- Wait 1-2 minutes for GitHub Pages to rebuild
- Visit https://producer-producer.com/v2/
- Check browser console for any errors

---

## Post-Deployment Verification

### Smoke Test (5 minutes)

1. **Visit** https://producer-producer.com/v2/
2. **Login** with magic link
3. **Save jobs** - Swipe right on 3-5 jobs
4. **Navigate** to "Saved Jobs" tab
5. **Verify dates** - Should show "Feb 3, 2026" style instead of locations
6. **Check drag handle** - Should see ≡ in top-right of each item
7. **Try dragging** - Drag one job to different position
8. **Refresh page** - Verify order persisted
9. **Check console** - No JavaScript errors

### Full Testing

See USERTODO.md for complete testing checklist.

---

## Rollback Plan (If Needed)

### Backend Rollback
```bash
cd /Users/randycounsman/Git/producer-producer-api

# Rollback migration
fly ssh console -a producer-producer-api
cd /app && alembic downgrade -1
exit

# Revert code
git revert cea0593 4145212 e5eefd8 3e23988 dbfb9d0 4ef83f2 0824d7c
git push origin main
fly deploy
```

### Frontend Rollback
```bash
cd /Users/randycounsman/Git/producer-producer

git revert e1b691c 5665ede a2c717d 71952e9 da4ae6a
git push origin main
```

---

## Database Changes

### New Column
- **Table:** `user_opportunities`
- **Column:** `display_order` (INTEGER, nullable)
- **Index:** `ix_user_opportunities_display_order` on (user_id, display_order)

### Migration
- **File:** `alembic/versions/005_add_display_order_to_user_opportunities.py`
- **Revision:** 005
- **Revises:** b515414bf1e4

**Impact:**
- Backwards compatible (nullable column)
- Existing saved jobs will have NULL display_order
- First drag-reorder assigns display_order to all items
- No data loss risk

---

## API Changes

### New Endpoint
**PUT /users/me/opportunities/reorder**
- Bulk updates display_order for multiple opportunities
- Request: `[{"opportunity_id": 123, "display_order": 0}, ...]`
- Response: `{"updated": count}`
- Validation: Checks ownership, prevents duplicates

### Modified Endpoint
**GET /users/me/opportunities**
- Now sorts by: `display_order ASC NULLS LAST, created_at DESC`
- Custom-ordered jobs appear first
- Jobs without custom order fall back to creation date

---

## Frontend Changes

### Applications Module (v2/js/applications.js)
- Replaced location display with posting date
- Added drag handle markup (≡ button)
- Implemented HTML5 drag-and-drop
- API persistence on drop
- Error handling with toast notifications

### API Client (v2/js/api.js)
- Added `reorderOpportunities()` method

### Styles (v2/css/styles.css)
- Drag handle positioning (top-right)
- Dragging state (opacity, rotation)
- Drop zone indicators (blue lines)

---

## Success Metrics

After 24-48 hours, check:
- [ ] No increase in JavaScript errors (Sentry)
- [ ] No API 400/500 errors on reorder endpoint
- [ ] Users are reordering jobs (check logs for "reordered N opportunities")
- [ ] No complaints about broken saved jobs functionality

---

## Known Limitations

1. **Concurrent sessions:** Last write wins (acceptable for personal lists)
2. **Mobile:** Drag-and-drop requires touch events polyfill (HTML5 drag doesn't work well on mobile - consider adding touch support later)
3. **Undo:** No undo for reordering (can reload page to revert unsaved changes)

---

## Contact

For issues or questions:
- Check browser console for errors
- Check Sentry for backend errors
- Review USERTODO.md for testing checklist
