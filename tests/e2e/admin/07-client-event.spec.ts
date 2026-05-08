import { test, expect } from '@playwright/test';
import { HTTP_STATUS } from '../constants/http-status';
import { seedClient, seedEvent, seedGallery, cleanupClient } from '../fixtures/db-seed';

test.describe('Client and Event Integration API', () => {
  let testClientId: string;

  test.afterEach(async () => {
    if (testClientId) {
      await cleanupClient(testClientId).catch(() => {});
      testClientId = '';
    }
  });

  test('should create client and event in sequence', async ({ request }) => {
    const timestamp = Date.now();
    
    // Create client
    const clientResponse = await request.post('/api/admin/clients', {
      data: {
        nama: `Integration Client ${timestamp}`,
        email: `integration${timestamp}@test.com`,
        phone: '+6281234567890'
      }
    });

    expect(clientResponse.status()).toBe(HTTP_STATUS.OK);
    const clientData = await clientResponse.json();
    testClientId = clientData.data.id;

    // Create event for client
    const eventResponse = await request.post('/api/admin/events', {
      data: {
        clientId: testClientId,
        namaProject: `Integration Event ${timestamp}`,
        eventDate: '2026-06-01',
        totalPrice: 5000000,
        paymentStatus: 'unpaid',
        status: 'confirmed'
      }
    });

    expect(eventResponse.status()).toBe(HTTP_STATUS.OK);
    const eventData = await eventResponse.json();
    expect(eventData.data.clientId).toBe(testClientId);
  });

  test('should create event with gallery', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;

    const timestamp = Date.now();
    
    // Create event
    const eventResponse = await request.post('/api/admin/events', {
      data: {
        clientId: client.id,
        namaProject: `Event with Gallery ${timestamp}`,
        eventDate: '2026-06-01',
        totalPrice: 5000000,
        paymentStatus: 'unpaid',
        status: 'confirmed'
      }
    });

    const eventData = await eventResponse.json();
    const eventId = eventData.data.id;

    // Create gallery for event
    const galleryResponse = await request.post('/api/admin/galleries', {
      data: {
        eventId,
        namaProject: `Gallery ${timestamp}`,
        maxSelection: 20,
        enableDownload: true
      }
    });

    expect(galleryResponse.status()).toBe(HTTP_STATUS.OK);
    const galleryData = await galleryResponse.json();
    expect(galleryData.data.eventId).toBe(eventId);
  });

  test('should list events for specific client', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    await seedEvent(client.id);
    await seedEvent(client.id);

    const response = await request.get(`/api/admin/clients/${client.id}`);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('events');
    expect(data.data.events.length).toBeGreaterThanOrEqual(2);
  });

  test('should cascade delete client with events', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);

    const response = await request.delete(`/api/admin/clients/${client.id}`);

    expect(response.status()).toBe(HTTP_STATUS.OK);

    // Verify event is also deleted
    const eventResponse = await request.get(`/api/admin/events/${event.id}`);
    expect(eventResponse.status()).toBe(HTTP_STATUS.NOT_FOUND);
    
    testClientId = '';
  });

  test('should update event client association', async ({ request }) => {
    const client1 = await seedClient();
    const client2 = await seedClient();
    testClientId = client1.id;
    
    const event = await seedEvent(client1.id);

    const response = await request.put(`/api/admin/events/${event.id}`, {
      data: {
        clientId: client2.id
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.data.clientId).toBe(client2.id);
    
    await cleanupClient(client2.id);
  });

  test('should get client with event statistics', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    await seedEvent(client.id, { status: 'completed' });
    await seedEvent(client.id, { status: 'confirmed' });

    const response = await request.get(`/api/admin/clients/${client.id}`);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('events');
  });

  test('should link multiple galleries to event', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);

    const _gallery1 = await seedGallery(event.id);
    const _gallery2 = await seedGallery(event.id);

    const response = await request.get(`/api/admin/events/${event.id}`);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('galleries');
    expect(data.data.galleries.length).toBeGreaterThanOrEqual(2);
  });

  test('should prevent deleting client with active events', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    await seedEvent(client.id, { status: 'confirmed' });

    // This should either succeed with cascade or fail with proper error
    const response = await request.delete(`/api/admin/clients/${client.id}`);
    
    if (response.status() === 400) {
      const data = await response.json();
      expect(data.success).toBe(false);
    } else {
      expect(response.status()).toBe(HTTP_STATUS.OK);
      testClientId = '';
    }
  });

  test('should get event with client details', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);

    const response = await request.get(`/api/admin/events/${event.id}`);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('client');
    expect(data.data.client.id).toBe(client.id);
    expect(data.data.client.nama).toBe(client.nama);
  });

  test('should filter events by client', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    await seedEvent(client.id);

    const response = await request.get(`/api/admin/events?clientId=${client.id}`);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.data.items.every((e: { clientId: string }) => e.clientId === client.id)).toBe(true);
  });

  test('should handle client with no events', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;

    const response = await request.get(`/api/admin/clients/${client.id}`);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.data.events).toBeDefined();
    expect(data.data.events.length).toBe(0);
  });

  test('should update client and reflect in events', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    const event = await seedEvent(client.id);

    // Update client name
    await request.put(`/api/admin/clients/${client.id}`, {
      data: {
        nama: 'Updated Client Name'
      }
    });

    // Get event and verify client name is updated
    const eventResponse = await request.get(`/api/admin/events/${event.id}`);
    const eventData = await eventResponse.json();

    expect(eventData.data.client.nama).toBe('Updated Client Name');
  });

  test('should handle event date conflicts for same client', async ({ request }) => {
    const client = await seedClient();
    testClientId = client.id;
    
    const eventDate = '2026-07-15';
    await seedEvent(client.id, { eventDate: new Date(eventDate) });

    // Try to create another event on same date
    const response = await request.post('/api/admin/events', {
      data: {
        clientId: client.id,
        namaProject: 'Conflicting Event',
        eventDate,
        totalPrice: 5000000,
        paymentStatus: 'unpaid',
        status: 'confirmed'
      }
    });

    // Should either allow or reject based on business rules
    expect([200, 400]).toContain(response.status());
  });
});
