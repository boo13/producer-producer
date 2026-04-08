import { test, expect } from '@playwright/test';

/**
 * Regression test: saved (todo) opportunities must not reappear in the swipe
 * feed after a page reload.
 *
 * Uses Playwright route interception to mock the API so the test is
 * self-contained and doesn't require a running backend.
 */

const FAKE_TOKEN = 'fake-jwt-token';
const FAKE_USER = { id: '00000000-0000-0000-0000-000000000001', email: 'test@example.com', name: 'Test' };

const FEED_OPPORTUNITIES = [
    { id: 1, title: 'Producer, A Touch More', company_name: 'Acme', score: 90 },
    { id: 2, title: 'Senior Producer, Daily Show', company_name: 'Comedy Central', score: 85 },
    { id: 3, title: 'Director of Content', company_name: 'Netflix', score: 80 },
];

test.describe('Swipe persistence', () => {
    test('saved opportunities do not reappear in swipe feed after reload', async ({ page }) => {
        // Track which opportunity IDs the user has acted on (simulates DB state)
        const actedOn: { id: number; opportunity_id: number; status: string }[] = [];

        // --- Mock API routes ---

        await page.route('**/health', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }),
        );

        // Public feed always returns the same opportunities
        await page.route('**/opportunities/feed*', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(FEED_OPPORTUNITIES),
            }),
        );

        // GET /users/me/opportunities — returns acted-on opportunities
        await page.route('**/users/me/opportunities?*', (route) => {
            const url = new URL(route.request().url());
            const statusFilter = url.searchParams.get('status_filter');

            const filtered = statusFilter
                ? actedOn.filter((uo) => uo.status === statusFilter)
                : actedOn;

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(filtered),
            });
        });

        // Also handle the bare path without query params
        await page.route('**/users/me/opportunities', (route) => {
            if (route.request().method() === 'GET') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(actedOn),
                });
            }
            return route.continue();
        });

        // PUT /users/me/opportunities/:id — record the action
        await page.route(/\/users\/me\/opportunities\/\d+$/, (route) => {
            if (route.request().method() !== 'PUT') return route.continue();

            const url = route.request().url();
            const oppId = parseInt(url.match(/\/(\d+)$/)?.[1] || '0', 10);
            const body = route.request().postDataJSON();

            // Upsert into actedOn
            const existing = actedOn.find((uo) => uo.opportunity_id === oppId);
            if (existing) {
                existing.status = body.status;
            } else {
                actedOn.push({
                    id: actedOn.length + 1,
                    opportunity_id: oppId,
                    status: body.status,
                });
            }

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ id: actedOn.length, opportunity_id: oppId, ...body }),
            });
        });

        await page.route('**/auth/me', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_USER) }),
        );

        // --- Seed localStorage with auth so the app thinks we're logged in ---
        await page.goto('http://localhost:8080/archive/desktop/');

        await page.evaluate(
            ([token, user]) => {
                localStorage.setItem('pp_auth_token', token);
                localStorage.setItem('pp_user_data', JSON.stringify(user));
            },
            [FAKE_TOKEN, FAKE_USER],
        );

        // Reload to pick up auth state
        await page.reload();
        await page.waitForTimeout(1000);

        // --- Verify all 3 opportunities are visible ---
        const cards = page.locator('.opportunity-card');
        await expect(cards).toHaveCount(3);

        // --- Save the first opportunity (swipe right / click Save) ---
        const saveBtn = cards.first().locator('[data-action="todo"]');
        await saveBtn.click();
        await page.waitForTimeout(500);

        // Should now show 2 cards
        await expect(cards).toHaveCount(2);

        // Verify the acted-on array has our save
        expect(actedOn).toHaveLength(1);
        expect(actedOn[0].opportunity_id).toBe(1);
        expect(actedOn[0].status).toBe('todo');

        // --- Reload the page (simulates new session) ---
        await page.reload();
        await page.waitForTimeout(1000);

        // --- The saved opportunity should NOT reappear ---
        const cardsAfterReload = page.locator('.opportunity-card');
        await expect(cardsAfterReload).toHaveCount(2);

        // Verify opportunity #1 is not in the list
        const cardTexts = await cardsAfterReload.allTextContents();
        const hasRemovedOpp = cardTexts.some((text) => text.includes('A Touch More'));
        expect(hasRemovedOpp).toBe(false);
    });
});
