import { test, expect } from '@playwright/test';
import { login } from '../helpers';

test.describe('Rate Limiting', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should enforce search rate limit (30 req/min)', async ({ page }) => {
    await page.goto('/admin');
    
    // Make 31 rapid search requests
    for (let i = 0; i < 31; i++) {
      await page.getByTestId('global-search').fill(`query${i}`);
      await page.keyboard.press('Enter');
    }
    
    // 31st request should be rate limited
    await expect(page.getByText('Too many requests')).toBeVisible();
  });

  test('should enforce export rate limit (10 req/min)', async ({ page }) => {
    await page.goto('/admin/events');
    
    // Make 11 rapid export requests
    for (let i = 0; i < 11; i++) {
      await page.getByTestId('export-csv').click();
    }
    
    // 11th request should be rate limited
    await expect(page.getByText('Too many requests')).toBeVisible();
  });

  test('should enforce bulk delete rate limit (20 req/min)', async ({ page }) => {
    await page.goto('/admin/galleries');
    await page.getByText('Test Gallery').click();
    
    // Make 21 rapid bulk delete requests
    for (let i = 0; i < 21; i++) {
      await page.getByTestId('photo-checkbox').first().check();
      await page.getByTestId('bulk-delete').click();
      await page.getByRole('button', { name: /confirm/i }).click();
    }
    
    // 21st request should be rate limited
    await expect(page.getByText('Too many requests')).toBeVisible();
  });

  // The "window expires" scenario relies on the SERVER-side rate-limit
  // window — Playwright's `page.clock` cannot mock that. Instead of an
  // outright `test.skip` (or the previous `waitForTimeout(61000)` that
  // violated AGENTS.md), we honour an opt-in env hook:
  //
  //   RATE_LIMIT_WINDOW_OVERRIDE_MS=2000 npm run test:e2e
  //
  // When that env var is set on the server under test, the rate limiter
  // (see `src/lib/rate-limit.ts`) shrinks every window to that value and
  // the test polls until the limit resets — no magic timeouts, no
  // 60-second CI tax. Without the override the test is skipped with a
  // clear reason so it can never quietly burn a real minute again.
  const overrideRaw = process.env.RATE_LIMIT_WINDOW_OVERRIDE_MS;
  const overrideMs = overrideRaw ? Number(overrideRaw) : NaN;
  const overrideActive = Number.isFinite(overrideMs) && overrideMs > 0 && overrideMs <= 5000;

  test('should reset rate limit after window expires', async ({ page, request }) => {
    test.skip(
      !overrideActive,
      'Requires RATE_LIMIT_WINDOW_OVERRIDE_MS<=5000 on the server under test.',
    );

    await page.goto('/admin');

    // Burn through the limit (30 req/min for SEARCH).
    for (let i = 0; i < 31; i++) {
      await page.getByTestId('global-search').fill(`query${i}`);
      await page.keyboard.press('Enter');
    }

    // Poll the search endpoint directly until the override window has rolled
    // over — uses Playwright's auto-wait via `expect.poll`, no `waitForTimeout`.
    await expect
      .poll(
        async () => {
          const res = await request.get('/api/admin/search?q=ping');
          return res.status();
        },
        {
          message: 'rate limit should reset within the override window',
          timeout: overrideMs * 4,
          intervals: [200, 500, 1000],
        },
      )
      .not.toBe(429);

    // After reset the UI search should succeed again.
    await page.getByTestId('global-search').fill('new query');
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('search-results')).toBeVisible();
  });

  test('should return 429 status code on rate limit', async ({ page }) => {
    await page.goto('/admin');
    
    // Intercept API requests
    let statusCode = 0;
    page.on('response', response => {
      if (response.url().includes('/api/admin/search')) {
        statusCode = response.status();
      }
    });
    
    // Make 31 rapid requests
    for (let i = 0; i < 31; i++) {
      await page.getByTestId('global-search').fill(`query${i}`);
      await page.keyboard.press('Enter');
    }
    
    await expect(statusCode).toBe(429);
  });
});