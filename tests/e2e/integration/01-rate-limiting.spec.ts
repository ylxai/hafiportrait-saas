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

  test('should reset rate limit after window expires', async ({ page }) => {
    await page.goto('/admin');
    
    // Make 30 requests
    for (let i = 0; i < 30; i++) {
      await page.getByTestId('global-search').fill(`query${i}`);
      await page.keyboard.press('Enter');
    }
    
    // Wait for rate limit window to expire (60 seconds)
    // Note: This test intentionally waits for rate limit reset
    await page.waitForTimeout(61000);
    
    // Should be able to search again
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