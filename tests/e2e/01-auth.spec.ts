import { test, expect } from '@playwright/test';
import { TEST_USER, login, logout } from './helpers';

test.describe('Authentication Flow', () => {
  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    
    await page.waitForURL('/admin');
    expect(page.url()).toContain('/admin');
  });

  test('should reject invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'wrong@email.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });

  test('should persist session after refresh', async ({ page }) => {
    await login(page);
    await page.reload();
    
    await page.waitForURL('/admin');
    expect(page.url()).toContain('/admin');
  });

  test('should logout successfully', async ({ page }) => {
    await login(page);
    await logout(page);
    
    expect(page.url()).toContain('/login');
  });

  test('should redirect to login when accessing protected route', async ({ page }) => {
    await page.goto('/admin/galleries');
    await page.waitForURL('/login');
    
    expect(page.url()).toContain('/login');
  });
});
