import { test, expect } from '@playwright/test';

test.describe('Security and Authorization', () => {
  test('should block unauthenticated access to admin routes', async ({ page }) => {
    const adminRoutes = [
      '/admin',
      '/admin/galleries',
      '/admin/events',
      '/admin/clients',
      '/admin/packages',
      '/admin/storage',
      '/admin/finance',
      '/admin/analytics',
    ];
    
    for (const route of adminRoutes) {
      await page.goto(route);
      await page.waitForURL('/login');
      expect(page.url()).toContain('/login');
    }
  });

  test('should block unauthenticated API requests', async ({ page }) => {
    const response = await page.request.get('/api/admin/galleries');
    expect(response.status()).toBe(401);
  });

  test('should allow public gallery access without auth', async ({ page }) => {
    await page.goto('/gallery/test-token-123');
    
    // Should not redirect to login
    expect(page.url()).toContain('/gallery/');
    expect(page.url()).not.toContain('/login');
  });

  test('should allow public booking access without auth', async ({ page }) => {
    await page.goto('/booking');
    
    expect(page.url()).toContain('/booking');
    expect(page.url()).not.toContain('/login');
  });

  test('should validate gallery token', async ({ page }) => {
    await page.goto('/gallery/invalid-token-xyz');
    
    await expect(page.locator('text=Gallery not found')).toBeVisible();
  });

  test('should prevent XSS in search input', async ({ page, context }) => {
    await context.addInitScript(() => {
      window.xssTriggered = false;
      window.alert = () => { window.xssTriggered = true; };
    });
    
    await page.goto('/admin');
    await page.fill('[data-testid="global-search"]', '<script>alert("XSS")</script>');
    await page.keyboard.press('Enter');
    
    const xssTriggered = await page.evaluate(() => window.xssTriggered);
    expect(xssTriggered).toBe(false);
  });

  test('should sanitize user input in forms', async ({ page }) => {
    await page.goto('/admin/clients');
    await page.click('text=Add Client');
    
    await page.fill('input[name="nama"]', '<script>alert("XSS")</script>');
    await page.fill('input[name="email"]', 'test@test.com');
    await page.click('button[type="submit"]');
    
    // Should display escaped text, not execute script
    await expect(page.locator('text=<script>')).toBeVisible();
  });

  test('should enforce HTTPS in production', async ({ page }) => {
    // Skip in local dev
    if (process.env.NODE_ENV !== 'production') {
      test.skip();
    }
    
    await page.goto('/admin');
    expect(page.url()).toMatch(/^https:/);
  });
});
