import { test, expect } from '@playwright/test';
import { login, generateTestData, waitForToast } from './helpers';
import path from 'path';

test.describe('Photo Upload Flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should upload photo successfully', async ({ page }) => {
    const testData = generateTestData();
    
    // Create gallery first
    await page.goto('/admin/galleries');
    await page.click('text=Create Gallery');
    await page.fill('input[name="namaProject"]', testData.galleryName);
    await page.click('button[type="submit"]');
    await waitForToast(page, 'Gallery created');
    
    // Navigate to gallery detail
    await page.click(`text=${testData.galleryName}`);
    
    // Upload photo
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/test-photo.jpg'));
    
    // Wait for upload to complete
    await waitForToast(page, 'Upload complete');
    
    // Verify photo appears in gallery
    await expect(page.locator('[data-testid="photo-item"]')).toBeVisible();
  });

  test('should reject invalid file type', async ({ page }) => {
    await page.goto('/admin/galleries');
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/invalid-file.txt'));
    
    await expect(page.locator('text=Invalid file type')).toBeVisible();
  });

  test('should update storage usage after upload', async ({ page }) => {
    await page.goto('/admin/storage');
    
    const usageBefore = await page.locator('[data-testid="storage-usage"]').textContent();
    
    // Upload photo
    await page.goto('/admin/galleries');
    await page.click('text=Test Gallery');
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/test-photo.jpg'));
    await waitForToast(page, 'Upload complete');
    
    // Check storage usage increased
    await page.goto('/admin/storage');
    const usageAfter = await page.locator('[data-testid="storage-usage"]').textContent();
    
    expect(usageAfter).not.toBe(usageBefore);
  });

  test('should handle upload failure gracefully', async ({ page }) => {
    // Mock network failure
    await page.route('**/api/admin/upload/presigned', route => route.abort());
    
    await page.goto('/admin/galleries');
    await page.click('text=Test Gallery');
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/test-photo.jpg'));
    
    await expect(page.locator('text=Upload failed')).toBeVisible();
  });
});
