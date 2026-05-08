import { test, expect } from '@playwright/test';
import { seedClient, seedEvent, seedGallery, cleanupClient } from '../fixtures/db-seed';

test.describe('Gallery Management API', () => {
  let testClientId: string;
  let testEventId: string;
  let _testGalleryId: string;

  test.beforeEach(async () => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);
    testEventId = event.id;
  });

  test.afterEach(async () => {
    if (testClientId) {
      await cleanupClient(testClientId).catch(() => {});
      testClientId = '';
      testEventId = '';
      _testGalleryId = '';
    }
  });

  test('should create gallery with valid data', async ({ request }) => {
    const timestamp = Date.now();
    const response = await request.post('/api/admin/galleries', {
      data: {
        eventId: testEventId,
        namaProject: `Test Gallery ${timestamp}`,
        maxSelection: 20,
        enableDownload: true,
        status: 'published'
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('id');
    expect(data.data.namaProject).toBe(`Test Gallery ${timestamp}`);
    
    _testGalleryId = data.data.id;
  });

  test('should reject gallery creation with missing required fields', async ({ request }) => {
    const response = await request.post('/api/admin/galleries', {
      data: {
        namaProject: 'Incomplete Gallery'
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject gallery with non-existent event', async ({ request }) => {
    const response = await request.post('/api/admin/galleries', {
      data: {
        eventId: 'evnonexistent123',
        namaProject: 'Test Gallery',
        maxSelection: 20,
        enableDownload: true
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should list galleries with pagination', async ({ request }) => {
    const gallery = await seedGallery(testEventId);
    _testGalleryId = gallery.id;

    const response = await request.get('/api/admin/galleries?page=1&limit=10');

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('items');
    expect(data.data).toHaveProperty('pagination');
    expect(Array.isArray(data.data.items)).toBe(true);
  });

  test('should get gallery by ID', async ({ request }) => {
    const gallery = await seedGallery(testEventId);
    testGalleryId = gallery.id;

    const response = await request.get(`/api/admin/galleries/${gallery.id}`);

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.id).toBe(gallery.id);
  });

  test('should return 404 for non-existent gallery', async ({ request }) => {
    const response = await request.get('/api/admin/galleries/glnonexistent123');

    expect(response.status()).toBe(404);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should lock gallery', async ({ request }) => {
    const gallery = await seedGallery(testEventId);
    testGalleryId = gallery.id;

    const response = await request.post(`/api/admin/galleries/${gallery.id}/toggle-lock`);

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.isLocked).toBe(true);
  });

  test('should unlock gallery', async ({ request }) => {
    const gallery = await seedGallery(testEventId, { status: 'locked' });
    testGalleryId = gallery.id;

    const response = await request.post(`/api/admin/galleries/${gallery.id}/toggle-lock`);

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.isLocked).toBe(false);
  });

  test('should update gallery details', async ({ request }) => {
    const gallery = await seedGallery(testEventId);
    testGalleryId = gallery.id;

    const response = await request.put(`/api/admin/galleries/${gallery.id}`, {
      data: {
        namaProject: 'Updated Gallery Name',
        maxSelection: 30
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.namaProject).toBe('Updated Gallery Name');
    expect(data.data.maxSelection).toBe(30);
  });

  test('should reject invalid maxSelection value', async ({ request }) => {
    const gallery = await seedGallery(testEventId);
    testGalleryId = gallery.id;

    const response = await request.put(`/api/admin/galleries/${gallery.id}`, {
      data: {
        maxSelection: -5
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should delete gallery', async ({ request }) => {
    const gallery = await seedGallery(testEventId);
    testGalleryId = gallery.id;

    const response = await request.delete(`/api/admin/galleries/${gallery.id}`);

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);

    // Verify deletion
    const getResponse = await request.get(`/api/admin/galleries/${gallery.id}`);
    expect(getResponse.status()).toBe(404);
    
    testGalleryId = '';
  });

  test('should return 404 when deleting non-existent gallery', async ({ request }) => {
    const response = await request.delete('/api/admin/galleries/glnonexistent123');

    expect(response.status()).toBe(404);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should handle bulk gallery deletion', async ({ request }) => {
    const gallery1 = await seedGallery(testEventId);
    const gallery2 = await seedGallery(testEventId);

    const response = await request.post('/api/admin/galleries/bulk', {
      data: {
        action: 'delete',
        ids: [gallery1.id, gallery2.id]
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should reject bulk operations with empty IDs', async ({ request }) => {
    const response = await request.post('/api/admin/galleries/bulk', {
      data: {
        action: 'delete',
        ids: []
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/admin/galleries', {
      headers: { Cookie: '' }
    });

    expect(response.status()).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should handle gallery status updates', async ({ request }) => {
    const gallery = await seedGallery(testEventId);
    testGalleryId = gallery.id;

    const response = await request.put(`/api/admin/galleries/${gallery.id}`, {
      data: {
        status: 'archived'
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('archived');
  });

  test('should reject invalid status value', async ({ request }) => {
    const gallery = await seedGallery(testEventId);
    testGalleryId = gallery.id;

    const response = await request.put(`/api/admin/galleries/${gallery.id}`, {
      data: {
        status: 'invalid_status'
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });
});
