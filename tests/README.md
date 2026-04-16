# E2E Testing Suite

Comprehensive end-to-end testing for PhotoStudio SaaS using Playwright.

## Test Coverage

### Priority 1 (Critical)
- ✅ **01-auth.spec.ts** - Authentication flow (login, logout, session)
- ✅ **02-upload.spec.ts** - Photo upload pipeline (presigned URL, R2, thumbnails)
- ✅ **03-gallery.spec.ts** - Gallery CRUD operations
- ✅ **04-public-gallery.spec.ts** - Public gallery access (no auth)

### Priority 2 (High)
- ✅ **05-bulk-operations.spec.ts** - Bulk select/delete operations
- ✅ **06-search-export.spec.ts** - Global search & CSV export
- ✅ **07-client-event.spec.ts** - Client & event management

### Priority 3 (Security)
- ✅ **11-rate-limiting.spec.ts** - Rate limit enforcement (PR #35 fix)
- ✅ **12-security.spec.ts** - Auth, authorization, XSS prevention
- ✅ **13-error-handling.spec.ts** - Error handling & validation

## Setup

### 1. Install Dependencies
```bash
npm install
npx playwright install chromium
```

### 2. Prepare Test Fixtures
Create test files in `tests/fixtures/`:
- `test-photo.jpg` - Valid JPEG (< 10MB)
- `test-photo.png` - Valid PNG (< 10MB)
- `test-photo.heic` - Valid HEIC (< 10MB)
- `invalid-file.txt` - Plain text file
- `large-file.jpg` - JPEG > 50MB

See `tests/fixtures/README.md` for details.

### 3. Configure Test Environment
```bash
# .env.test (optional)
BASE_URL=http://localhost:3000
DATABASE_URL=postgresql://...
```

### 4. Seed Test Data
```bash
npm run db:seed
```

## Running Tests

### Run All Tests
```bash
npm run test:e2e
```

### Run with UI Mode (Recommended)
```bash
npm run test:e2e:ui
```

### Run in Headed Mode (See Browser)
```bash
npm run test:e2e:headed
```

### Debug Mode
```bash
npm run test:e2e:debug
```

### Run Specific Test File
```bash
npx playwright test tests/e2e/02-upload.spec.ts
```

### Run Specific Test
```bash
npx playwright test -g "should upload photo successfully"
```

## Test Structure

```
tests/
├── e2e/
│   ├── helpers.ts              # Shared utilities (login, logout, etc.)
│   ├── 01-auth.spec.ts
│   ├── 02-upload.spec.ts
│   ├── 03-gallery.spec.ts
│   ├── 04-public-gallery.spec.ts
│   ├── 05-bulk-operations.spec.ts
│   ├── 06-search-export.spec.ts
│   ├── 07-client-event.spec.ts
│   ├── 11-rate-limiting.spec.ts
│   ├── 12-security.spec.ts
│   └── 13-error-handling.spec.ts
└── fixtures/
    ├── README.md
    ├── test-photo.jpg
    ├── test-photo.png
    ├── test-photo.heic
    ├── invalid-file.txt
    └── large-file.jpg
```

## Test Helpers

### Login Helper
```typescript
import { login } from './helpers';

test('my test', async ({ page }) => {
  await login(page);
  // Now authenticated
});
```

### Generate Test Data
```typescript
import { generateTestData } from './helpers';

const testData = generateTestData();
// Returns: { clientName, eventName, galleryName, packageName }
```

### Wait for Toast
```typescript
import { waitForToast } from './helpers';

await waitForToast(page, 'Gallery created');
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Clean State**: Use `beforeEach` to reset state
3. **Explicit Waits**: Use `waitForSelector`, `waitForURL`, not `waitForTimeout`
4. **Data Attributes**: Use `data-testid` for stable selectors
5. **Error Screenshots**: Automatically captured on failure

## Troubleshooting

### Tests Failing Locally
```bash
# Clear browser cache
npx playwright clean

# Reinstall browsers
npx playwright install --force chromium
```

### Timeout Issues
Increase timeout in `playwright.config.ts`:
```typescript
use: {
  timeout: 30000, // 30 seconds
}
```

### Database State Issues
```bash
# Reset database
npm run db:push --force-reset
npm run db:seed
```

## Reports

After running tests, view HTML report:
```bash
npx playwright show-report
```

## Notes

- Tests run in **serial mode** (not parallel) to avoid race conditions
- Dev server starts automatically via `webServer` config
- Screenshots captured on failure in `test-results/`
- Traces available for debugging failed tests

## Next Steps

1. Add more test fixtures
2. Integrate with CI/CD pipeline
3. Add visual regression tests
4. Add performance tests
5. Add accessibility tests (a11y)
