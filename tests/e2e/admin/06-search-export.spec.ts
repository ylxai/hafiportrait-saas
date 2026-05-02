import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Search and Export', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should search across galleries', async ({ page }) => {
    await page.goto('/admin');
    
    await page.fill('[data-testid="global-search"]', 'Test Gallery');
    await page.keyboard.press('Enter');
    
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
    await expect(page.locator('text=Test Gallery')).toBeVisible();
  });

  test('should search across events', async ({ page }) => {
    await page.goto('/admin');
    
    await page.fill('[data-testid="global-search"]', 'Wedding');
    await page.keyboard.press('Enter');
    
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
  });

  test('should search across clients', async ({ page }) => {
    await page.goto('/admin');
    
    await page.fill('[data-testid="global-search"]', 'John');
    await page.keyboard.press('Enter');
    
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
  });

  test('should export events to CSV', async ({ page }) => {
    await page.goto('/admin/events');
    
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-csv"]');
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toContain('events');
    expect(download.suggestedFilename()).toContain('.csv');
  });

  test('should export clients to CSV', async ({ page }) => {
    await page.goto('/admin/clients');
    
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-csv"]');
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toContain('clients');
    expect(download.suggestedFilename()).toContain('.csv');
  });

  test('should show no results for invalid search', async ({ page }) => {
    await page.goto('/admin');
    
    await page.fill('[data-testid="global-search"]', 'NonExistentQuery123');
    await page.keyboard.press('Enter');
    
    await expect(page.locator('text=No results found')).toBeVisible();
  });

  test('should filter search results by type', async ({ page }) => {
    await page.goto('/admin');
    
    await page.fill('[data-testid="global-search"]', 'Test');
    await page.keyboard.press('Enter');
    
    // Filter by galleries only
    await page.click('[data-testid="filter-galleries"]');
    
    await expect(page.locator('[data-testid="gallery-result"]')).toBeVisible();
    await expect(page.locator('[data-testid="event-result"]')).not.toBeVisible();
  });
});
