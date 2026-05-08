import { test, expect } from '@playwright/test';
import { HTTP_STATUS } from '../constants/http-status';
import { seedClient, seedEvent, seedGallery, seedPhoto, cleanupClient } from '../fixtures/db-seed';

test.describe('Bulk Operations API', () => {
  let testClientId: string;

  test.afterEach(async () => {
    if (testClientId) {
      await cleanupClient(testClientId).catch(() => {});
      testClientId = '';
    }
  });

  test('should bulk delete photos', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);
    const gallery = await seedGallery(event.id);
    const photo1 = await seedPhoto(gallery.id);
    const photo2 = await seedPhoto(gallery.id);

    const response = await request.post('/api/admin/photos/bulk-delete', {
      data: {
        photoIds: [photo1.id, photo2.id]
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should reject bulk photo delete with empty array', async ({ request }) => {
    const response = await request.post('/api/admin/photos/bulk-delete', {
      data: {
        photoIds: []
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject bulk photo delete with invalid IDs', async ({ request }) => {
    const response = await request.post('/api/admin/photos/bulk-delete', {
      data: {
        photoIds: ['invalid-id-123']
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should handle partial failures in bulk photo delete', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);
    const gallery = await seedGallery(event.id);
    const photo = await seedPhoto(gallery.id);

    const response = await request.post('/api/admin/photos/bulk-delete', {
      data: {
        photoIds: [photo.id, 'phnonexistent123']
      }
    });

    // Should still succeed for valid IDs
    expect([HTTP_STATUS.OK, HTTP_STATUS.MULTI_STATUS]).toContain(response.status());
  });

  test('should bulk delete events', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    const event1 = await seedEvent(client.id);
    const event2 = await seedEvent(client.id);

    const response = await request.post('/api/admin/events/bulk', {
      data: {
        action: 'delete',
        ids: [event1.id, event2.id]
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should reject bulk event operations with invalid action', async ({ request }) => {
    const response = await request.post('/api/admin/events/bulk', {
      data: {
        action: 'invalid_action',
        ids: ['ev123']
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject bulk event operations with empty IDs', async ({ request }) => {
    const response = await request.post('/api/admin/events/bulk', {
      data: {
        action: 'delete',
        ids: []
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should bulk delete clients', async ({ request }) => {
    const client1 = await seedClient();
    const client2 = await seedClient();

    const response = await request.post('/api/admin/clients/bulk', {
      data: {
        action: 'delete',
        ids: [client1.id, client2.id]
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should reject bulk client operations with invalid action', async ({ request }) => {
    const response = await request.post('/api/admin/clients/bulk', {
      data: {
        action: 'invalid_action',
        ids: ['cl123']
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should bulk delete galleries', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);
    const gallery1 = await seedGallery(event.id);
    const gallery2 = await seedGallery(event.id);

    const response = await request.post('/api/admin/galleries/bulk', {
      data: {
        action: 'delete',
        ids: [gallery1.id, gallery2.id]
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should reject bulk operations without authentication', async ({ request }) => {
    const response = await request.post('/api/admin/photos/bulk-delete', {
      headers: { Cookie: '' },
      data: {
        photoIds: ['ph123']
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should handle large batch of photo deletions', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);
    const gallery = await seedGallery(event.id);
    
    const photoIds = [];
    for (let i = 0; i < 10; i++) {
      const photo = await seedPhoto(gallery.id);
      photoIds.push(photo.id);
    }

    const response = await request.post('/api/admin/photos/bulk-delete', {
      data: {
        photoIds
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should reject bulk operations with malformed request body', async ({ request }) => {
    const response = await request.post('/api/admin/photos/bulk-delete', {
      data: {
        invalidField: 'value'
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject bulk operations with non-array IDs', async ({ request }) => {
    const response = await request.post('/api/admin/events/bulk', {
      data: {
        action: 'delete',
        ids: 'not-an-array'
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });
});
