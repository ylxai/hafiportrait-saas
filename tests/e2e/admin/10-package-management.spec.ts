import { test, expect } from '@playwright/test';
import { HTTP_STATUS } from '../constants/http-status';
import { seedPackage, cleanupPackage } from '../fixtures/db-seed';

test.describe('Package Management API', () => {
  let testPackageId: string;

  test.afterEach(async () => {
    if (testPackageId) {
      await cleanupPackage(testPackageId).catch(() => {});
      testPackageId = '';
    }
  });

  // ==================== CREATE PACKAGE ====================

  test('should create package with valid data', async ({ request }) => {
    const response = await request.post('/api/admin/packages', {
      data: {
        nama: 'Basic Package',
        description: 'Perfect for small events',
        price: 1500000,
        duration: 4,
        fitur: ['2 hours coverage', '50 edited photos', 'Online gallery'],
        maxSelection: 30,
        maxDownload: 10
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.CREATED);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.package).toHaveProperty('id');
    expect(data.package.nama).toBe('Basic Package');
    expect(data.package.price).toBe(1500000);
    expect(data.package.isActive).toBe(true);
    expect(data.package.fitur).toContain('2 hours coverage');

    testPackageId = data.package.id;
  });

  test('should create package with minimal required fields', async ({ request }) => {
    const response = await request.post('/api/admin/packages', {
      data: {
        nama: 'Minimal Package',
        price: 500000
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.CREATED);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.package.nama).toBe('Minimal Package');
    expect(data.package.price).toBe(500000);
    expect(data.package.maxSelection).toBe(20); // default value

    testPackageId = data.package.id;
  });

  test('should create package with nullish description', async ({ request }) => {
    const response = await request.post('/api/admin/packages', {
      data: {
        nama: 'No Description Package',
        price: 1000000,
        description: null
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.CREATED);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.package.description).toBeNull();

    testPackageId = data.package.id;
  });

  // ==================== VALIDATION TESTS ====================

  test('should reject package creation with missing name', async ({ request }) => {
    const response = await request.post('/api/admin/packages', {
      data: {
        price: 1000000
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject package creation with empty name', async ({ request }) => {
    const response = await request.post('/api/admin/packages', {
      data: {
        nama: '',
        price: 1000000
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject package creation with name exceeding max length', async ({ request }) => {
    const response = await request.post('/api/admin/packages', {
      data: {
        nama: 'A'.repeat(101),
        price: 1000000
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject package creation with negative price', async ({ request }) => {
    const response = await request.post('/api/admin/packages', {
      data: {
        nama: 'Invalid Price Package',
        price: -1000
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should allow zero price', async ({ request }) => {
    const response = await request.post('/api/admin/packages', {
      data: {
        nama: 'Free Package',
        price: 0
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.CREATED);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.package.price).toBe(0);

    testPackageId = data.package.id;
  });

  test('should reject package creation with negative duration', async ({ request }) => {
    const response = await request.post('/api/admin/packages', {
      data: {
        nama: 'Invalid Duration Package',
        price: 1000000,
        duration: -5
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject package creation with non-integer duration', async ({ request }) => {
    const response = await request.post('/api/admin/packages', {
      data: {
        nama: 'Invalid Duration Package',
        price: 1000000,
        duration: 2.5
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject package creation with invalid JSON body', async ({ request }) => {
    const response = await request.post('/api/admin/packages', {
      headers: { 'Content-Type': 'application/json' },
      data: 'invalid json'
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  // ==================== LIST PACKAGES ====================

  test('should get all packages with pagination', async ({ request }) => {
    const pkg = await seedPackage();
    testPackageId = pkg.id;

    const response = await request.get('/api/admin/packages?page=1&limit=10');

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.packages).toHaveProperty('length');
    expect(data.pagination).toHaveProperty('page');
    expect(data.pagination).toHaveProperty('limit');
    expect(data.pagination).toHaveProperty('total');
  });

  test('should reject invalid pagination page parameter', async ({ request }) => {
    const response = await request.get('/api/admin/packages?page=0&limit=10');

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject pagination limit exceeding max', async ({ request }) => {
    const response = await request.get('/api/admin/packages?page=1&limit=200');

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  // ==================== GET PACKAGE BY ID ====================

  test('should get package by ID', async ({ request }) => {
    const pkg = await seedPackage({ nama: 'Get Test Package' });
    testPackageId = pkg.id;

    const response = await request.get(`/api/admin/packages/${pkg.id}`);

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.package.id).toBe(pkg.id);
    expect(data.package.nama).toBe('Get Test Package');
  });

  test('should return 404 for non-existent package', async ({ request }) => {
    const response = await request.get('/api/admin/packages/pknonexistent123');

    expect(response.status()).toBe(HTTP_STATUS.NOT_FOUND);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  // ==================== UPDATE PACKAGE ====================

  test('should update package with valid data', async ({ request }) => {
    const pkg = await seedPackage();
    testPackageId = pkg.id;

    const response = await request.patch('/api/admin/packages', {
      data: {
        id: pkg.id,
        nama: 'Updated Package Name',
        price: 2000000,
        description: 'Updated description'
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.package.nama).toBe('Updated Package Name');
    expect(data.package.price).toBe(2000000);
    expect(data.package.description).toBe('Updated description');
  });

  test('should update package features', async ({ request }) => {
    const pkg = await seedPackage();
    testPackageId = pkg.id;

    const response = await request.patch('/api/admin/packages', {
      data: {
        id: pkg.id,
        fitur: ['New Feature 1', 'New Feature 2', 'New Feature 3']
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.package.fitur).toHaveLength(3);
    expect(data.package.fitur).toContain('New Feature 1');
  });

  test('should update package max selection and download limits', async ({ request }) => {
    const pkg = await seedPackage();
    testPackageId = pkg.id;

    const response = await request.patch('/api/admin/packages', {
      data: {
        id: pkg.id,
        maxSelection: 50,
        maxDownload: 25
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.package.maxSelection).toBe(50);
    expect(data.package.maxDownload).toBe(25);
  });

  test('should update package active status', async ({ request }) => {
    const pkg = await seedPackage({ isActive: true });
    testPackageId = pkg.id;

    const response = await request.patch('/api/admin/packages', {
      data: {
        id: pkg.id,
        isActive: false
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.package.isActive).toBe(false);
  });

  test('should reject update without id field', async ({ request }) => {
    const response = await request.patch('/api/admin/packages', {
      data: {
        nama: 'Update Without ID'
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject update with invalid package id format', async ({ request }) => {
    const response = await request.patch('/api/admin/packages', {
      data: {
        id: 'invalid-id-format',
        nama: 'Test Update'
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject update with negative maxSelection', async ({ request }) => {
    const pkg = await seedPackage();
    testPackageId = pkg.id;

    const response = await request.patch('/api/admin/packages', {
      data: {
        id: pkg.id,
        maxSelection: -5
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject update with non-integer maxSelection', async ({ request }) => {
    const pkg = await seedPackage();
    testPackageId = pkg.id;

    const response = await request.patch('/api/admin/packages', {
      data: {
        id: pkg.id,
        maxSelection: 10.5
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should return 404 when updating non-existent package', async ({ request }) => {
    const response = await request.patch('/api/admin/packages', {
      data: {
        id: 'pknonexistent123',
        nama: 'Non-existent Update'
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.NOT_FOUND);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  // ==================== DELETE PACKAGE ====================

  test('should delete package', async ({ request }) => {
    const pkg = await seedPackage();
    testPackageId = pkg.id;

    const response = await request.delete(`/api/admin/packages?id=${pkg.id}`);

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);

    // Verify deletion
    const getResponse = await request.get(`/api/admin/packages/${pkg.id}`);
    expect(getResponse.status()).toBe(HTTP_STATUS.NOT_FOUND);

    testPackageId = '';
  });

  test('should return 404 when deleting non-existent package', async ({ request }) => {
    const response = await request.delete('/api/admin/packages?id=pknonexistent123');

    expect(response.status()).toBe(HTTP_STATUS.NOT_FOUND);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject delete without id query param', async ({ request }) => {
    const response = await request.delete('/api/admin/packages');

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject delete with invalid id format', async ({ request }) => {
    const response = await request.delete('/api/admin/packages?id=invalid-id');

    expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  // ==================== AUTHENTICATION TESTS ====================

  test('should reject unauthenticated create request', async ({ request }) => {
    const response = await request.post('/api/admin/packages', {
      headers: { Cookie: '' },
      data: {
        nama: 'Unauthenticated Package',
        price: 1000000
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject unauthenticated list request', async ({ request }) => {
    const response = await request.get('/api/admin/packages', {
      headers: { Cookie: '' }
    });

    expect(response.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject unauthenticated update request', async ({ request }) => {
    const response = await request.patch('/api/admin/packages', {
      headers: { Cookie: '' },
      data: {
        id: 'some-id',
        nama: 'Unauthenticated Update'
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test('should reject unauthenticated delete request', async ({ request }) => {
    const response = await request.delete('/api/admin/packages?id=some-id', {
      headers: { Cookie: '' }
    });

    expect(response.status()).toBe(HTTP_STATUS.UNAUTHORIZED);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  // ==================== EDGE CASES ====================

  test('should handle package with special characters in name', async ({ request }) => {
    const response = await request.post('/api/admin/packages', {
      data: {
        nama: 'Package & "Special" <Characters> Test',
        price: 1000000,
        description: 'Testing special chars @#$%'
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.CREATED);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.package.nama).toBeTruthy();

    testPackageId = data.package.id;
  });

  test('should handle package with very long features array', async ({ request }) => {
    const features = Array.from({ length: 20 }, (_, i) => `Feature item ${i + 1}`);

    const response = await request.post('/api/admin/packages', {
      data: {
        nama: 'Many Features Package',
        price: 3000000,
        fitur: features
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.CREATED);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.package.fitur).toHaveLength(20);

    testPackageId = data.package.id;
  });

  test('should update package without changing unchanged fields', async ({ request }) => {
    const pkg = await seedPackage({
      nama: 'Original Name',
      price: 1000000,
      description: 'Original Description',
      maxSelection: 20
    });
    testPackageId = pkg.id;

    const response = await request.patch('/api/admin/packages', {
      data: {
        id: pkg.id,
        description: 'Updated Description Only'
      }
    });

    expect(response.status()).toBe(HTTP_STATUS.OK);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.package.nama).toBe('Original Name');
    expect(data.package.price).toBe(1000000);
    expect(data.package.description).toBe('Updated Description Only');
    expect(data.package.maxSelection).toBe(20);
  });
});