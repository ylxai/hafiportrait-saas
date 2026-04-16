# Test Environment Setup

Complete guide for setting up E2E testing environment.

## Prerequisites

- Node.js 20+
- PostgreSQL database
- npm or yarn

## 1. Install Dependencies

```bash
npm install
npx playwright install chromium
```

## 2. Database Setup

### Create Test Database (Optional)
```bash
# Create separate test database
createdb photostudio_test

# Update .env.test
DATABASE_URL="postgresql://user:password@localhost:5432/photostudio_test"
```

### Run Migrations
```bash
npm run db:push
```

### Seed Test Data
```bash
npm run db:seed
```

## 3. Generate Test Fixtures

### Automatic Generation (Recommended)
```bash
npm run test:fixtures
```

This creates:
- `test-photo.jpg` (1x1 px, ~200 bytes)
- `test-photo.png` (1x1 px, ~67 bytes)
- `test-photo.heic` (placeholder)
- `large-file.jpg` (51 MB for size validation)

### Manual Setup (Optional)
If you want real images for testing:

1. Add valid images to `tests/fixtures/`:
   - `test-photo.jpg` - JPEG < 10MB
   - `test-photo.png` - PNG < 10MB
   - `test-photo.heic` - HEIC < 10MB
   - `large-file.jpg` - JPEG > 50MB

2. Keep `invalid-file.txt` (already included)

## 4. Environment Variables

### Required Variables
```bash
# .env or .env.test
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# Storage (from database, not .env)
# R2 and Cloudinary credentials stored in StorageAccount table

# Optional for tests
BASE_URL="http://localhost:3000"
```

## 5. Test User Setup

Default test user (from seed):
```
Email: admin@photostudio.test
Password: admin123
```

Update in `tests/e2e/helpers.ts` if different:
```typescript
export const TEST_USER = {
  email: 'your-email@test.com',
  password: 'your-password',
};
```

## 6. Storage Accounts Setup

Tests require at least one active storage account in database:

```sql
-- Check existing storage accounts
SELECT * FROM "StorageAccount" WHERE "isActive" = true;

-- Or seed via Prisma
npm run db:seed
```

## 7. Verify Setup

### Check Database Connection
```bash
npx prisma studio
```

### Check Test Fixtures
```bash
ls -lh tests/fixtures/
```

Should show:
```
-rw-r--r-- test-photo.jpg
-rw-r--r-- test-photo.png
-rw-r--r-- test-photo.heic
-rw-r--r-- large-file.jpg
-rw-r--r-- invalid-file.txt
```

### Run Health Check
```bash
npm run dev
# Visit http://localhost:3000/login
# Try logging in with test credentials
```

## 8. Run Tests

### First Time Setup
```bash
# Generate fixtures
npm run test:fixtures

# Run tests in UI mode (recommended)
npm run test:e2e:ui
```

### Regular Testing
```bash
# Headless mode
npm run test:e2e

# UI mode (interactive)
npm run test:e2e:ui

# Headed mode (see browser)
npm run test:e2e:headed

# Debug mode
npm run test:e2e:debug
```

## Troubleshooting

### Tests Fail: "Cannot find test fixtures"
```bash
npm run test:fixtures
```

### Tests Fail: "Invalid credentials"
Check test user exists:
```bash
npx prisma studio
# Navigate to User table
# Verify admin@photostudio.test exists
```

### Tests Fail: "Database connection error"
```bash
# Check DATABASE_URL in .env
# Verify PostgreSQL is running
pg_isready
```

### Tests Fail: "Storage account not found"
```bash
# Seed database
npm run db:seed

# Or manually create storage account via admin UI
```

### Playwright Browser Issues
```bash
# Reinstall browsers
npx playwright install --force chromium

# Clear cache
npx playwright clean
```

### Port Already in Use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
BASE_URL=http://localhost:3001 npm run test:e2e
```

## CI/CD Setup

### GitHub Actions Example
```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      
      - run: npm ci
      
      - run: npx playwright install --with-deps chromium
      
      - name: Setup database
        run: |
          npm run db:push
          npm run db:seed
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
      
      - name: Generate fixtures
        run: npm run test:fixtures
      
      - name: Run tests
        run: npm run test:e2e
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
          NEXTAUTH_SECRET: test-secret
          NEXTAUTH_URL: http://localhost:3000
      
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Test Data Management

### Reset Test Data
```bash
# Reset database
npm run db:push --force-reset

# Reseed
npm run db:seed
```

### Clean Up After Tests
Tests should clean up their own data, but if needed:
```bash
# Manual cleanup via Prisma Studio
npx prisma studio
```

## Performance Tips

1. **Use UI mode for development** - Faster feedback loop
2. **Run specific tests** - `npx playwright test 01-auth.spec.ts`
3. **Parallel execution** - Update `playwright.config.ts` workers
4. **Skip slow tests** - Use `test.skip()` for development

## Security Notes

- Never commit `.env` files
- Use separate test database
- Test credentials should be different from production
- Fixtures are in `.gitignore` (except invalid-file.txt)

## Next Steps

After setup:
1. Run `npm run test:e2e:ui` to verify all tests pass
2. Review test coverage in `tests/README.md`
3. Add more test cases as needed
4. Integrate with CI/CD pipeline
