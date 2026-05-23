import { test, expect } from '@playwright/test';
import { login } from './helpers';
import path from 'path';

test.describe('Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should reject invalid file type upload', async ({ page }) => {
    await page.goto('/admin/galleries');
    await page.click('text=Test Gallery');
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/invalid-file.txt'));
    
    await expect(page.locator('text=Invalid file type')).toBeVisible();
  });

  test('should reject oversized file upload', async ({ page }) => {
    await page.goto('/admin/galleries');
    await page.click('text=Test Gallery');
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/large-file.jpg'));
    
    await expect(page.locator('text=File too large')).toBeVisible();
  });

  test('should handle network failure gracefully', async ({ page }) => {
    // Simulate offline
    await page.context().setOffline(true);
    
    await page.goto('/admin/galleries');
    
    await expect(page.locator('text=Network error')).toBeVisible();
    
    // Restore connection
    await page.context().setOffline(false);
  });

  test('should handle API 404 errors', async ({ page }) => {
    await page.goto('/admin/galleries/non-existent-id');
    
    await expect(page.locator('text=Gallery not found')).toBeVisible();
  });

  test('should handle API 500 errors', async ({ page }) => {
    // Mock server error
    await page.route('**/api/admin/galleries', route => 
      route.fulfill({ status: 500, body: 'Internal Server Error' })
    );
    
    await page.goto('/admin/galleries');
    
    await expect(page.locator('text=Something went wrong')).toBeVisible();
  });

  test('should validate required form fields', async ({ page }) => {
    await page.goto('/admin/clients');
    await page.click('text=Add Client');
    
    // Submit without filling required fields
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=This field is required')).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/admin/clients');
    await page.click('text=Add Client');
    
    await page.fill('input[name="nama"]', 'Test Client');
    await page.fill('input[name="email"]', 'invalid-email');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Invalid email')).toBeVisible();
  });

  test('should validate date format', async ({ page }) => {
    await page.goto('/admin/events');
    await page.click('text=Create Event');
    
    await page.fill('input[name="namaEvent"]', 'Test Event');
    await page.fill('input[name="tanggalEvent"]', 'invalid-date');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Invalid date')).toBeVisible();
  });

  test('should handle concurrent upload conflicts', async ({ page }) => {
    await page.goto('/admin/galleries');
    await page.click('text=Test Gallery');
    
    const fileInput = page.locator('input[type="file"]');
    
    // Upload same file twice simultaneously
    await fileInput.setInputFiles([
      path.join(__dirname, '../fixtures/test-photo.jpg'),
      path.join(__dirname, '../fixtures/test-photo.jpg'),
    ]);
    
    // Should handle gracefully without crash
    await page.waitForTimeout(2000);
    await expect(page.locator('[data-testid="photo-item"]')).toBeVisible();
  });

  test('should recover from failed transaction', async ({ page }) => {
    // Mock transaction failure
    await page.route('**/api/admin/upload/complete', route => 
      route.fulfill({ status: 500, body: 'Transaction failed' })
    );
    
    await page.goto('/admin/galleries');
    await page.click('text=Test Gallery');
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/test-photo.jpg'));
    
    await expect(page.locator('text=Upload failed')).toBeVisible();
    
    // Storage should not be updated
    await page.goto('/admin/storage');
    // Verify storage usage didn't change
  });
});
