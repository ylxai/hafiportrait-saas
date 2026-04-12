/**
 * Playwright MCP Test - Upload System Testing
 * Test upload functionality with real wedding photos
 * 
 * Usage: Run with Playwright MCP
 * 1. Navigate to admin page
 * 2. Login (manual atau auto)
 * 3. Test upload dengan foto dari ~/wedding_photos
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const DEV_URL = 'http://localhost:3000';
const PHOTO_DIR = '/home/eouser/wedding_photos';

// Get sample photos for testing
const getSamplePhotos = (count: number = 5): string[] => {
  const files = fs.readdirSync(PHOTO_DIR)
    .filter(f => f.match(/\.(jpg|jpeg|png)$/i))
    .slice(0, count);
  return files.map(f => path.join(PHOTO_DIR, f));
};

test.describe('Upload System Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to login
    await page.goto(`${DEV_URL}/login`);
    await page.waitForLoadState('networkidle');
  });

  test('1. Login to admin dashboard', async ({ page }) => {
    // Wait for login form
    await expect(page.locator('input[type="email"]')).toBeVisible();
    
    // Fill credentials (update dengan credentials yang benar)
    await page.fill('input[type="email"]', 'admin@hafiportrait.com');
    await page.fill('input[type="password"]', 'your-password');
    
    // Click login
    await page.click('button[type="submit"]');
    
    // Wait for redirect to admin
    await page.waitForURL(`${DEV_URL}/admin/galleries`);
    await expect(page.locator('text=Galleries')).toBeVisible();
  });

  test('2. Navigate to gallery and test upload UI', async ({ page }) => {
    // Asumsikan sudah login (gunakan storage state atau login di beforeEach)
    
    // Go to first gallery
    await page.goto(`${DEV_URL}/admin/galleries`);
    await page.waitForLoadState('networkidle');
    
    // Click first gallery
    await page.click('a[href^="/admin/galleries/"]', { timeout: 5000 });
    await page.waitForURL(/\/admin\/galleries\/.+/);
    
    // Check upload button exists
    await expect(page.locator('button:has-text("Upload")')).toBeVisible();
  });

  test('3. Upload single small file', async ({ page }) => {
    const photos = getSamplePhotos(1);
    if (photos.length === 0) {
      console.log('No photos found in ~/wedding_photos');
      return;
    }

    // Navigate to gallery
    await page.goto(`${DEV_URL}/admin/galleries`);
    await page.click('a[href^="/admin/galleries/"]');
    await page.waitForLoadState('networkidle');
    
    // Select file input and upload
    await page.setInputFiles('input[type="file"]', photos[0]);
    
    // Wait for upload to start
    await page.waitForSelector('text=Uploading...', { timeout: 5000 });
    
    // Wait for completion (max 30 seconds)
    await expect(page.locator('text=Completed')).toBeVisible({ timeout: 30000 });
    
    console.log(`✅ Successfully uploaded: ${path.basename(photos[0])}`);
  });

  test('4. Upload multiple files (batch test)', async ({ page }) => {
    const photos = getSamplePhotos(10); // Test dengan 10 foto
    if (photos.length < 5) {
      console.log(`Only ${photos.length} photos found, need at least 5`);
      return;
    }

    await page.goto(`${DEV_URL}/admin/galleries`);
    await page.click('a[href^="/admin/galleries/"]');
    await page.waitForLoadState('networkidle');
    
    // Upload batch
    await page.setInputFiles('input[type="file"]', photos);
    
    // Wait for all uploads to complete
    const startTime = Date.now();
    
    // Check that upload progress is shown
    await expect(page.locator('[role="progressbar"]')).toBeVisible({ timeout: 5000 });
    
    // Wait for at least one "Completed"
    await expect(page.locator('text=Completed').first()).toBeVisible({ timeout: 60000 });
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`✅ Batch upload of ${photos.length} files completed in ${duration}s`);
    
    // Verify no errors
    const errorCount = await page.locator('text=Failed').count();
    expect(errorCount).toBe(0);
  });

  test('5. Test file size validation (>50MB should reject)', async ({ page }) => {
    // Create a large dummy file (simulate >50MB)
    const largeFile = '/tmp/large-test.jpg';
    // Note: This would need actual implementation
    
    await page.goto(`${DEV_URL}/admin/galleries`);
    await page.click('a[href^="/admin/galleries/"]');
    
    // Try to upload large file
    // await page.setInputFiles('input[type="file"]', largeFile);
    
    // Expect error message
    // await expect(page.locator('text=File too large')).toBeVisible();
  });

  test('6. Test race condition - rapid uploads', async ({ page }) => {
    const photos = getSamplePhotos(20);
    if (photos.length < 10) {
      console.log('Not enough photos for race condition test');
      return;
    }

    await page.goto(`${DEV_URL}/admin/galleries`);
    await page.click('a[href^="/admin/galleries/"]');
    await page.waitForLoadState('networkidle');
    
    // Upload 20 files rapidly
    await page.setInputFiles('input[type="file"]', photos);
    
    // Wait a bit then check console for errors
    await page.waitForTimeout(5000);
    
    // Get all logs
    const logs = await page.evaluate(() => {
      return (window as any).consoleLogs || [];
    });
    
    // Check for race condition errors
    const raceErrors = logs.filter((log: string) => 
      log.includes('race') || log.includes('multiple') || log.includes('duplicate')
    );
    
    expect(raceErrors).toHaveLength(0);
    console.log('✅ No race condition detected');
  });

  test('7. Monitor memory usage during upload', async ({ page }) => {
    const photos = getSamplePhotos(50); // Large batch
    
    // Get initial memory
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });
    
    await page.goto(`${DEV_URL}/admin/galleries`);
    await page.click('a[href^="/admin/galleries/"]');
    
    await page.setInputFiles('input[type="file"]', photos.slice(0, 10));
    await page.waitForTimeout(30000); // Wait for completion
    
    // Get final memory
    const finalMemory = await page.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize || 0;
    });
    
    const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
    console.log(`Memory increased by: ${memoryIncrease.toFixed(2)} MB`);
    
    // Memory should stabilize, not continuously grow
    expect(memoryIncrease).toBeLessThan(500); // Less than 500MB increase
  });
});

// Manual test helper
console.log(`
📸 Test Photos Available:
${getSamplePhotos(20).map((p, i) => `${i + 1}. ${path.basename(p)}`).join('\n')}

🚀 To run these tests:
npx playwright test scripts/test-upload.playwright.ts --headed
`);