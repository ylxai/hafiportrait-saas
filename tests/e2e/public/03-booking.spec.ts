import { test, expect } from '@playwright/test';
import { prisma } from '../fixtures/db-seed';

test.describe('Public Booking', () => {
  let packageId: string;

  test.beforeAll(async () => {
    const pkg = await prisma.package.create({
      data: {
        nama: 'Test Package',
        price: 5000000,
        description: 'Test package for booking',
        features: ['Feature 1', 'Feature 2'],
        isActive: true,
      },
    });
    packageId = pkg.id;
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('should submit valid booking form', async ({ page }) => {
    const timestamp = Date.now();
    const response = await page.request.post('/api/public/booking', {
      data: {
        nama: `Test Client ${timestamp}`,
        email: `test${timestamp}@example.com`,
        phone: '+628123456789',
        instagram: '@testuser',
        packageId,
        eventDate: new Date('2026-06-01').toISOString(),
        location: 'Test Location',
        notes: 'Test booking notes',
      },
    });

    expect(response.status()).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.event).toBeDefined();
    expect(data.data.kodeBooking).toBeDefined();
  });

  test('should reject booking with missing required fields', async ({ page }) => {
    const response = await page.request.post('/api/public/booking', {
      data: {
        email: 'test@example.com',
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('nama');
  });

  test('should reject booking with invalid email', async ({ page }) => {
    const response = await page.request.post('/api/public/booking', {
      data: {
        nama: 'Test Client',
        email: 'invalid-email',
        phone: '+628123456789',
        eventDate: new Date('2026-06-01').toISOString(),
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('email');
  });

  test('should reject booking with invalid phone format', async ({ page }) => {
    const response = await page.request.post('/api/public/booking', {
      data: {
        nama: 'Test Client',
        email: 'test@example.com',
        phone: '123',
        eventDate: new Date('2026-06-01').toISOString(),
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('phone');
  });

  test('should reject booking with past event date', async ({ page }) => {
    const response = await page.request.post('/api/public/booking', {
      data: {
        nama: 'Test Client',
        email: 'test@example.com',
        phone: '+628123456789',
        eventDate: new Date('2020-01-01').toISOString(),
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('eventDate');
  });

  test('should enforce rate limiting on booking endpoint', async ({ page }) => {
    const timestamp = Date.now();
    const email = `ratelimit${timestamp}@example.com`;

    // Make 6 requests (limit is 5 per 15 minutes)
    for (let i = 0; i < 6; i++) {
      const response = await page.request.post('/api/public/booking', {
        data: {
          nama: `Test Client ${i}`,
          email,
          phone: '+628123456789',
          eventDate: new Date('2026-06-01').toISOString(),
        },
      });

      if (i < 5) {
        expect(response.status()).toBe(201);
      } else {
        expect(response.status()).toBe(429);
        const data = await response.json();
        expect(data.error).toContain('Too many booking requests');
      }
    }
  });

  test('should create client if not exists', async ({ page }) => {
    const timestamp = Date.now();
    const email = `newclient${timestamp}@example.com`;

    const response = await page.request.post('/api/public/booking', {
      data: {
        nama: 'New Client',
        email,
        phone: '+628123456789',
        eventDate: new Date('2026-06-01').toISOString(),
      },
    });

    expect(response.status()).toBe(201);

    const client = await prisma.client.findFirst({
      where: { email },
    });

    expect(client).toBeDefined();
    expect(client?.nama).toBe('New Client');
  });

  test('should reuse existing client', async ({ page }) => {
    const timestamp = Date.now();
    const email = `existing${timestamp}@example.com`;

    await prisma.client.create({
      data: {
        nama: 'Existing Client',
        email,
        phone: '+628123456789',
      },
    });

    const response = await page.request.post('/api/public/booking', {
      data: {
        nama: 'Different Name',
        email,
        phone: '+628987654321',
        eventDate: new Date('2026-06-01').toISOString(),
      },
    });

    expect(response.status()).toBe(201);

    const clients = await prisma.client.findMany({
      where: { email },
    });

    expect(clients.length).toBe(1);
  });

  test('should reject invalid JSON body', async ({ page }) => {
    const response = await page.request.post('/api/public/booking', {
      data: 'invalid json',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid JSON body');
  });

  test('should create payment record with booking', async ({ page }) => {
    const timestamp = Date.now();
    const response = await page.request.post('/api/public/booking', {
      data: {
        nama: `Test Client ${timestamp}`,
        email: `payment${timestamp}@example.com`,
        phone: '+628123456789',
        packageId,
        eventDate: new Date('2026-06-01').toISOString(),
      },
    });

    expect(response.status()).toBe(201);
    const data = await response.json();

    const payment = await prisma.payment.findFirst({
      where: { eventId: data.data.event.id },
    });

    expect(payment).toBeDefined();
    expect(payment?.status).toBe('pending');
    expect(payment?.amount).toBe(5000000);
  });
});
