# E2E Test Fixtures

This directory contains database seeding and cleanup utilities for E2E tests.

## Files

- **db-seed.ts** - Database seeding helpers for creating test data
- **db-cleanup.ts** - Cleanup utilities for removing test data

## Usage

### Seeding Test Data

```typescript
import { seedClient, seedEvent, seedGallery, seedFullTestData } from './fixtures/db-seed';

// Seed individual entities
const client = await seedClient({ nama: 'Test Client', email: 'test@example.com' });
const event = await seedEvent(client.id, { namaProject: 'Wedding Event' });
const gallery = await seedGallery(event.id);

// Seed complete test data set
const { client, event, gallery } = await seedFullTestData();
```

### Cleaning Up Test Data

```typescript
import { cleanupClient, cleanupAllTestData, cleanupByEmail } from './fixtures/db-cleanup';

// Cleanup specific entities
await cleanupClient(clientId);

// Cleanup by email
await cleanupByEmail('test@example.com');

// Cleanup all test data
await cleanupAllTestData();
```

## Test Database

Tests use `TEST_DATABASE_URL` from `.env.test`. Ensure you have a separate test database configured to avoid affecting production data.

## Client Portal Auth

Use the magic link simulation helpers in `helpers.ts`:

```typescript
import { loginAsClient, accessGalleryAsClient } from './helpers';

// Login as client using magic link simulation
await loginAsClient(page, 'client@example.com');

// Access gallery directly
await accessGalleryAsClient(page, galleryToken);
```
