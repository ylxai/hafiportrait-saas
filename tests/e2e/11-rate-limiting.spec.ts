import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Rate Limiting', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should enforce search rate limit (30 req/min)', async ({ page }) => {
    await page.goto('/admin');
    
    // Make 31 rapid search requests
    for (let i = 0; i < 31; i++) {
      await page.fill('[data-testid="global-search"]', `query${i}`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
    }
    
    // 31st request should be rate limited
    await expect(page.locator('text=Too many requests')).toBeVisible();
  });

  test('should enforce export rate limit (10 req/min)', async ({ page }) => {
    await page.goto('/admin/events');
    
    // Make 11 rapid export requests
    for (let i = 0; i < 11; i++) {
      await page.click('[data-testid="export-csv"]');
      await page.waitForTimeout(100);
    }
    
    // 11th request should be rate limited
    await expect(page.locator('text=Too many requests')).toBeVisible();
  });

  test('should enforce bulk delete rate limit (20 req/min)', async ({ page }) => {
    await page.goto('/admin/galleries');
    await page.click('text=Test Gallery');
    
    // Make 21 rapid bulk delete requests
    for (let i = 0; i < 21; i++) {
      await page.locator('[data-testid="photo-checkbox"]').first().check();
      await page.click('[data-testid="bulk-delete"]');
      await page.click('text=Confirm');
      await page.waitForTimeout(100);
    }
    
    // 21st request should be rate limited
    await expect(page.locator('text=Too many requests')).toBeVisible();
  });

  test('should reset rate limit after window expires', async ({ page }) => {
    await page.goto('/admin');
    
    // Make 30 requests
    for (let i = 0; i < 30; i++) {
      await page.fill('[data-testid="global-search"]', `query${i}`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
    }
    
    // Wait for rate limit window to expire (60 seconds)
    await page.waitForTimeout(61000);
    
    // Should be able to search again
    await page.fill('[data-testid="global-search"]', 'new query');
    await page.keyboard.press('Enter');
    
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
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
      await page.fill('[data-testid="global-search"]', `query${i}`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
    }
    
    expect(statusCode).toBe(429);
  });
});
