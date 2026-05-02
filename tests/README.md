# E2E Test Suite Documentation

## Overview

This test suite provides comprehensive end-to-end testing for the PhotoStudio SaaS platform using Playwright. Tests are organized by user role and feature area, with 20+ test files covering 175+ test cases across four main projects.

## Test Structure

```
tests/e2e/
├── admin/                          # Admin dashboard tests (9 files)
│   ├── 01-auth.spec.ts            # Authentication & session management
│   ├── 02-upload.spec.ts          # Photo upload functionality
│   ├── 03-gallery.spec.ts         # Gallery CRUD operations
│   ├── 04-stats-dashboard.spec.ts # Dashboard statistics
│   ├── 05-bulk-operations.spec.ts # Bulk photo operations
│   ├── 06-search-export.spec.ts   # Search & CSV export
│   ├── 07-client-event.spec.ts    # Client-event relationships
│   ├── 08-client-crud.spec.ts     # Client management
│   └── 09-event-management.spec.ts # Event CRUD & status
├── client-portal/                  # Client portal tests (5 files)
│   ├── 01-magic-link-auth.spec.ts # Magic link authentication
│   ├── 02-dashboard.spec.ts       # Client dashboard
│   ├── 03-gallery-selection.spec.ts # Gallery browsing & selection
│   ├── 04-invoices.spec.ts        # Invoice viewing
│   └── 05-profile.spec.ts         # Profile management
├── public/                         # Public-facing tests (3 files)
│   ├── 01-public-gallery.spec.ts  # Public gallery access
│   ├── 02-photo-selection.spec.ts # Photo selection flow
│   └── 03-booking.spec.ts         # Booking process
├── integration/                    # Cross-feature tests (3 files)
│   ├── 01-rate-limiting.spec.ts   # Rate limiting enforcement
│   ├── 02-security.spec.ts        # Security validations
│   └── 03-error-handling.spec.ts  # Error scenarios
├── fixtures/                       # Test data & fixtures
│   ├── db-seed.ts                 # Database seeding functions
│   ├── db-cleanup.ts              # Database cleanup functions
│   └── README.md                  # Fixture documentation
└── helpers.ts                      # Shared test utilities
```

## Database Setup

### Prerequisites

Before running tests, ensure you have:
- PostgreSQL installed and running
- A test database created
- `TEST_DATABASE_URL` environment variable set

### Initial Setup

Set up the test database with migrations and seed data:

```bash
npm run test:db:setup
```

This command:
1. Checks if `TEST_DATABASE_URL` is set
2. Runs Prisma migrations (`prisma db push`)
3. Seeds the database with initial data (`prisma/seed.ts`)
4. Prints success confirmation

### Reset Database

Reset the test database to a clean state:

```bash
npm run test:db:reset
```

This command:
1. Drops all tables
2. Re-runs all migrations
3. Re-seeds the database with initial data

Use this between test runs to ensure a consistent state.

### Environment Configuration

Create a `.env.test` file with:

```env
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/photostudio_test
DATABASE_URL=postgresql://user:password@localhost:5432/photostudio_test
NEXTAUTH_SECRET=your-secret-key
```

Or set the environment variable directly:

```bash
export TEST_DATABASE_URL="postgresql://user:password@localhost:5432/photostudio_test"
npm run test:db:setup
```

### Cross-Platform Compatibility

The database setup scripts work on:
- Linux/macOS (bash)
- Windows with Git Bash
- Windows with WSL

Scripts use `bash` shebang and standard POSIX commands for compatibility.

## Running Tests

### All Tests
```bash
npm run test:e2e
```
Runs all tests across all projects sequentially. Generates HTML report in `playwright-report/`.

### By Project
```bash
npm run test:e2e:admin        # Admin dashboard tests only
npm run test:e2e:client       # Client portal tests only
npm run test:e2e:public       # Public-facing tests only
npm run test:e2e:integration  # Integration & cross-feature tests only
```

