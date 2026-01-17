# Phase 4 Testing Guide

This document outlines how to test the Phase 4 frontend integration features.

## Prerequisites

1. **API Running**: The producer-producer-api must be running locally or deployed
2. **Test User**: You need an email address you can access to receive magic links

## Local Testing Setup

### 1. Start the API

```bash
cd ../producer-producer-api
docker compose up -d
# OR
uvicorn fly_app.main:app --reload
```

Verify API is running:
```bash
curl http://localhost:8000/health
```

### 2. Start the Frontend

```bash
cd ../producer-producer
python3 -m http.server 8080
```

Open `http://localhost:8080` in your browser.

## Test Scenarios

### Test 1: Initial State (Not Logged In)

**Expected behavior:**
- ✅ Login window is visible and centered
- ✅ User greeting is hidden
- ✅ Settings and logout buttons are hidden
- ✅ Opportunities window shows placeholder jobs with login prompt

### Test 2: Magic Link Login Flow

**Steps:**
1. Enter your email in the login window
2. Click "Send Magic Link"
3. Check your email for the magic link (check console logs in dev mode)
4. Click the magic link or manually navigate to the URL with token

**Expected behavior:**
- ✅ Email sends successfully (success message appears in speech bubble)
- ✅ Magic link email received (or see console output in dev)
- ✅ Clicking link redirects to site with token in URL
- ✅ Token is automatically verified
- ✅ Login window disappears
- ✅ User greeting appears with your name/email
- ✅ Settings and logout buttons appear
- ✅ Token is stored in localStorage (`pp_auth_token`)
- ✅ User data is stored in localStorage (`pp_user_data`)

### Test 3: Opportunities Display

**After logging in:**

**Expected behavior:**
- ✅ Opportunities window loads personalized jobs from API
- ✅ Jobs are sorted by score (highest first)
- ✅ Each job shows: title, company, location, salary, date, score
- ✅ Top-scored job has a star icon
- ✅ Each job has action buttons: Save, Ignore, Applied, Apply ↗
- ✅ Apply link opens in new tab (if available)

**If no jobs:**
- ✅ Empty state message appears

### Test 4: Job Actions

**Steps:**
1. Click "Save" on a job
2. Click "Ignore" on another job
3. Click "Applied" on a third job

**Expected behavior:**
- ✅ Loading indicator appears during action
- ✅ Success message appears for each action
- ✅ "Ignored" and "Applied" jobs disappear from list
- ✅ "Saved" job remains visible

### Test 5: Settings Modal

**Steps:**
1. Click the "⚙️ Settings" button
2. Settings window appears with current user config
3. Modify settings:
   - Add locations (e.g., "New York, San Francisco, Remote")
   - Set minimum salary (e.g., 100000)
   - Add include keywords (e.g., "producer, director")
   - Add exclude keywords (e.g., "intern, assistant")
   - Change digest threshold (e.g., 70)
   - Toggle digest enabled
4. Click "Save Changes"

**Expected behavior:**
- ✅ Settings window opens and comes to front
- ✅ Form is populated with current settings
- ✅ All fields can be edited
- ✅ Save triggers loading indicator
- ✅ Success message appears
- ✅ Settings window closes
- ✅ Opportunities reload with new filters
- ✅ Config is saved in API (verify with browser network tab)

### Test 6: Logout

**Steps:**
1. Click "Logout" button
2. Confirm page reloads

**Expected behavior:**
- ✅ Token and user data cleared from localStorage
- ✅ Page reloads
- ✅ Back to initial state (login window visible)
- ✅ Opportunities show placeholder jobs

### Test 7: Session Persistence

**Steps:**
1. Log in successfully
2. Close browser tab
3. Reopen `http://localhost:8080`

**Expected behavior:**
- ✅ Still logged in (token persists)
- ✅ User greeting visible
- ✅ Opportunities load automatically

### Test 8: Token Expiration

**Steps:**
1. Log in successfully
2. Manually delete the JWT token from localStorage
3. Try to load opportunities (refresh page)

**Expected behavior:**
- ✅ API returns 401 Unauthorized
- ✅ User is automatically logged out
- ✅ Login window appears
- ✅ Error message shown

### Test 9: Error Handling

**Steps:**
1. Stop the API server
2. Try to log in
3. Try to load opportunities

**Expected behavior:**
- ✅ Network error message appears
- ✅ No console errors crash the app
- ✅ UI remains functional

### Test 10: Responsive Design

**Steps:**
1. Resize browser window to mobile width (<768px)
2. Test all features

**Expected behavior:**
- ✅ Login window adapts to screen size
- ✅ Settings window adapts to screen size
- ✅ Opportunities window readable on mobile
- ✅ Decorative elements hidden on mobile

## API Endpoints to Test

You can verify API calls in browser DevTools > Network tab:

- `POST /auth/magic-link` - Send login email
- `GET /auth/verify?token=...` - Verify magic link
- `GET /auth/me` - Get current user
- `GET /users/me/config` - Get user config
- `PUT /users/me/config` - Update user config
- `GET /opportunities/for-me` - Get personalized opportunities
- `PUT /users/me/opportunities/{id}` - Update opportunity status

## Known Issues / Future Enhancements

- [ ] Similar-user boost not yet implemented (deferred to later phase)
- [ ] AI analysis integration pending
- [ ] Email digest functionality not yet built (Phase 5)
- [ ] No "To Do" list view (shows only new opportunities)
- [ ] No pagination (loads max 20 opportunities)

## Troubleshooting

### Login doesn't work
- Check API is running: `curl http://localhost:8000/health`
- Check CORS is configured for `http://localhost:3000` in API
- Check browser console for errors
- Verify email service is configured (check API logs)

### Opportunities don't load
- Check authentication token in localStorage
- Check API endpoint returns data: `curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/opportunities/for-me`
- Check browser console for errors
- Verify user has config set (check `/users/me/config`)

### Settings don't save
- Check authentication token is valid
- Check API endpoint accepts PUT: `curl -X PUT -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" -d '{"locations":["New York"]}' http://localhost:8000/users/me/config`
- Check browser network tab for API response

## Success Criteria

All 10 test scenarios should pass. The frontend should:
- ✅ Authenticate users via magic link
- ✅ Load personalized opportunities from API
- ✅ Allow users to manage job status (save/ignore/applied)
- ✅ Allow users to configure filter preferences
- ✅ Handle errors gracefully
- ✅ Persist sessions across page reloads
- ✅ Maintain retro desktop aesthetic
