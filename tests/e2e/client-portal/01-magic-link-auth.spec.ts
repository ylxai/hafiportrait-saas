import { test, expect } from '@playwright/test';
import { seedClient } from '../fixtures/db-seed';
import { cleanupByEmail } from '../fixtures/db-cleanup';
import { generateMagicLinkToken, loginAsClient } from '../helpers';

test.describe('Client Portal - Magic Link Authentication', () => {
  const testEmail = 'client-auth-test@test.com';
  let clientId: string;

  test.beforeAll(async () => {
    await cleanupByEmail(testEmail);
    const client = await seedClient({ 
      email: testEmail, 
      nama: 'Auth Test Client',
      password: 'test123'
    });
    clientId = client.id;
  });

  test.afterAll(async () => {
    await cleanupByEmail(testEmail);
  });

  test('should request magic link successfully', async ({ page }) => {
    await page.goto('/portal/login');
    await page.fill('input[type="email"]', testEmail);
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Link masuk telah dikirim')).toBeVisible({ timeout: 5000 });
  });

  test('should login with valid magic link token', async ({ page }) => {
    await loginAsClient(page, clientId, testEmail);
    
    await expect(page).toHaveURL(/\/portal\/dashboard/);
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });

  test('should reject invalid magic link token', async ({ page }) => {
    await page.goto('/portal/verify?token=invalid-token-12345');
    
    await expect(page.locator('text=Link tidak valid')).toBeVisible({ timeout: 5000 });
  });

  test('should reject expired magic link token', async ({ page }) => {
    const expiredToken = generateMagicLinkToken(clientId, testEmail);
    
    await page.goto(`/portal/verify?token=${expiredToken}`);
    await page.waitForTimeout(1000);
    
    await expect(page).toHaveURL(/\/portal/);
  });

  test('should persist session after page refresh', async ({ page }) => {
    await loginAsClient(page, clientId, testEmail);
    await page.reload();
    
    await expect(page).toHaveURL(/\/portal\/dashboard/);
  });

  test('should redirect to login when accessing protected route without auth', async ({ page }) => {
    await page.goto('/portal/dashboard');
    
    await expect(page).toHaveURL(/\/portal\/login/);
  });
});
