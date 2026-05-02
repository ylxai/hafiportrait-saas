import { test, expect } from '@playwright/test';
import { seedClient, seedEvent, seedGallery, seedPhoto, prisma } from '../fixtures/db-seed';

test.describe('Public Photo Selection', () => {
  let galleryToken: string;
  let galleryId: string;
  let photoIds: string[];

  test.beforeAll(async () => {
    const client = await seedClient();
    const event = await seedEvent(client.id);
    const gallery = await seedGallery(event.id);
    
    galleryToken = gallery.clientToken!;
    galleryId = gallery.id;

    const photo1 = await seedPhoto(gallery.id);
    const photo2 = await seedPhoto(gallery.id);
    const photo3 = await seedPhoto(gallery.id);
    photoIds = [photo1.id, photo2.id, photo3.id];
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('should access gallery with valid token', async ({ page }) => {
    const response = await page.request.get(`/api/public/gallery/${galleryToken}`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.gallery).toBeDefined();
    expect(data.data.gallery.id).toBe(galleryId);
  });

  test('should reject invalid token format', async ({ page }) => {
    const response = await page.request.get('/api/public/gallery/invalid-token');
    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('Invalid gallery token format');
  });

  test('should reject non-existent token', async ({ page }) => {
    const response = await page.request.get('/api/public/gallery/clxxxxxxxxxxxxxxxxxxx');
    expect(response.status()).toBe(404);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('Gallery not found');
  });

  test('should submit photo selection', async ({ page }) => {
    const response = await page.request.post(`/api/public/gallery/${galleryToken}/submit`, {
      data: { photoIds: [photoIds[0], photoIds[1]] },
    });

    expect(response.status()).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.selectionId).toBeDefined();
  });

  test('should lock gallery after selection submission', async ({ page }) => {
    const client = await seedClient();
    const event = await seedEvent(client.id);
    const gallery = await seedGallery(event.id);
    const photo = await seedPhoto(gallery.id);

    await page.request.post(`/api/public/gallery/${gallery.clientToken}/submit`, {
      data: { photoIds: [photo.id] },
    });

    const galleryCheck = await prisma.gallery.findUnique({
      where: { id: gallery.id },
    });

    expect(galleryCheck?.isSelectionLocked).toBe(true);
  });

  test('should reject duplicate selection submission', async ({ page }) => {
    const client = await seedClient();
    const event = await seedEvent(client.id);
    const gallery = await seedGallery(event.id);
    const photo = await seedPhoto(gallery.id);

    await page.request.post(`/api/public/gallery/${gallery.clientToken}/submit`, {
      data: { photoIds: [photo.id] },
    });

    const response = await page.request.post(`/api/public/gallery/${gallery.clientToken}/submit`, {
      data: { photoIds: [photo.id] },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Selection already submitted');
  });

  test('should reject invalid photo IDs', async ({ page }) => {
    const client = await seedClient();
    const event = await seedEvent(client.id);
    const gallery = await seedGallery(event.id);

    const response = await page.request.post(`/api/public/gallery/${gallery.clientToken}/submit`, {
      data: { photoIds: ['invalid-id-1', 'invalid-id-2'] },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid photo IDs');
  });

  test('should reject empty photo selection', async ({ page }) => {
    const client = await seedClient();
    const event = await seedEvent(client.id);
    const gallery = await seedGallery(event.id);

    const response = await page.request.post(`/api/public/gallery/${gallery.clientToken}/submit`, {
      data: { photoIds: [] },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('photoIds');
  });

  test('should reject photo IDs from different gallery', async ({ page }) => {
    const client = await seedClient();
    const event = await seedEvent(client.id);
    const gallery1 = await seedGallery(event.id);
    const gallery2 = await seedGallery(event.id);
    const photo = await seedPhoto(gallery2.id);

    const response = await page.request.post(`/api/public/gallery/${gallery1.clientToken}/submit`, {
      data: { photoIds: [photo.id] },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid photo IDs');
  });
});