### Interactive Modes
```bash
npm run test:e2e:ui           # UI mode with live browser (recommended for development)
npm run test:e2e:headed       # Headed mode (visible browser, no UI)
npm run test:e2e:debug        # Debug mode with Playwright Inspector
```

### Specific Tests
```bash
# Run single test file
npx playwright test tests/e2e/admin/01-auth.spec.ts

# Run tests matching pattern
npx playwright test -g "should login"

# Run specific project
npx playwright test --project=admin

# Run with specific browser
npx playwright test --project=admin --headed
```

### Advanced Options
```bash
# Run with retries
npx playwright test --retries=3

# Run with specific number of workers
npx playwright test --workers=2

# Update snapshots
npx playwright test --update-snapshots

# Show test report
npx playwright show-report
```

## Test Data & Fixtures

### Fixture System Overview

Tests use a fixture-based approach for consistent data setup and teardown. Fixtures are located in `tests/e2e/fixtures/`:

- **db-seed.ts** - Functions to create test data in database
- **db-cleanup.ts** - Functions to clean up test data after tests

### Using Fixtures in Tests

```typescript
import { seedClient, seedEvent, cleanupClient } from '../fixtures/db-seed';
import { cleanupAllTestData } from '../fixtures/db-cleanup';

test.describe('Client Management', () => {
  test('should create event for client', async ({ page }) => {
    // Setup: Create test data
    const client = await seedClient({
      nama: 'Test Client',
      email: 'client@test.com',
    });
    
    const event = await seedEvent({
      clientId: client.id,
      namaProject: 'Test Event',
    });
    
    // Test logic here
    
    // Cleanup: Remove test data
    await cleanupClient(client.id);
  });

  test.afterAll(async () => {
    // Ensure all test data is cleaned up
    await cleanupAllTestData();
  });
});
```

### db-seed.ts Functions

**seedClient(data?)**
```typescript
const client = await seedClient({
  nama: 'John Doe',
  email: 'john@test.com',
  phone: '+62812345678',
  password: 'hashedPassword', // optional
});
// Returns: { id, nama, email, phone, password }
```

**seedEvent(data?)**
```typescript
const event = await seedEvent({
  clientId: 'client-id',
  namaProject: 'Wedding Photography',
  eventDate: new Date('2024-06-15'),
  status: 'PENDING',
});
// Returns: { id, kodeBooking, clientId, namaProject, eventDate, status }
```

**seedGallery(data?)**
```typescript
const gallery = await seedGallery({
  eventId: 'event-id',
  namaProject: 'Wedding Gallery',
  status: 'ACTIVE',
});
// Returns: { id, eventId, namaProject, clientToken, status }
```

**seedPhoto(data?)**
```typescript
const photo = await seedPhoto({
  galleryId: 'gallery-id',
  url: 'https://example.com/photo.jpg',
  publicId: 'cloudinary-id',
});
// Returns: { id, galleryId, url, publicId }
```

### db-cleanup.ts Functions

**cleanupClient(clientId)**
```typescript
await cleanupClient('client-id');
// Deletes client and all related data (events, galleries, photos)
```

**cleanupEvent(eventId)**
```typescript
await cleanupEvent('event-id');
// Deletes event and related galleries/photos
```

**cleanupGallery(galleryId)**
```typescript
await cleanupGallery('gallery-id');
// Deletes gallery and related photos
```

**cleanupAllTestData()**
```typescript
await cleanupAllTestData();
// Deletes all test data (emails containing '@test.com')
// Useful for test.afterAll() cleanup
```

**cleanupByEmail(email)**
```typescript
await cleanupByEmail('client@test.com');
// Finds and deletes client by email
```

### Test User Credentials

Default test user (configured in `helpers.ts`):
```typescript
export const TEST_USER = {
  email: 'admin@photostudio.com',
  password: 'admin123',
};
```

