import { test, expect } from '@playwright/test';
import { seedClient, prisma } from '../fixtures/db-seed';
import { cleanupByEmail } from '../fixtures/db-cleanup';
import { loginAsClient } from '../helpers';

test.describe('Client Portal - Profile', () => {
  const testEmail = 'client-profile@test.com';
  let clientId: string;

  test.beforeAll(async () => {
    await cleanupByEmail(testEmail);
    
    const client = await seedClient({ 
      email: testEmail, 
      nama: 'Profile Test Client',
      phone: '+628123456789'
    });
    clientId = client.id;
  });

  test.afterAll(async () => {
    await cleanupByEmail(testEmail);
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsClient(page, clientId, testEmail);
    await page.goto('/portal/profile');
    await page.waitForLoadState('networkidle');
  });

  test('should view profile', async ({ page }) => {
    await expect(page.locator('text=/profil|profile/i')).toBeVisible();
    
    const nameInput = page.locator('input[name="nama"], input[name="name"]');
    await expect(nameInput).toHaveValue('Profile Test Client');
    
    const emailInput = page.locator('input[name="email"], input[type="email"]');
    await expect(emailInput).toHaveValue(testEmail);
    
    const phoneInput = page.locator('input[name="phone"], input[name="telepon"]');
    await expect(phoneInput).toHaveValue('+628123456789');
  });

  test('should update profile name', async ({ page }) => {
    const nameInput = page.locator('input[name="nama"], input[name="name"]');
    await nameInput.fill('Updated Name');
    
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=/berhasil|success/i')).toBeVisible({ timeout: 5000 });
    
    const updatedClient = await prisma.client.findUnique({ where: { id: clientId } });
    expect(updatedClient?.nama).toBe('Updated Name');
    
    await prisma.client.update({
      where: { id: clientId },
      data: { nama: 'Profile Test Client' }
    });
  });

  test('should update profile phone', async ({ page }) => {
    const phoneInput = page.locator('input[name="phone"], input[name="telepon"]');
    await phoneInput.fill('+628987654321');
    
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=/berhasil|success/i')).toBeVisible({ timeout: 5000 });
    
    const updatedClient = await prisma.client.findUnique({ where: { id: clientId } });
    expect(updatedClient?.phone).toBe('+628987654321');
    
    await prisma.client.update({
      where: { id: clientId },
      data: { phone: '+628123456789' }
    });
  });

  test('should validate required fields', async ({ page }) => {
    const nameInput = page.locator('input[name="nama"], input[name="name"]');
    await nameInput.fill('');
    
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=/wajib|required/i')).toBeVisible();
  });

  test('should validate phone format', async ({ page }) => {
    const phoneInput = page.locator('input[name="phone"], input[name="telepon"]');
    await phoneInput.fill('invalid-phone');
    
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=/format|invalid/i')).toBeVisible();
  });

  test('should have email field as read-only', async ({ page }) => {
    const emailInput = page.locator('input[name="email"], input[type="email"]');
    
    const isReadOnly = await emailInput.evaluate(el => 
      el.hasAttribute('readonly') || el.hasAttribute('disabled')
    );
    expect(isReadOnly).toBeTruthy();
  });

  test('should update instagram handle', async ({ page }) => {
    const instagramInput = page.locator('input[name="instagram"]');
    
    if (await instagramInput.isVisible()) {
      await instagramInput.fill('@testuser');
      await page.click('button[type="submit"]');
      
      await expect(page.locator('text=/berhasil|success/i')).toBeVisible({ timeout: 5000 });
      
      const updatedClient = await prisma.client.findUnique({ where: { id: clientId } });
      expect(updatedClient?.instagram).toBe('@testuser');
    }
  });

  test('should persist changes after page reload', async ({ page }) => {
    const nameInput = page.locator('input[name="nama"], input[name="name"]');
    await nameInput.fill('Persisted Name');
    
    await page.click('button[type="submit"]');
    await expect(page.locator('text=/berhasil|success/i')).toBeVisible({ timeout: 5000 });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    await expect(nameInput).toHaveValue('Persisted Name');
    
    await prisma.client.update({
      where: { id: clientId },
      data: { nama: 'Profile Test Client' }
    });
  });
});
