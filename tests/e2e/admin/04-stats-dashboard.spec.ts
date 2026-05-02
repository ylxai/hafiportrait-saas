import { test, expect } from '@playwright/test';
import { seedClient, seedEvent, seedGallery, seedPhoto, cleanupClient } from '../fixtures/db-seed';

test.describe('Stats Dashboard API', () => {
  let testClientId: string;

  test.beforeAll(async () => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);
    const gallery = await seedGallery(event.id);
    await seedPhoto(gallery.id);
  });

  test.afterAll(async () => {
    await cleanupClient(testClientId);
  });

  test('should return dashboard stats for authenticated admin', async ({ request }) => {
    const response = await request.get('/api/admin/stats');
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('totalEvents');
    expect(data.data).toHaveProperty('totalClients');
    expect(data.data).toHaveProperty('totalGalleries');
    expect(data.data).toHaveProperty('totalPhotos');
    expect(data.data).toHaveProperty('totalRevenue');
    expect(data.data).toHaveProperty('recentEvents');
    expect(data.data).toHaveProperty('recentGalleries');
    
    expect(typeof data.data.totalEvents).toBe('number');
    expect(typeof data.data.totalClients).toBe('number');
    expect(typeof data.data.totalGalleries).toBe('number');
    expect(typeof data.data.totalPhotos).toBe('number');
    expect(Array.isArray(data.data.recentEvents)).toBe(true);
    expect(Array.isArray(data.data.recentGalleries)).toBe(true);
  });

  test('should return recent events with client info', async ({ request }) => {
    const response = await request.get('/api/admin/stats');
    const data = await response.json();
    
    if (data.data.recentEvents.length > 0) {
      const event = data.data.recentEvents[0];
      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('namaProject');
      expect(event).toHaveProperty('kodeBooking');
      expect(event).toHaveProperty('eventDate');
      expect(event).toHaveProperty('status');
      expect(event).toHaveProperty('client');
    }
  });

  test('should return recent galleries with photo count', async ({ request }) => {
    const response = await request.get('/api/admin/stats');
    const data = await response.json();
    
    if (data.data.recentGalleries.length > 0) {
      const gallery = data.data.recentGalleries[0];
      expect(gallery).toHaveProperty('id');
      expect(gallery).toHaveProperty('namaProject');
      expect(gallery).toHaveProperty('status');
      expect(gallery).toHaveProperty('photoCount');
      expect(gallery).toHaveProperty('client');
      expect(typeof gallery.photoCount).toBe('number');
    }
  });

  test('should reject unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/admin/stats', {
      headers: { Cookie: '' }
    });
    
    expect(response.status()).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should return consistent data structure on multiple calls', async ({ request }) => {
    const response1 = await request.get('/api/admin/stats');
    const response2 = await request.get('/api/admin/stats');
    
    const data1 = await response1.json();
    const data2 = await response2.json();
    
    expect(Object.keys(data1.data).sort()).toEqual(Object.keys(data2.data).sort());
  });
});