Configure via environment variables in `.env.test`:
```
TEST_ADMIN_EMAIL=admin@photostudio.com
TEST_ADMIN_PASSWORD=admin123
BASE_URL=http://localhost:3000
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/photostudio_test
```

## Helper Functions

Located in `tests/e2e/helpers.ts`, these utilities simplify common test operations:

### Authentication Helpers

**login(page)**
```typescript
import { login } from '../helpers';

test('should access admin dashboard', async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL('/admin');
});
```
Logs in with TEST_USER credentials and waits for admin dashboard.

**logout(page)**
```typescript
await logout(page);
await expect(page).toHaveURL('/login');
```
Logs out and verifies redirect to login page.

### Client Portal Helpers

**loginAsClient(page, clientId, clientEmail)**
```typescript
import { loginAsClient } from '../helpers';

test('should access client portal', async ({ page }) => {
  await loginAsClient(page, 'client-123', 'client@test.com');
  await expect(page).toHaveURL('/portal/dashboard');
});
```
Generates magic link token and logs in as client.

**requestMagicLink(page, email)**
```typescript
await requestMagicLink(page, 'client@test.com');
// Fills email form and submits
// Waits for success toast message
```

**accessGalleryAsClient(page, galleryToken)**
```typescript
await accessGalleryAsClient(page, 'gallery-token-123');
// Navigates to public gallery with token
// Waits for page to load
```

### Utility Helpers

**generateTestData()**
```typescript
const data = generateTestData();
// Returns: {
//   clientName: 'Test Client 1714756800000',
//   eventName: 'Test Event 1714756800000',
//   galleryName: 'Test Gallery 1714756800000',
//   packageName: 'Test Package 1714756800000',
// }
```
Generates unique test data using timestamps.

**generateMagicLinkToken(clientId, clientEmail)**
```typescript
const token = generateMagicLinkToken('client-123', 'client@test.com');
// Returns JWT token valid for 15 minutes
```

**waitForToast(page, message)**
```typescript
await waitForToast(page, 'Client created successfully');
// Waits up to 5 seconds for toast message to appear
```

## Writing New Tests

### Test File Structure

Create new test files following the naming convention: `NN-feature.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { login } from '../helpers';
import { seedClient, cleanupClient } from '../fixtures/db-seed';
import { cleanupAllTestData } from '../fixtures/db-cleanup';

test.describe('Feature Name', () => {
  test.beforeAll(async () => {
    // Optional: Setup shared data
  });

  test.afterAll(async () => {
    // Cleanup all test data
    await cleanupAllTestData();
  });

  test('should do something', async ({ page }) => {
    // Arrange: Setup test data
    const client = await seedClient();
    
    // Act: Perform actions
    await login(page);
    await page.goto('/admin/clients');
    
    // Assert: Verify results
    await expect(page.locator('text=Client created')).toBeVisible();
    
    // Cleanup: Remove test data
    await cleanupClient(client.id);
  });
});
```

### Best Practices

**1. Use Descriptive Test Names**
```typescript
// ✓ Good
test('should reject client creation with duplicate email', async () => {});

// ✗ Bad
test('should reject duplicate', async () => {});
```

**2. Follow AAA Pattern (Arrange-Act-Assert)**
```typescript
test('should update client name', async ({ page }) => {
  // Arrange
  const client = await seedClient({ nama: 'Old Name' });
  
  // Act
  await login(page);
  await page.goto(`/admin/clients/${client.id}`);
  await page.fill('input[name="nama"]', 'New Name');
  await page.click('button[type="submit"]');
  
  // Assert
  await expect(page.locator('text=Client updated')).toBeVisible();
  
  // Cleanup
  await cleanupClient(client.id);
});
```

**3. Test Edge Cases**
```typescript
test.describe('Client Creation', () => {
  test('should reject empty name', async ({ page }) => {});
  test('should reject duplicate email', async ({ page }) => {});
  test('should accept valid data', async ({ page }) => {});
  test('should trim whitespace', async ({ page }) => {});
  test('should handle special characters', async ({ page }) => {});
});
```

