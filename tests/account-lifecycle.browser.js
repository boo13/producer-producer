// Run with: playwright-cli run-code --filename tests/account-lifecycle.browser.js
async (page) => {
    const users = new Map();
    const pending = new Map();
    const actions = new Map();
    const jobs = [
        {
            id: 1,
            title: 'Senior Producer',
            company_name: 'Newsroom One',
            score: 95,
            url: 'https://example.com/jobs/1',
            description: 'Lead daily video production and editorial planning.',
            city: 'New York',
            state: 'NY',
            first_seen: new Date().toISOString(),
        },
        {
            id: 2,
            title: 'Podcast Producer',
            company_name: 'Audio House',
            score: 90,
            url: 'https://example.com/jobs/2',
            description: 'Produce narrative audio series and manage recordings.',
            city: 'Brooklyn',
            state: 'NY',
            first_seen: new Date().toISOString(),
        },
        {
            id: 3,
            title: 'Video Producer',
            company_name: 'Studio Three',
            score: 85,
            url: 'https://example.com/jobs/3',
            description: 'Create original video projects from pitch through delivery.',
            city: 'Remote',
            first_seen: new Date().toISOString(),
        },
    ];

    const requireUser = (request) => {
        const header = request.headers().authorization || '';
        const email = header.replace(/^Bearer /, '').replace(/-token$/, '');
        if (!email) throw new Error(`Missing auth for ${request.url()}`);
        return users.get(email);
    };

    const getUser = (email) => {
        if (!users.has(email)) {
            users.set(email, {
                id: `user-${users.size + 1}`,
                email,
                name: email.split('@')[0],
                config: null,
            });
            actions.set(email, new Map());
        }
        return users.get(email);
    };

    await page.route('**/*', async (route) => {
        const request = route.request();
        const requestUrl = request.url();
        const parsed = requestUrl.match(/^https?:\/\/([^/]+)(\/[^?]*)?(?:\?(.*))?$/);
        const hostname = parsed?.[1] || '';
        const path = parsed?.[2] || '/';
        const query = parsed?.[3] || '';
        const queryParam = (name) => {
            const match = query.match(new RegExp(`(?:^|&)${name}=([^&]*)`));
            return match ? decodeURIComponent(match[1]) : null;
        };
        if (!['producer-producer-api.fly.dev', 'api.producer-producer.com'].includes(hostname)) {
            return route.continue();
        }

        const json = (body, status = 200) => route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(body),
        });

        if (path === '/health') return json({ status: 'ok' });
        if (path === '/stats') {
            return json({
                active_opportunities: 3,
                active_companies: 3,
                opportunities_added_24h: 3,
                opportunities_added_7d: 3,
            });
        }
        if (path === '/opportunities/feed') return json(jobs);

        if (path === '/auth/magic-link' && request.method() === 'POST') {
            const body = request.postDataJSON();
            pending.set(body.email, Boolean(body.digest_opt_in));
            return json({});
        }
        if (path === '/auth/verify-code' && request.method() === 'POST') {
            const body = request.postDataJSON();
            const user = getUser(body.email);
            if (pending.get(body.email)) {
                user.config = {
                    id: users.size,
                    user_id: user.id,
                    version: 1,
                    digest_threshold: 60,
                    digest_enabled: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    unsubscribe_token: `unsubscribe-${body.email}`,
                };
            }
            return json({
                access_token: `${body.email}-token`,
                token_type: 'bearer',
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    created_at: new Date().toISOString(),
                },
            });
        }
        if (path === '/auth/logout' && request.method() === 'POST') return json({ message: 'ok' });
        if (path === '/auth/me') {
            const user = requireUser(request);
            return json({ id: user.id, email: user.email, name: user.name, created_at: new Date().toISOString() });
        }

        if (path === '/users/me/config' && request.method() === 'GET') {
            const user = requireUser(request);
            if (!user.config) {
                user.config = {
                    id: users.size,
                    user_id: user.id,
                    version: 1,
                    digest_threshold: 60,
                    digest_enabled: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
            }
            return json(user.config);
        }
        if (path === '/users/me/config' && request.method() === 'PUT') {
            const user = requireUser(request);
            const body = request.postDataJSON();
            user.config = {
                ...user.config,
                digest_enabled: body.digest_enabled,
                version: user.config.version + 1,
                updated_at: new Date().toISOString(),
                unsubscribe_token: user.config.unsubscribe_token || `unsubscribe-${user.email}`,
            };
            return json(user.config);
        }
        if (path === '/users/me/opportunities' && request.method() === 'GET') {
            const user = requireUser(request);
            const statusFilter = queryParam('status_filter');
            const records = [...actions.get(user.email).entries()]
                .filter(([, status]) => !statusFilter || status === statusFilter)
                .map(([id, status], index) => ({
                    id: index + 1,
                    opportunity_id: id,
                    status,
                    score: jobs.find((job) => job.id === id).score,
                    opportunity: jobs.find((job) => job.id === id),
                }));
            return json(records);
        }
        if (/^\/users\/me\/opportunities\/\d+$/.test(path) && request.method() === 'PUT') {
            const user = requireUser(request);
            const id = Number(path.split('/').pop());
            const body = request.postDataJSON();
            actions.get(user.email).set(id, body.status);
            return json({
                id,
                opportunity_id: id,
                status: body.status,
                score: body.score,
                opportunity: jobs.find((job) => job.id === id),
            });
        }
        if (path === '/users/digest/unsubscribe' && request.method() === 'POST') {
            const token = queryParam('token');
            const user = [...users.values()].find(
                (candidate) => candidate.config?.unsubscribe_token === token,
            );
            if (!user) return json({ detail: 'invalid' }, 404);
            user.config.digest_enabled = false;
            user.config.version += 1;
            return json({ digest_enabled: false });
        }

        return json({ detail: `Unhandled ${request.method()} ${path}` }, 500);
    });

    const expectText = async (selector, text) => {
        await page.waitForFunction(
            ({ selector, text }) => document.querySelector(selector)?.textContent?.includes(text),
            { selector, text },
        );
    };

    const signIn = async (email, mobile = false) => {
        await page.click(mobile ? '#m-sign-in-btn' : '#sign-in-btn');
        await page.fill('#auth-email', email);
        await page.click('#auth-form button[type="submit"]');
        await page.fill('#auth-otp-input', '123456');
        await page.click('#auth-otp-submit');
        await page.waitForFunction(() => localStorage.getItem('pp_auth_token'));
    };

    await page.goto('http://localhost:8080/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await signIn('desktop@example.com');
    await expectText('#digest-preferences-copy', 'not subscribed');

    await page.click('[data-opportunity-id="1"] .pp-card');
    await page.click('[data-opportunity-id="1"] .pp-action-save');
    await page.click('[data-opportunity-id="2"] .pp-card');
    await page.click('[data-opportunity-id="2"] .pp-action-apply');
    await page.click('[data-opportunity-id="3"] .pp-card');
    await page.click('[data-opportunity-id="3"] .pp-action-pass');
    await page.waitForFunction(() => document.querySelectorAll('#company-list .pp-card-wrap').length === 2);

    await page.click('#status-chips [data-status="saved"]');
    await page.waitForFunction(() => document.querySelectorAll('#company-list .pp-card-wrap').length === 1);
    await expectText('#company-list', 'Senior Producer');
    await page.click('#status-chips [data-status="applied"]');
    await page.waitForFunction(() => document.querySelectorAll('#company-list .pp-card-wrap').length === 1);
    await expectText('#company-list', 'Podcast Producer');

    await page.reload();
    await expectText('#user-greeting', 'desktop@example.com');
    await page.click('#status-chips [data-status="saved"]');
    await expectText('#company-list', 'Senior Producer');
    await page.click('#sign-out-btn');
    await page.waitForFunction(() => !localStorage.getItem('pp_auth_token'));
    await page.waitForSelector('#sign-in-btn:not(.is-hidden)');

    await page.fill('#newsletter-email', 'subscriber@example.com');
    await page.click('#newsletter-form button[type="submit"]');
    await page.fill('#otp-input', '123456');
    await page.click('#otp-submit');
    await expectText('#digest-preferences-copy', 'subscribed to new-listing');
    const subscriber = users.get('subscriber@example.com');
    if (!subscriber.config?.digest_enabled) throw new Error('Newsletter verification did not opt in');

    await page.goto(`http://localhost:8080/unsubscribe/?token=${subscriber.config.unsubscribe_token}`);
    await page.click('#unsubscribe-btn');
    await expectText('#unsubscribe-status', 'Unsubscribed successfully');
    if (subscriber.config.digest_enabled) throw new Error('Unsubscribe did not disable digest');

    await page.goto('http://localhost:8080/');
    await page.evaluate(() => localStorage.clear());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await signIn('mobile@example.com', true);
    await expectText('#m-digest-btn', 'Digest off');

    const saveCard = page.locator('[data-opportunity-id="1"] .pp-card');
    const saveBox = await saveCard.boundingBox();
    await page.mouse.move(saveBox.x + saveBox.width / 2, saveBox.y + saveBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(saveBox.x + saveBox.width / 2 + 130, saveBox.y + saveBox.height / 2);
    await page.mouse.up();
    await page.waitForTimeout(700);

    const passCard = page.locator('[data-opportunity-id="2"] .pp-card');
    const passBox = await passCard.boundingBox();
    await page.mouse.move(passBox.x + passBox.width / 2, passBox.y + passBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(passBox.x + passBox.width / 2 - 130, passBox.y + passBox.height / 2);
    await page.mouse.up();
    await page.waitForTimeout(700);

    await page.click('[data-opportunity-id="3"] .pp-card');
    await page.click('[data-opportunity-id="3"] .pp-read-btn');
    await page.waitForSelector('.m-overlay.is-visible');
    await page.click('.m-overlay-applied');
    await page.waitForFunction(() => document.querySelector('.m-overlay-applied')?.textContent?.includes('Applied'));
    await page.click('.m-overlay-back');
    await page.waitForTimeout(600);

    const mobileActions = actions.get('mobile@example.com');
    if (mobileActions.get(1) !== 'todo') throw new Error('Mobile save did not persist');
    if (mobileActions.get(2) !== 'ignored') throw new Error('Mobile pass did not persist');
    if (mobileActions.get(3) !== 'applied') throw new Error('Mobile applied did not persist');

    await page.reload();
    await expectText('#m-saved-ct', '1 saved');
    await expectText('#m-passed-ct', '1 passed');
    await page.click('[data-mobile-status="true"][data-status="saved"]');
    await expectText('#m-feed', 'Senior Producer');
    await page.click('[data-mobile-status="true"][data-status="applied"]');
    await expectText('#m-feed', 'Video Producer');
    await page.click('#m-account-btn');
    await page.waitForFunction(() => !localStorage.getItem('pp_auth_token'));
    await page.waitForSelector('#m-sign-in-btn:not(.is-hidden)');

    const errors = await page.evaluate(() => window.__browserErrors || []);
    return {
        desktopActions: Object.fromEntries(actions.get('desktop@example.com')),
        mobileActions: Object.fromEntries(mobileActions),
        subscriberDigestEnabled: subscriber.config.digest_enabled,
        consoleErrors: errors,
    };
}
