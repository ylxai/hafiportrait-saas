import { test, expect } from '@playwright/test';
import { login, waitForToast } from './helpers';

test.describe('Bulk Operations', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should bulk select photos', async ({ page }) => {
    await page.goto('/admin/galleries');
    await page.click('text=Test Gallery');
    
    // Select all photos
    await page.click('[data-testid="select-all"]');
    
    const selectedCount = await page.locator('[data-testid="selected-count"]').textContent();
    expect(parseInt(selectedCount || '0')).toBeGreaterThan(0);
  });

  test('should bulk delete photos', async ({ page }) => {
    await page.goto('/admin/galleries');
    await page.click('text=Test Gallery');
    
    // Select multiple photos
    await page.locator('[data-testid="photo-checkbox"]').first().check();
    await page.locator('[data-testid="photo-checkbox"]').nth(1).check();
    
    // Delete selected
    await page.click('[data-testid="bulk-delete"]');
    await page.click('text=Confirm');
    
    await waitForToast(page, 'Photos deleted');
  });

  test('should bulk delete events', async ({ page }) => {
    await page.goto('/admin/events');
    
    // Select multiple events
    await page.locator('[data-testid="event-checkbox"]').first().check();
    await page.locator('[data-testid="event-checkbox"]').nth(1).check();
    
    // Delete selected
    await page.click('[data-testid="bulk-delete"]');
    await page.click('text=Confirm');
    
    await waitForToast(page, 'Events deleted');
  });

  test('should bulk delete clients', async ({ page }) => {
    await page.goto('/admin/clients');
    
    // Select multiple clients
    await page.locator('[data-testid="client-checkbox"]').first().check();
    await page.locator('[data-testid="client-checkbox"]').nth(1).check();
    
    // Delete selected
    await page.click('[data-testid="bulk-delete"]');
    await page.click('text=Confirm');
    
    await waitForToast(page, 'Clients deleted');
  });

  test('should deselect all after bulk action', async ({ page }) => {
    await page.goto('/admin/galleries');
    await page.click('text=Test Gallery');
    
    // Select all
    await page.click('[data-testid="select-all"]');
    
    // Deselect all
    await page.click('[data-testid="deselect-all"]');
    
    const selectedCount = await page.locator('[data-testid="selected-count"]').textContent();
    expect(selectedCount).toBe('0');
  });
});
