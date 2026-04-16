import { test, expect } from '@playwright/test';
import { login, generateTestData, waitForToast } from './helpers';

test.describe('Gallery Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should create gallery', async ({ page }) => {
    const testData = generateTestData();
    
    await page.goto('/admin/galleries');
    await page.click('text=Create Gallery');
    
    await page.fill('input[name="namaProject"]', testData.galleryName);
    await page.fill('textarea[name="description"]', 'Test description');
    await page.click('button[type="submit"]');
    
    await waitForToast(page, 'Gallery created');
    await expect(page.locator(`text=${testData.galleryName}`)).toBeVisible();
  });

  test('should lock and unlock gallery', async ({ page }) => {
    await page.goto('/admin/galleries');
    await page.click('text=Test Gallery');
    
    // Lock gallery
    await page.click('[data-testid="lock-gallery"]');
    await waitForToast(page, 'Gallery locked');
    await expect(page.locator('text=Locked')).toBeVisible();
    
    // Unlock gallery
    await page.click('[data-testid="unlock-gallery"]');
    await waitForToast(page, 'Gallery unlocked');
    await expect(page.locator('text=Unlocked')).toBeVisible();
  });

  test('should generate public token', async ({ page }) => {
    await page.goto('/admin/galleries');
    await page.click('text=Test Gallery');
    
    await page.click('[data-testid="generate-token"]');
    await waitForToast(page, 'Token generated');
    
    const tokenInput = page.locator('input[readonly]');
    const token = await tokenInput.inputValue();
    
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(10);
  });

  test('should delete gallery', async ({ page }) => {
    const testData = generateTestData();
    
    // Create gallery
    await page.goto('/admin/galleries');
    await page.click('text=Create Gallery');
    await page.fill('input[name="namaProject"]', testData.galleryName);
    await page.click('button[type="submit"]');
    await waitForToast(page, 'Gallery created');
    
    // Delete gallery
    await page.click(`text=${testData.galleryName}`);
    await page.click('[data-testid="delete-gallery"]');
    await page.click('text=Confirm');
    
    await waitForToast(page, 'Gallery deleted');
    await expect(page.locator(`text=${testData.galleryName}`)).not.toBeVisible();
  });

  test('should update gallery details', async ({ page }) => {
    await page.goto('/admin/galleries');
    await page.click('text=Test Gallery');
    
    await page.click('[data-testid="edit-gallery"]');
    await page.fill('input[name="namaProject"]', 'Updated Gallery Name');
    await page.click('button[type="submit"]');
    
    await waitForToast(page, 'Gallery updated');
    await expect(page.locator('text=Updated Gallery Name')).toBeVisible();
  });
});
