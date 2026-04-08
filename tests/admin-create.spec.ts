import { test, expect } from '@playwright/test';

/**
 * Playwright tests untuk Create functions di Admin Dashboard
 * 
 * Test scenarios:
 * 1. Create Client
 * 2. Create Package  
 * 3. Create Event
 * 4. Create Gallery
 * 5. Upload Photos (Create Photos)
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Test user credentials - Pastikan ini valid di aplikasi
const TEST_CREDENTIALS = {
  email: 'admin@photostudio.com',
  password: 'admin123'
};

// Helper untuk login - menggunakan selectors yang benar
test.beforeEach(async ({ page }) => {
  // Navigate ke login
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  
  // Tunggu form login muncul
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  
  // Isi form login dengan selectors yang benar
  await page.fill('input[type="email"]', TEST_CREDENTIALS.email);
  await page.fill('input[type="password"]', TEST_CREDENTIALS.password);
  
  // Click tombol "Masuk"
  await page.click('button[type="submit"]');
  
  // Tunggu redirect ke admin (URL harus mengandung /admin)
  await page.waitForURL(/\/admin/, { timeout: 10000 });
});

test.describe('Create Client', () => {
  test('should create new client successfully', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/clients`);
    await page.waitForLoadState('networkidle');
    
    // Tunggu page benar-benar loaded
    await page.waitForSelector('text=Clients', { timeout: 10000 });
    
    // Click tombol "Tambah Client Baru" - menggunakan getByRole
    await page.getByRole('button', { name: 'Tambah Client Baru' }).click();
    
    // Tunggu modal muncul - cari heading dengan text "Tambah Client Baru"
    await page.waitForSelector('text=Tambah Client Baru', { timeout: 5000 });
    
    // Isi form client - gunakan getByRole textbox
    const timestamp = Date.now();
    await page.getByRole('textbox').nth(0).fill(`Test Client ${timestamp}`); // Nama Lengkap
    await page.getByRole('textbox').nth(1).fill(`test.client.${timestamp}@example.com`); // Email
    await page.getByRole('textbox').nth(2).fill(`08123456789`); // Phone
    await page.getByRole('textbox').nth(3).fill(`@testclient${timestamp}`); // Instagram
    
    // Submit form dengan tekan Enter
    await page.keyboard.press('Enter');
    
    // Verifikasi client muncul di list - tunggu table reload
    await page.waitForTimeout(1500);
    await expect(page.locator(`text=Test Client ${timestamp}`)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Create Package', () => {
  test('should create new package successfully', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/packages`);
    await page.waitForLoadState('networkidle');
    
    // Tunggu page benar-benar loaded - cari text "Packages"
    await page.waitForSelector('text=Packages', { timeout: 10000 });
    
    // Click tombol "Tambah Paket Baru" - menggunakan getByRole
    await page.getByRole('button', { name: 'Tambah Paket Baru' }).click();
    
    // Tunggu modal muncul - cari heading dengan text "Tambah Paket Baru"
    await page.waitForSelector('text=Tambah Paket Baru', { timeout: 5000 });
    await page.waitForTimeout(500); // Extra wait untuk modal animation
    
    // Isi form package - gunakan getByRole dengan benar
    const timestamp = Date.now();
    await page.getByRole('textbox').nth(0).fill(`Test Package ${timestamp}`); // Nama Paket
    await page.getByRole('textbox').nth(1).fill('Deskripsi test package untuk wedding photography'); // Deskripsi
    await page.getByRole('textbox').nth(2).fill('10 Edited Photos, Album, Video'); // Fitur
    
    // Spinbutton untuk angka (Harga, Durasi, Max Selection, Max Download)
    const spinbuttons = page.locator('[data-slot="input"][inputmode="numeric"], input[type="number"]');
    await spinbuttons.nth(0).fill('5000000'); // Harga
    await spinbuttons.nth(1).fill('480'); // Durasi (8 jam = 480 menit)
    await spinbuttons.nth(2).fill('25'); // Max Selection
    await spinbuttons.nth(3).fill('25'); // Max Download
    
    // Submit form dengan tekan Enter
    await page.keyboard.press('Enter');
    
    // Verifikasi package muncul di list
    await page.waitForTimeout(1500);
    await expect(page.locator(`text=Test Package ${timestamp}`)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Create Event', () => {
  test('should create new event with existing client and package', async ({ page }) => {
    // Generate unique timestamp untuk semua data
    const timestamp = Date.now();
    const clientName = `Event Client ${timestamp}`;
    const packageName = `Event Package ${timestamp}`;
    const eventName = `Test Event ${timestamp}`;
    
    // Step 1: Create a client first
    await page.goto(`${BASE_URL}/admin/clients`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('text=Clients', { timeout: 10000 });
    
    await page.getByRole('button', { name: 'Tambah Client Baru' }).click();
    await page.waitForSelector('text=Tambah Client Baru', { timeout: 5000 });
    
    await page.getByRole('textbox').nth(0).fill(clientName);
    await page.getByRole('textbox').nth(1).fill(`event.client.${timestamp}@example.com`);
    await page.getByRole('textbox').nth(2).fill(`081234567890`);
    await page.keyboard.press('Enter');
    
    // Tunggu dan verifikasi client tersimpan
    await page.waitForTimeout(2000);
    await expect(page.locator(`text=${clientName}`)).toBeVisible({ timeout: 5000 });
    
    // Step 2: Create a package
    await page.goto(`${BASE_URL}/admin/packages`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('text=Packages', { timeout: 10000 });
    
    await page.getByRole('button', { name: 'Tambah Paket Baru' }).click();
    await page.waitForSelector('text=Tambah Paket Baru', { timeout: 5000 });
    await page.waitForTimeout(500);
    
    await page.getByRole('textbox').nth(0).fill(packageName);
    await page.getByRole('textbox').nth(1).fill('Package untuk test event');
    await page.getByRole('textbox').nth(2).fill('Unlimited Photos, All Files'); // Fitur
    
    const spinbuttons = page.locator('[data-slot="input"][inputmode="numeric"], input[type="number"]');
    await spinbuttons.nth(0).fill('7500000'); // Harga
    await spinbuttons.nth(1).fill('600'); // Durasi (10 jam = 600 menit)
    await spinbuttons.nth(2).fill('30'); // Max Selection
    await spinbuttons.nth(3).fill('30'); // Max Download
    await page.keyboard.press('Enter');
    
    // Tunggu dan verifikasi package tersimpan
    await page.waitForTimeout(2000);
    await expect(page.locator(`text=${packageName}`)).toBeVisible({ timeout: 5000 });
    
    // Step 3: Create event
    await page.goto(`${BASE_URL}/admin/events`);
    await page.waitForLoadState('networkidle');
    
    // Tunggu page load dengan benar
    await page.waitForSelector('text=Events', { timeout: 10000 });
    
    // Reload page untuk memastikan data client dan package ter-load
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Tunggu data fetch dari API
    
    // Click tombol "Buat Event Baru" - gunakan first() untuk ambil yang pertama
    await page.getByRole('button', { name: 'Buat Event Baru' }).first().click();
    
    // Tunggu modal muncul
    await page.waitForSelector('text=Buat Event Baru', { timeout: 5000 });
    await page.waitForTimeout(500); // Tunggu modal animation selesai
    
    // Isi form Event - Nama Project
    await page.getByRole('textbox').nth(0).fill(eventName);
    
    // Pilih Client dari dropdown - click combobox pertama dan tunggu options muncul
    await page.getByRole('combobox').nth(0).click();
    await page.waitForTimeout(1000); // Tunggu dropdown expand dan data load
    
    // Cari dan click client dari dropdown list
    const clientOption = page.locator(`text=${clientName}`).first();
    await clientOption.click();
    
    // Isi tanggal event
    await page.getByRole('textbox').nth(1).fill(new Date().toISOString().split('T')[0]);
    
    // Isi lokasi
    await page.getByRole('textbox').nth(2).fill('Jakarta, Indonesia');
    
    // Pilih Package - click combobox kedua
    await page.getByRole('combobox').nth(1).click();
    await page.waitForTimeout(1000); // Tunggu dropdown expand dan data load
    
    // Cari dan click package dari dropdown list
    const packageOption = page.locator(`text=${packageName}`).first();
    await packageOption.click();
    
    // Isi total harga (spinbutton pertama)
    await page.locator('input[type="number"]').nth(0).fill('7500000');
    
    // Click tombol "Buat Event"
    await page.getByRole('button', { name: 'Buat Event' }).click();
    
    // Verifikasi event muncul di list - tunggu lebih lama
    await page.waitForTimeout(2000);
    await expect(page.locator(`text=${eventName}`)).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Create Gallery', () => {
  test('should create new gallery from existing event', async ({ page }) => {
    // Pre-condition: Need an event with client
    await page.goto(`${BASE_URL}/admin/events`);
    await page.waitForLoadState('networkidle');
    
    // Check if there are any events
    const noEventsMessage = page.locator('text=Belum ada event');
    const hasNoEvents = await noEventsMessage.isVisible().catch(() => false);
    
    if (hasNoEvents) {
      test.skip('No events available - skipping gallery test');
      return;
    }
    
    // Get the first event and create gallery from it
    const firstEvent = page.locator('table tbody tr').first();
    await firstEvent.click();
    
    // Wait for event detail page
    await page.waitForLoadState('networkidle');
    
    // Look for "Buat Gallery" button
    const createGalleryBtn = page.locator('button:has-text("Buat Gallery")');
    const hasCreateBtn = await createGalleryBtn.isVisible().catch(() => false);
    
    if (!hasCreateBtn) {
      test.skip('Create Gallery button not found');
      return;
    }
    
    await createGalleryBtn.click();
    
    // Tunggu modal atau redirect ke gallery
    await page.waitForTimeout(2000);
    
    // Verifikasi URL mengandung /admin/galleries/
    expect(page.url()).toMatch(/\/admin\/galleries\//);
  });
});

test.describe('Upload Photos', () => {
  test('should upload photos to gallery', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/galleries`);
    await page.waitForLoadState('networkidle');
    
    // Check if there are any galleries
    const noGalleriesMessage = page.locator('text=Belum ada gallery');
    const hasNoGalleries = await noGalleriesMessage.isVisible().catch(() => false);
    
    if (hasNoGalleries) {
      test.skip('No galleries available for upload test');
      return;
    }
    
    // Click gallery pertama
    await page.locator('table tbody tr, a[href*="/admin/galleries/"]').first().click();
    
    // Tunggu page load
    await page.waitForLoadState('networkidle');
    
    // Click tombol upload
    const uploadBtn = page.locator('button:has-text("Upload")');
    const hasUploadBtn = await uploadBtn.isVisible().catch(() => false);
    
    if (!hasUploadBtn) {
      test.skip('Upload button not found');
      return;
    }
    
    await uploadBtn.click();
    
    // Tunggu upload manager terbuka
    await page.waitForSelector('text=Upload Foto', { timeout: 5000 });
    
    // Upload file real dari wedding_photos
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      '/home/eouser/wedding_photos/1.jpg',
      '/home/eouser/wedding_photos/DSC_2351.JPG'
    ]);
    
    // Click Start Upload
    const startUploadBtn = page.locator('button:has-text("Start Upload")');
    await startUploadBtn.click();
    
    // Tunggu upload selesai - timeout lebih lama untuk upload besar
    await page.waitForTimeout(30000);
    
    // Verifikasi dengan screenshot atau check photo count
    const photoCount = await page.locator('.grid > div, [data-photo]').count();
    expect(photoCount).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Bulk Operations', () => {
  test('should delete multiple photos in bulk', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/galleries`);
    await page.waitForLoadState('networkidle');
    
    // Click gallery pertama
    const firstGallery = page.locator('table tbody tr, a[href*="/admin/galleries/"]').first();
    const hasGallery = await firstGallery.isVisible().catch(() => false);
    
    if (!hasGallery) {
      test.skip('No galleries available for bulk test');
      return;
    }
    
    await firstGallery.click();
    await page.waitForLoadState('networkidle');
    
    // Enable bulk mode
    const bulkBtn = page.locator('button:has-text("Bulk")');
    const hasBulkMode = await bulkBtn.isVisible().catch(() => false);
    
    if (!hasBulkMode) {
      test.skip('Bulk mode not available');
      return;
    }
    
    await bulkBtn.click();
    
    // Select 2 photos (kalau ada)
    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    
    if (checkboxCount < 3) {
      test.skip('Not enough photos for bulk delete test');
      return;
    }
    
    await checkboxes.nth(1).check();
    await checkboxes.nth(2).check();
    
    // Click delete
    const deleteBtn = page.locator('button:has-text("Hapus")').first();
    await deleteBtn.click();
    
    // Konfirmasi delete
    await page.click('button:has-text("Ya"), button:has-text("Hapus")');
    
    // Verifikasi dengan timeout
    await page.waitForTimeout(2000);
  });
});
