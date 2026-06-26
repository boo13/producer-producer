// Run with: playwright-cli run-code --filename tests/launch-readiness.browser.js
async (page) => {
    const jobs = [
        {
            id: 1,
            title: 'Podcast Producer',
            company_name: 'Audio House',
            score: 94,
            url: 'https://example.com/jobs/1',
            description: 'Audio House makes award-winning shows for curious listeners.',
            ai_summary: 'BOOK daily guests\nCUT narrative audio segments\nREPORTS TO Executive Producer',
            media_category: 'podcast',
            salary_raw: 'Salary not listed',
            city: 'Brooklyn',
            state: 'NY',
            first_seen: new Date().toISOString(),
        },
        {
            id: 2,
            title: 'News Video Producer',
            company_name: 'Newsroom One',
            score: 88,
            url: 'https://example.com/jobs/2',
            description: 'Produce breaking news video segments for digital channels.',
            media_category: 'news',
            salary_raw: 'Salary not listed',
            city: 'New York',
            state: 'NY',
            first_seen: new Date().toISOString(),
        },
        {
            id: 3,
            title: 'Social Producer',
            company_name: 'Studio Three',
            score: 82,
            url: 'https://example.com/jobs/3',
            description: 'Create social video packages for Instagram and TikTok.',
            media_category: 'social',
            salary_raw: 'Salary not listed',
            city: 'Remote',
            first_seen: new Date().toISOString(),
        },
        {
            id: 4,
            title: 'Senior Director, End User Support',
            company_name: 'Systems Desk',
            score: 91,
            url: 'https://example.com/jobs/4',
            description: 'Lead digital support for newsroom social tools and internal news systems.',
            media_category: 'other',
            salary_raw: 'Salary not listed',
            city: 'New York',
            state: 'NY',
            first_seen: new Date().toISOString(),
        },
    ];
    const magicLinkRequests = [];

    const assert = (condition, message) => {
        if (!condition) throw new Error(message);
    };
    const queryParam = (name) => page.evaluate((param) => new URL(location.href).searchParams.get(param), name);
    const hasQueryParam = (name) => page.evaluate((param) => new URL(location.href).searchParams.has(param), name);

    await page.route('**/*', async (route) => {
        const request = route.request();
        const parsed = request.url().match(/^https?:\/\/([^/]+)(\/[^?]*)?/);
        const hostname = parsed?.[1] || '';
        const path = parsed?.[2] || '/';
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
                opportunities_added_24h: 2,
                opportunities_added_7d: 3,
            });
        }
        if (path === '/opportunities/feed') return json(jobs);
        if (path === '/auth/magic-link' && request.method() === 'POST') {
            magicLinkRequests.push(request.postDataJSON());
            return json({});
        }
        return json({ detail: `Unhandled ${request.method()} ${path}` }, 500);
    });

    await page.setViewportSize({ width: 1180, height: 900 });
    await page.goto('http://localhost:8080/?min_score=82&category=podcast');
    await page.waitForSelector('.pp-card-wrap');

    const meta = await page.evaluate(() => ({
        description: document.querySelector('meta[name="description"]')?.content || '',
        ogCount: document.querySelectorAll('meta[property^="og:"]').length,
        twitterCount: document.querySelectorAll('meta[name^="twitter:"]').length,
        favicon: document.querySelector('link[rel="icon"]')?.getAttribute('href') || '',
        manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') || '',
    }));
    assert(meta.description.includes('curated board'), 'Missing meta description');
    assert(meta.ogCount >= 6, 'Missing Open Graph metadata');
    assert(meta.twitterCount >= 3, 'Missing Twitter metadata');
    assert(meta.favicon === '/favicon.ico', 'Missing favicon link');
    assert(meta.manifest === '/manifest.json', 'Missing manifest link');

    await page.waitForFunction(() => document.querySelector('[data-category="podcast"]')?.classList.contains('is-active'));
    assert(await queryParam('category') === 'podcast', 'Initial category query not preserved');

    await page.click('[data-category="news"]');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('category') === 'news');
    await page.waitForFunction(() => document.querySelector('#company-list')?.textContent?.includes('News Video Producer'));
    assert(!await page.locator('#company-list').textContent().then((text) => text.includes('Senior Director')), 'Unrelated IT role appeared under News');
    await page.click('[data-category="social"]');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('category') === 'social');
    await page.waitForFunction(() => document.querySelector('#company-list')?.textContent?.includes('Social Producer'));
    assert(!await page.locator('#company-list').textContent().then((text) => text.includes('Senior Director')), 'Unrelated IT role appeared under Social');
    await page.click('[data-category="all"]');
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('category'));
    assert(!await hasQueryParam('category'), 'All category did not clear category query');

    await page.click('[data-opportunity-id="1"] .pp-card');
    await page.waitForFunction(() => document.querySelector('[data-opportunity-id="1"]')?.textContent?.includes('BOOK daily guests'));
    const firstCardText = await page.locator('[data-opportunity-id="1"]').textContent();
    assert(!firstCardText.includes('award-winning shows'), 'Expanded card used generic company boilerplate instead of role summary');

    await page.fill('#newsletter-email', 'notanemail');
    await page.click('#newsletter-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('#newsletter-status')?.textContent?.includes('valid email'));
    assert(magicLinkRequests.length === 0, 'Invalid newsletter email called API');

    await page.click('#sign-in-btn');
    await page.fill('#auth-email', 'notanemail');
    await page.click('#auth-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('#auth-status')?.textContent?.includes('valid email'));
    assert(magicLinkRequests.length === 0, 'Invalid auth email called API');
    await page.click('#auth-dialog-close');

    await page.focus('#min-score');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.activeElement?.id === 'min-score');
    const focusedScore = await page.$eval('#min-score', (el) => Number(el.value));
    assert(focusedScore < 82, 'Keyboard did not move score slider');

    const sliderBox = await page.locator('#min-score').boundingBox();
    assert(sliderBox, 'Slider box missing');
    await page.mouse.click(sliderBox.x + sliderBox.width * 0.35, sliderBox.y + sliderBox.height / 2);
    await page.waitForFunction(() => {
        const value = Number(document.querySelector('#min-score')?.value);
        return value >= 30 && value <= 40;
    });

    await page.click('[data-status="saved"]');
    await page.waitForFunction(() => document.querySelector('.empty-state')?.textContent?.includes('Saved jobs require sign in'));

    await page.click('[data-status="all"]');
    await page.waitForSelector('#company-list .pp-card-wrap');
    await page.setViewportSize({ width: 390, height: 820 });
    await page.waitForFunction(() => document.querySelectorAll('#m-feed .pp-card-wrap').length > 0);
    await page.waitForFunction(() => document.querySelectorAll('#company-list .pp-card-wrap').length === 0);
    await page.setViewportSize({ width: 1180, height: 900 });
    await page.waitForFunction(() => document.querySelectorAll('#company-list .pp-card-wrap').length > 0);
    await page.waitForFunction(() => document.querySelector('#m-feed')?.children.length === 0);
}