**4. Use Fixtures for Setup/Teardown**
```typescript
// ✓ Good - Automatic cleanup
test('should create event', async ({ page }) => {
  const client = await seedClient();
  // test logic
  await cleanupClient(client.id);
});

// ✗ Bad - Manual setup without cleanup
test('should create event', async ({ page }) => {
  // Direct database manipulation
});
```

**5. Wait for Elements Properly**
```typescript
// ✓ Good - Explicit waits
await page.waitForURL('/admin/dashboard');
await page.waitForSelector('[data-testid="success-message"]');
await page.waitForLoadState('networkidle');

// ✗ Bad - Arbitrary delays
await page.waitForTimeout(2000);
```

**6. Group Related Tests**
```typescript
test.describe('Admin Authentication', () => {
  test('should login with valid credentials', async () => {});
  test('should reject invalid credentials', async () => {});
  test('should persist session', async () => {});
});

test.describe('Admin Client Management', () => {
  test('should create client', async () => {});
  test('should update client', async () => {});
  test('should delete client', async () => {});
});
```

### Common Test Patterns

**Testing API Endpoints**
```typescript
test('should create client via API', async ({ request }) => {
  const response = await request.post('/api/clients', {
    data: {
      nama: 'Test Client',
      email: 'test@test.com',
    },
  });
  
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.id).toBeDefined();
  expect(body.nama).toBe('Test Client');
});
```

**Testing Form Validation**
```typescript
test('should show validation errors', async ({ page }) => {
  await page.goto('/admin/clients/new');
  
  // Submit empty form
  await page.click('button[type="submit"]');
  
  // Check error messages
  await expect(page.locator('text=Name is required')).toBeVisible();
  await expect(page.locator('text=Email is required')).toBeVisible();
});
```

**Testing Navigation**
```typescript
test('should navigate between pages', async ({ page }) => {
  await login(page);
  
  await page.click('a[href="/admin/clients"]');
  await expect(page).toHaveURL('/admin/clients');
  
  await page.click('a[href="/admin/events"]');
  await expect(page).toHaveURL('/admin/events');
});
```

**Testing Data Persistence**
```typescript
test('should persist data after refresh', async ({ page }) => {
  await login(page);
  await page.goto('/admin/clients');
  
  const clientName = await page.locator('[data-testid="client-name"]').first().textContent();
  
  await page.reload();
  
  const clientNameAfter = await page.locator('[data-testid="client-name"]').first().textContent();
  expect(clientNameAfter).toBe(clientName);
});
```

## CI/CD Integration

### GitHub Actions Workflow

Tests run automatically on:
- Pull requests to `main`
- Commits to `main`
- Manual trigger via workflow dispatch

Configuration: `.github/workflows/test.yml`

### Environment Setup for CI

Required environment variables:
```
BASE_URL=https://staging.example.com
TEST_ADMIN_EMAIL=ci-admin@test.local
TEST_ADMIN_PASSWORD=<secure-password>
DATABASE_URL=<test-database-url>
NEXTAUTH_SECRET=<secret-key>
```

### Test Reports

After test runs, reports are available at:
- **HTML Report**: `playwright-report/index.html`
- **JSON Results**: `test-results.json`

View HTML report locally:
```bash
npx playwright show-report
```

### CI Configuration

```yaml
- name: Run E2E Tests
  run: npm run test:e2e
  
- name: Upload Test Results
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: playwright-report/
```

## Troubleshooting

### Tests Timeout

**Problem**: Tests fail with timeout errors

**Solutions**:
```bash
# Increase timeout in playwright.config.ts
use: {
  timeout: 30000, // 30 seconds
}

# Or increase for specific test
test.setTimeout(60000);

# Check if dev server is running
npm run dev

# Verify database connectivity
npx prisma studio
```

### Fixture Cleanup Fails

**Problem**: Database constraint errors during cleanup

