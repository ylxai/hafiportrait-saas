---
name: playwright-testing
description: E2E testing patterns with Playwright
license: MIT
compatibility: opencode
---

# Playwright Testing

## What It Does
Browser automation and end-to-end testing for web applications.

## When to Use
- Writing E2E tests
- Testing user flows
- Debugging UI issues
- Taking screenshots
- Automating browser tasks

## Test Structure
```typescript
import { test, expect } from '@playwright/test';

test('login flow', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name=email]', 'test@example.com');
  await page.click('[type=submit]');
  await expect(page).toHaveURL('/dashboard');
});
```

## Running Tests
```bash
npm run test:e2e        # Run all tests
npm run test:e2e:ui    # UI mode
npm run test:e2e:headed # Headed mode
```

## Best Practices
- Test critical user paths first
- Use selectors that are stable
- Clean up test data after tests
- Run tests in CI/CD pipeline