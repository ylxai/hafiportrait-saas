import { test, expect } from '@playwright/test';

test.describe('Public Gallery Access', () => {
  const VALID_TOKEN = 'test-gallery-token-123';
  const INVALID_TOKEN = 'invalid-token-xyz';

  test('should access gallery with valid token', async ({ page }) => {
    await page.goto(`/gallery/${VALID_TOKEN}`);
    
    await expect(page.locator('h1')).toContainText('Gallery');
    await expect(page.locator('[data-testid="photo-grid"]')).toBeVisible();
  });

  test('should show 404 for invalid token', async ({ page }) => {
    await page.goto(`/gallery/${INVALID_TOKEN}`);
    
    await expect(page.locator('text=Gallery not found')).toBeVisible();
  });

  test('should select and deselect photos', async ({ page }) => {
    await page.goto(`/gallery/${VALID_TOKEN}`);
    
    // Select photo
    const firstPhoto = page.locator('[data-testid="photo-item"]').first();
    await firstPhoto.click();
    await expect(firstPhoto).toHaveClass(/selected/);
    
    // Deselect photo
    await firstPhoto.click();
    await expect(firstPhoto).not.toHaveClass(/selected/);
  });

  test('should submit photo selection', async ({ page }) => {
    await page.goto(`/gallery/${VALID_TOKEN}`);
    
    // Select multiple photos
    await page.locator('[data-testid="photo-item"]').first().click();
    await page.locator('[data-testid="photo-item"]').nth(1).click();
    
    // Submit selection
    await page.click('text=Submit Selection');
    await page.click('text=Confirm');
    
    await expect(page.locator('text=Selection submitted')).toBeVisible();
  });

  test('should download selected photos', async ({ page }) => {
    await page.goto(`/gallery/${VALID_TOKEN}`);
    
    // Select photos
    await page.locator('[data-testid="photo-item"]').first().click();
    
    // Download
    const downloadPromise = page.waitForEvent('download');
    await page.click('text=Download Selected');
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toContain('.zip');
  });

  test('should show locked message for locked gallery', async ({ page }) => {
    await page.goto(`/gallery/${VALID_TOKEN}`);
    
    // Assuming gallery is locked
    await expect(page.locator('text=This gallery is locked')).toBeVisible();
    await expect(page.locator('[data-testid="photo-item"]')).not.toBeVisible();
  });

  test('should view photo in lightbox', async ({ page }) => {
    await page.goto(`/gallery/${VALID_TOKEN}`);
    
    await page.locator('[data-testid="photo-item"]').first().click();
    
    await expect(page.locator('[data-testid="lightbox"]')).toBeVisible();
    
    // Close lightbox
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="lightbox"]')).not.toBeVisible();
  });
});