**Solutions**:
```typescript
// Ensure cleanup order (child before parent)
await cleanupPhoto(photoId);      // Delete photos first
await cleanupGallery(galleryId);  // Then galleries
await cleanupEvent(eventId);      // Then events
await cleanupClient(clientId);    // Finally clients

// Or use comprehensive cleanup
await cleanupAllTestData();
```

### Flaky Tests

**Problem**: Tests pass sometimes, fail other times

**Solutions**:
```typescript
// Add explicit waits
await page.waitForLoadState('networkidle');
await page.waitForSelector('[data-testid="element"]');

// Increase retry count for CI
retries: process.env.CI ? 3 : 0,

// Use stable selectors
// ✓ Good
page.locator('[data-testid="submit-button"]')

// ✗ Bad
page.locator('button:nth-child(3)')
```

### Database Connection Errors

**Problem**: "Cannot connect to database"

**Solutions**:
```bash
# Check TEST_DATABASE_URL
echo $TEST_DATABASE_URL

# Verify PostgreSQL is running
pg_isready

# Check test database exists
psql -l | grep photostudio_test

# Recreate test database
dropdb photostudio_test
createdb photostudio_test
npm run test:db:setup
```

### Test Fixtures Not Found

**Problem**: "Cannot find test fixtures"

**Solutions**:
```bash
# Generate fixtures
npm run test:fixtures

# Verify fixtures exist
ls -lh tests/fixtures/

# Check fixture paths in tests
# Should be: tests/fixtures/test-photo.jpg
```

### Invalid Credentials Error

**Problem**: "Invalid credentials" during login

**Solutions**:
```bash
# Verify test user exists
npx prisma studio
# Navigate to User table
# Check admin@photostudio.com exists

# Update test credentials in helpers.ts
export const TEST_USER = {
  email: 'your-email@test.com',
  password: 'your-password',
};

# Or set via environment
TEST_ADMIN_EMAIL=admin@test.com npm run test:e2e
```

### Port Already in Use

**Problem**: "Port 3000 already in use"

**Solutions**:
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
BASE_URL=http://localhost:3001 npm run test:e2e

# Or disable auto server start
npx playwright test --no-build
```

### Browser Installation Issues

**Problem**: "Chromium not found"

**Solutions**:
```bash
# Reinstall browsers
npx playwright install --force chromium

# Clear Playwright cache
npx playwright clean

# Install with dependencies
npx playwright install --with-deps chromium
```

## Performance & Optimization

### Test Execution

- **Parallel execution**: Disabled (sequential) for data consistency
- **Workers**: 1 (prevents fixture conflicts)
- **Retries**: 0 locally, 2 in CI
- **Average runtime**: ~5-10 minutes for full suite

### Optimization Tips

1. **Use UI mode for development** - Faster feedback loop
   ```bash
   npm run test:e2e:ui
   ```

2. **Run specific tests** - Avoid running full suite
   ```bash
   npx playwright test 01-auth.spec.ts
   ```

3. **Skip slow tests during development**
   ```typescript
   test.skip('slow integration test', async () => {});
   ```

4. **Use test.only() for focused testing**
   ```typescript
   test.only('should focus on this test', async () => {});
   ```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [API Testing Guide](https://playwright.dev/docs/api-testing)
- [Fixtures Documentation](https://playwright.dev/docs/test-fixtures)
- [Debugging Guide](https://playwright.dev/docs/debug)
- [Best Practices](https://playwright.dev/docs/best-practices)

## Contributing

When adding new tests:

1. Create test file in appropriate directory (`admin/`, `client-portal/`, `public/`, or `integration/`)
2. Follow naming convention: `NN-feature.spec.ts`
3. Use existing fixtures for data setup
4. Include proper cleanup in `test.afterAll()`
5. Update this README with new test coverage
6. Run full suite to verify: `npm run test:e2e`
7. Commit with clear message: `test: add tests for feature X`
