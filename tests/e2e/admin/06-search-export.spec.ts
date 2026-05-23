import { test, expect } from '@playwright/test';
import { HTTP_STATUS } from '../constants/http-status';
import { seedClient, seedEvent, cleanupClient } from '../fixtures/db-seed';

test.describe('Search and Export API', () => {
  let testClientId: string;

  test.beforeEach(async () => {
    const client = await seedClient({ nama: 'Searchable Client' });
    testClientId = client.id;
    await seedEvent(client.id, { namaProject: 'Searchable Event' });
  });

  test.afterEach(async () => {
    if (testClientId) {
      await cleanupClient(testClientId).catch(() => {});
      testClientId = '';
    }
  });

  test('should search across all entities', async ({ request }) => {
    const response = await request.get('/api/admin/search?q=Searchable');

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('clients');
    expect(data.data).toHaveProperty('events');
    expect(data.data).toHaveProperty('galleries');
  });

  test('should find clients by name', async ({ request }) => {
    const response = await request.get('/api/admin/search?q=Searchable+Client');

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.clients.length).toBeGreaterThan(0);
  });

  test('should find events by project name', async ({ request }) => {
    const response = await request.get('/api/admin/search?q=Searchable+Event');

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.events.length).toBeGreaterThan(0);
  });

  test('should return empty results for non-existent query', async ({ request }) => {
    const response = await request.get('/api/admin/search?q=NonExistentQuery12345');

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.clients.length).toBe(0);
    expect(data.data.events.length).toBe(0);
    expect(data.data.galleries.length).toBe(0);
  });

  test('should reject search without query parameter', async ({ request }) => {
    const response = await request.get('/api/admin/search');

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject search with empty query', async ({ request }) => {
    const response = await request.get('/api/admin/search?q=');

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should handle special characters in search query', async ({ request }) => {
    const response = await request.get('/api/admin/search?q=%40%23%24%25');

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should limit search results', async ({ request }) => {
    const response = await request.get('/api/admin/search?q=Test&limit=5');

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.clients.length).toBeLessThanOrEqual(5);
    expect(data.data.events.length).toBeLessThanOrEqual(5);
    expect(data.data.galleries.length).toBeLessThanOrEqual(5);
  });

  test('should export events to CSV', async ({ request }) => {
    const response = await request.get('/api/admin/export/events');

    expect(response.status()).toBe(HTTP_STATUS.OK);
    expect(response.headers()['content-type']).toContain('text/csv');
    
    const csvContent = await response.text();
    expect(csvContent).toContain('Kode Booking');
    expect(csvContent).toContain('Nama Project');
  });

  test('should export clients to CSV', async ({ request }) => {
    const response = await request.get('/api/admin/export/clients');

    expect(response.status()).toBe(HTTP_STATUS.OK);
    expect(response.headers()['content-type']).toContain('text/csv');
    
    const csvContent = await response.text();
    expect(csvContent).toContain('Nama');
    expect(csvContent).toContain('Email');
  });

  test('should include proper CSV headers in events export', async ({ request }) => {
    const response = await request.get('/api/admin/export/events');
    const csvContent = await response.text();
    
    const headers = csvContent.split('\n')[0];
    expect(headers).toContain('Kode Booking');
    expect(headers).toContain('Client');
    expect(headers).toContain('Event Date');
    expect(headers).toContain('Status');
  });

  test('should include proper CSV headers in clients export', async ({ request }) => {
    const response = await request.get('/api/admin/export/clients');
    const csvContent = await response.text();
    
    const headers = csvContent.split('\n')[0];
    expect(headers).toContain('Nama');
    expect(headers).toContain('Email');
    expect(headers).toContain('Phone');
  });

  test('should reject export without authentication', async ({ request }) => {
    const response = await request.get('/api/admin/export/events', {
      headers: { Cookie: '' }
    });

    expect(response.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
  });

  test('should reject search without authentication', async ({ request }) => {
    const response = await request.get('/api/admin/search?q=Test', {
      headers: { Cookie: '' }
    });

    expect(response.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should handle case-insensitive search', async ({ request }) => {
    const response1 = await request.get('/api/admin/search?q=searchable');
    const response2 = await request.get('/api/admin/search?q=SEARCHABLE');

    const data1 = await response1.json();
    const data2 = await response2.json();

    expect(data1.data.clients.length).toBe(data2.data.clients.length);
  });

  test('should search by email', async ({ request }) => {
    const client = await seedClient({ email: 'unique.search@test.com' });
    
    const response = await request.get('/api/admin/search?q=unique.search@test.com');
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.data.clients.some((c: { email: string }) => c.email === 'unique.search@test.com')).toBe(true);
    
    await cleanupClient(client.id);
  });

  test('should handle very long search queries', async ({ request }) => {
    const longQuery = 'a'.repeat(200);
    const response = await request.get(`/api/admin/search?q=${longQuery}`);

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});
