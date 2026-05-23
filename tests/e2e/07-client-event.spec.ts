import { test, expect } from '@playwright/test';
import { login, generateTestData, waitForToast } from './helpers';

test.describe('Client and Event Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should create client', async ({ page }) => {
    const testData = generateTestData();
    
    await page.goto('/admin/clients');
    await page.click('text=Add Client');
    
    await page.fill('input[name="nama"]', testData.clientName);
    await page.fill('input[name="email"]', `${testData.clientName}@test.com`);
    await page.fill('input[name="phone"]', '081234567890');
    await page.click('button[type="submit"]');
    
    await waitForToast(page, 'Client created');
    await expect(page.locator(`text=${testData.clientName}`)).toBeVisible();
  });

  test('should create event for client', async ({ page }) => {
    const testData = generateTestData();
    
    await page.goto('/admin/events');
    await page.click('text=Create Event');
    
    await page.fill('input[name="namaEvent"]', testData.eventName);
    await page.selectOption('select[name="clientId"]', { index: 1 });
    await page.fill('input[name="tanggalEvent"]', '2026-05-01');
    await page.click('button[type="submit"]');
    
    await waitForToast(page, 'Event created');
    await expect(page.locator(`text=${testData.eventName}`)).toBeVisible();
  });

  test('should link gallery to event', async ({ page }) => {
    await page.goto('/admin/events');
    await page.click('text=Test Event');
    
    await page.click('[data-testid="link-gallery"]');
    await page.selectOption('select[name="galleryId"]', { index: 1 });
    await page.click('button[type="submit"]');
    
    await waitForToast(page, 'Gallery linked');
  });

  test('should update event status', async ({ page }) => {
    await page.goto('/admin/events');
    await page.click('text=Test Event');
    
    await page.selectOption('select[name="status"]', 'completed');
    await page.click('button[type="submit"]');
    
    await waitForToast(page, 'Status updated');
    await expect(page.locator('text=Completed')).toBeVisible();
  });

  test('should delete client with cascade', async ({ page }) => {
    const testData = generateTestData();
    
    // Create client
    await page.goto('/admin/clients');
    await page.click('text=Add Client');
    await page.fill('input[name="nama"]', testData.clientName);
    await page.fill('input[name="email"]', `${testData.clientName}@test.com`);
    await page.click('button[type="submit"]');
    await waitForToast(page, 'Client created');
    
    // Delete client
    await page.click(`text=${testData.clientName}`);
    await page.click('[data-testid="delete-client"]');
    await page.click('text=Confirm');
    
    await waitForToast(page, 'Client deleted');
    await expect(page.locator(`text=${testData.clientName}`)).not.toBeVisible();
  });

  test('should update client details', async ({ page }) => {
    await page.goto('/admin/clients');
    await page.click('text=Test Client');
    
    await page.click('[data-testid="edit-client"]');
    await page.fill('input[name="nama"]', 'Updated Client Name');
    await page.click('button[type="submit"]');
    
    await waitForToast(page, 'Client updated');
    await expect(page.locator('text=Updated Client Name')).toBeVisible();
  });
});
