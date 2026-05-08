import { test, expect } from '@playwright/test';
import { seedClient, seedEvent, cleanupClient } from '../fixtures/db-seed';

test.describe('Event Management API', () => {
  let testClientId: string;
  let testEventId: string;

  test.afterEach(async () => {
    if (testClientId) {
      await cleanupClient(testClientId).catch(() => {});
      testClientId = '';
      testEventId = '';
    }
  });

  test('should create event with valid data', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;

    const timestamp = Date.now();
    const response = await request.post('/api/admin/events', {
      data: {
        clientId: client.id,
        namaProject: `Test Event ${timestamp}`,
        eventDate: '2026-06-01',
        totalPrice: 5000000,
        paymentStatus: 'unpaid',
        status: 'confirmed'
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('id');
    expect(data.data).toHaveProperty('kodeBooking');
    expect(data.data.namaProject).toBe(`Test Event ${timestamp}`);
    expect(data.data.clientId).toBe(client.id);
    
    testEventId = data.data.id;
  });

  test('should auto-generate kodeBooking', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;

    const response = await request.post('/api/admin/events', {
      data: {
        clientId: client.id,
        namaProject: 'Test Event',
        eventDate: '2026-06-01',
        totalPrice: 5000000,
        paymentStatus: 'unpaid',
        status: 'confirmed'
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.data.kodeBooking).toBeTruthy();
    expect(data.data.kodeBooking).toMatch(/^BK/);
  });

  test('should reject event creation with missing required fields', async ({ request }) => {
    const response = await request.post('/api/admin/events', {
      data: {
        namaProject: 'Incomplete Event'
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject event with non-existent client', async ({ request }) => {
    const response = await request.post('/api/admin/events', {
      data: {
        clientId: 'clnonexistent123',
        namaProject: 'Test Event',
        eventDate: '2026-06-01',
        totalPrice: 5000000,
        paymentStatus: 'unpaid',
        status: 'confirmed'
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject past event dates', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;

    const response = await request.post('/api/admin/events', {
      data: {
        clientId: client.id,
        namaProject: 'Past Event',
        eventDate: '2020-01-01',
        totalPrice: 5000000,
        paymentStatus: 'unpaid',
        status: 'confirmed'
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should list events with pagination', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);
    testEventId = event.id;

    const response = await request.get('/api/admin/events?page=1&limit=10');

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('items');
    expect(data.data).toHaveProperty('pagination');
    expect(Array.isArray(data.data.items)).toBe(true);
  });

  test('should include client info in event list', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    await seedEvent(client.id);

    const response = await request.get('/api/admin/events?page=1&limit=10');
    const data = await response.json();

    if (data.data.items.length > 0) {
      const event = data.data.items[0];
      expect(event).toHaveProperty('client');
      expect(event.client).toHaveProperty('nama');
      expect(event.client).toHaveProperty('email');
    }
  });

  test('should get event by ID', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);
    testEventId = event.id;

    const response = await request.get(`/api/admin/events/${event.id}`);

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.id).toBe(event.id);
    expect(data.data.kodeBooking).toBe(event.kodeBooking);
  });

  test('should return 404 for non-existent event', async ({ request }) => {
    const response = await request.get('/api/admin/events/evnonexistent123');

    expect(response.status()).toBe(404);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should update event status', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);
    testEventId = event.id;

    const response = await request.put(`/api/admin/events/${event.id}`, {
      data: {
        status: 'completed'
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('completed');
  });

  test('should update payment status', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);
    testEventId = event.id;

    const response = await request.put(`/api/admin/events/${event.id}`, {
      data: {
        paymentStatus: 'paid',
        paidAmount: 5000000
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.paymentStatus).toBe('paid');
  });

  test('should reject invalid status value', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);
    testEventId = event.id;

    const response = await request.put(`/api/admin/events/${event.id}`, {
      data: {
        status: 'invalid_status'
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should delete event', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);
    testEventId = event.id;

    const response = await request.delete(`/api/admin/events/${event.id}`);

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);

    // Verify deletion
    const getResponse = await request.get(`/api/admin/events/${event.id}`);
    expect(getResponse.status()).toBe(404);
    
    testEventId = '';
  });

  test('should return 404 when deleting non-existent event', async ({ request }) => {
    const response = await request.delete('/api/admin/events/evnonexistent123');

    expect(response.status()).toBe(404);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject unauthenticated requests', async ({ request }) => {
    const response = await request.get('/api/admin/events', {
      headers: { Cookie: '' }
    });

    expect(response.status()).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should handle event date updates', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);
    testEventId = event.id;

    const response = await request.put(`/api/admin/events/${event.id}`, {
      data: {
        eventDate: '2026-12-31'
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.eventDate).toContain('2026-12-31');
  });

  test('should reject negative prices', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;

    const response = await request.post('/api/admin/events', {
      data: {
        clientId: client.id,
        namaProject: 'Test Event',
        eventDate: '2026-06-01',
        totalPrice: -1000,
        paymentStatus: 'unpaid',
        status: 'confirmed'
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should handle bulk event deletion', async ({ request }) => {
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

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should reject bulk operations with empty IDs', async ({ request }) => {
    const response = await request.post('/api/admin/events/bulk', {
      data: {
        action: 'delete',
        ids: []
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject bulk operations with invalid action', async ({ request }) => {
    const response = await request.post('/api/admin/events/bulk', {
      data: {
        action: 'invalid_action',
        ids: ['ev123']
      }
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });
});
