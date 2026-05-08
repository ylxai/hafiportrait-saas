import { test, expect } from '@playwright/test';
import { seedClient, cleanupClient } from '../fixtures/db-seed';

test.describe('Client CRUD Operations API', () => {
  let testClientId: string;

  test.afterEach(async () => {
    if (testClientId) {
      await cleanupClient(testClientId).catch(() => {});
      testClientId = '';
    }
  });

  test('should create client with valid data', async ({ request }) => {
    const timestamp = Date.now();
    const response = await request.post('/api/admin/clients', {
      data: {
        nama: `Test Client ${timestamp}`,
        email: `client${timestamp}@test.com`,
        phone: '+6281234567890',
        instagram: '@testclient',
        storageQuotaGB: 10
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('id');
    expect(data.data.nama).toBe(`Test Client ${timestamp}`);
    expect(data.data.email).toBe(`client${timestamp}@test.com`);
    
    testClientId = data.data.id;
  });

  test('should reject client creation with missing required fields', async ({ request }) => {
    const response = await request.post('/api/admin/clients', {
      data: {
        email: 'incomplete@test.com'
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject client creation with invalid email', async ({ request }) => {
    const response = await request.post('/api/admin/clients', {
      data: {
        nama: 'Test Client',
        email: 'invalid-email',
        phone: '+6281234567890'
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject duplicate email', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;

    const response = await request.post('/api/admin/clients', {
      data: {
        nama: 'Duplicate Client',
        email: client.email,
        phone: '+6281234567890'
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should list clients with pagination', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;

    const response = await request.get('/api/admin/clients?page=1&limit=10');

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('items');
    expect(data.data).toHaveProperty('pagination');
    expect(Array.isArray(data.data.items)).toBe(true);
    expect(data.data.pagination).toHaveProperty('page');
    expect(data.data.pagination).toHaveProperty('limit');
    expect(data.data.pagination).toHaveProperty('total');
  });

  test('should reject invalid pagination parameters', async ({ request }) => {
    const response = await request.get('/api/admin/clients?page=0&limit=10');

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject pagination limit exceeding max', async ({ request }) => {
    const response = await request.get('/api/admin/clients?page=1&limit=200');

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should get client by ID', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;

    const response = await request.get(`/api/admin/clients/${client.id}`);

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.id).toBe(client.id);
    expect(data.data.nama).toBe(client.nama);
    expect(data.data.email).toBe(client.email);
  });

  test('should return 404 for non-existent client', async ({ request }) => {
    const response = await request.get('/api/admin/clients/clnonexistent123');

    expect(response.status()).toBe(404);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should update client with valid data', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;

    const response = await request.put(`/api/admin/clients/${client.id}`, {
      data: {
        nama: 'Updated Client Name',
        phone: '+6289876543210'
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.nama).toBe('Updated Client Name');
    expect(data.data.phone).toBe('+6289876543210');
  });

  test('should reject update with invalid email', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;

    const response = await request.put(`/api/admin/clients/${client.id}`, {
      data: {
        email: 'invalid-email-format'
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should delete client', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;

    const response = await request.delete(`/api/admin/clients/${client.id}`);

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);

    // Verify deletion
    const getResponse = await request.get(`/api/admin/clients/${client.id}`);
    expect(getResponse.status()).toBe(404);
    
    testClientId = '';
  });

  test('should return 404 when deleting non-existent client', async ({ request }) => {
    const response = await request.delete('/api/admin/clients/clnonexistent123');

    expect(response.status()).toBe(404);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/admin/clients', {
      headers: { Cookie: '' }
    });

    expect(response.status()).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should handle storage quota updates', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;

    const response = await request.put(`/api/admin/clients/${client.id}`, {
      data: {
        storageQuotaGB: 50
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.storageQuotaGB).toBe(50);
  });

  test('should reject negative storage quota', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;

    const response = await request.put(`/api/admin/clients/${client.id}`, {
      data: {
        storageQuotaGB: -10
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });
});
