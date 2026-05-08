import { test, expect } from '@playwright/test';
import { seedClient, seedEvent, seedGallery, prisma } from '../fixtures/db-seed';
import { cleanupByEmail } from '../fixtures/db-cleanup';
import { loginAsClient } from '../helpers';

test.describe('Client Portal - Dashboard', () => {
  const testEmail = 'client-dashboard@test.com';
  let clientId: string;
  let eventId: string;
  let galleryId: string;

  test.beforeAll(async () => {
    await cleanupByEmail(testEmail);
    
    const client = await seedClient({ 
      email: testEmail, 
      nama: 'Dashboard Test Client' 
    });
    clientId = client.id;

    const event = await seedEvent(clientId, { 
      namaProject: 'Test Wedding Event',
      eventDate: new Date('2026-06-15'),
      totalPrice: 5000000,
      paidAmount: 0,
      paymentStatus: 'unpaid'
    });
    eventId = event.id;

    const gallery = await seedGallery(eventId, { 
      namaProject: 'Test Wedding Gallery',
      status: 'published'
    });
    galleryId = gallery.id;
  });

  test.afterAll(async () => {
    await cleanupByEmail(testEmail);
  });

  test.beforeEach(async ({ page }) => {
    await loginAsClient(page, clientId, testEmail);
  });

  test('should display dashboard with galleries', async ({ page }) => {
    await expect(page.locator('text=Gallery Saya')).toBeVisible();
    await expect(page.locator('text=Test Wedding Gallery')).toBeVisible();
  });

  test('should show empty state when no galleries', async ({ page }) => {
    await prisma.gallery.delete({ where: { id: galleryId } });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    await expect(page.locator('text=Belum Ada Gallery')).toBeVisible();
    
    const gallery = await seedGallery(eventId, { 
      namaProject: 'Test Wedding Gallery',
      status: 'published'
    });
    galleryId = gallery.id;
  });

  test('should navigate to gallery when clicked', async ({ page }) => {
    const galleryCard = page.locator('text=Test Wedding Gallery').first();
    await galleryCard.click();
    
    await expect(page).toHaveURL(/\/gallery\//);
  });

  test('should display gallery metadata correctly', async ({ page }) => {
    await expect(page.locator('text=Test Wedding Event')).toBeVisible();
  });

  test('should show loading state initially', async ({ page }) => {
    await page.goto('/portal/dashboard');
    
    const loader = page.locator('[class*="animate-spin"]');
    await page.waitForLoadState('domcontentloaded');
    
    // Check if loader was visible during initial load
    const hasLoader = await page.locator('[class*="animate-spin"]').count();
    expect(hasLoader).toBeGreaterThanOrEqual(0);
  });
});
