# E2E Test Improvement Tasks

> Updated: 2026-05-08 - Most tasks completed, remaining fixes documented.

---

## Current Status

### ✅ Completed

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Locator Strategy | ✅ Done | Semantic locators in most files |
| Phase 2: Assertions | ✅ Done | Web-first assertions used |
| Phase 3: POM | ✅ Done | AdminPage, ClientPortalPage created |
| Phase 4: Auth Setup | ✅ Done | auth.setup.ts + fixtures |

---

## Remaining Issues

### 🔴 P0 - High Priority

#### Task R1 — Fix helpers.ts
File: `tests/e2e/helpers.ts` (line 60-62)

```typescript
// ❌ Still using old locators
await page.fill('input[type="email"]', email);
await page.click('button[type="submit"]');

// ✅ Should be
await page.getByLabel(/email/i).fill(email);
await page.getByRole('button', { name: /submit|kirim/i }).click();
```

#### Task R2 — Fix rate-limiting tests
File: `tests/e2e/integration/01-rate-limiting.spec.ts`

| Line | Issue | Fix |
|------|-------|-----|
| 14 | CSS selector | Use `getByTestId` |
| 36 | text selector | Use `getByText` |
| 59 | `waitForTimeout(61000)` | Acceptable for test, but document why |

#### Task R3 — Empty test file
File: `tests/e2e/admin/02-upload.spec.ts`

- Status: Empty (0 lines)
- Action: Remove or implement

---

## File Structure (All Created)

```
tests/
├── auth.setup.ts                    # Auth setup
├── e2e/
│   ├── helpers.ts                   # Helper functions
│   ├── pages/
│   │   ├── admin.ts                 # AdminPage POM
│   │   ├── client-portal.ts         # ClientPortalPage POM
│   │   └── index.ts
│   ├── fixtures/
│   │   ├── auth.ts                  # Auth fixtures
│   │   ├── db-seed.ts               # Database seeding
│   │   └── db-cleanup.ts            # Database cleanup
│   ├── constants/
│   │   └── http-status.ts           # HTTP status codes
│   ├── admin/                       # 9 test files
│   ├── client-portal/               # 5 test files
│   ├── public/                      # 3 test files
│   └── integration/                 # 3 test files
```

---

## Test Coverage Summary

| Category | Files | Description |
|----------|-------|-------------|
| Admin | 9 | Auth, upload, gallery, stats, bulk, search, events, client CRUD |
| Client Portal | 5 | Auth, dashboard, gallery selection, invoices, profile |
| Public | 3 | Gallery, photo selection, booking |
| Integration | 3 | Rate limiting, security, error handling |
| **Total** | **20** | **259 test cases** |

---

## Playwright MCP Integration

### Already Available

MCP server configured in `~/.kiro/settings/mcp.json`:

```json
"playwright": {
  "command": "npx",
  "args": ["@playwright/mcp@latest"],
  "disabled": false
}
```

### Available Tools (40+)

| Category | Tools |
|----------|-------|
| **Navigation** | `browser_navigate`, `browser_navigate_back`, `browser_reload`, `browser_close` |
| **Interaction** | `browser_click`, `browser_hover`, `browser_drag`, `browser_press_key` |
| **Forms** | `browser_type`, `browser_fill_form`, `browser_check`, `browser_select_option` |
| **Assertions** | `browser_verify_element_visible`, `browser_verify_text_visible`, `browser_generate_locator` |
| **Debugging** | `browser_run_code`, `browser_console_messages`, `browser_take_screenshot`, `browser_start_tracing` |

### Usage

AI agents can now use MCP tools for:
- Exploratory testing
- Visual verification
- Generate test code from automation
- Test form validation

---

## Verification Commands

```bash
# Run all tests
npx playwright test

# Run specific project
npx playwright test --project=admin
npx playwright test --project=client
npx playwright test --project=public
npx playwright test --project=integration

# View HTML report
npx playwright show-report
```

---

## Next Steps

1. **Fix remaining issues** (R1, R2, R3)
2. **Add more API tests** - Already excellent in 03-gallery.spec.ts
3. **Consider Playwright MCP** for exploratory automation
4. **Add visual regression tests** if needed

---

## Reference Docs

- https://playwright.dev/docs/best-practices
- https://playwright.dev/docs/locators
- https://playwright.dev/docs/test-assertions
- https://playwright.dev/docs/pom
- https://playwright.dev/mcp/introduction
- https://kiro.dev/docs/cli/custom-agents

---

*Generated 2026-05-08*
*Updated 2026-05-08 - Most tasks completed*