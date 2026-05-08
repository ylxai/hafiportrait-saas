# E2E Test Improvement Tasks

> Review dan perbaiki E2E tests Playwright sesuai official best practices.

---

## Problem

E2E tests di folder `tests/e2e/` memiliki beberapa masalah:

1. **Locator strategy tidak stabil** — menggunakan CSS selector dan XPath, tidak resilient terhadap perubahan UI
2. **Manual assertions** — menggunakan `waitForSelector` bukan web-first assertions, menyebabkan flaky tests
3. **Tidak ada Page Object Model** — banyak duplikasi kode
4. **Test ID tidak konsisten** — beberapa pakai, banyak yang tidak
5. **Authentication tidak optimal** — setiap test login ulang, tidak ada cached auth state
6. **Hardcoded wait** — pakai `waitForTimeout` yang tidak perlu karena Playwright sudah auto-wait

---

## Reference

- Playwright Best Practices: https://playwright.dev/docs/best-practices
- Locators: https://playwright.dev/docs/locators
- Assertions: https://playwright.dev/docs/test-assertions
- POM: https://playwright.dev/docs/pom
- Auth: https://playwright.dev/docs/auth

---

## Phase 1: Fix Locator Strategy 🔴 P0

> 2 jam. Ubah semua selector ke user-facing locators.

### Task 1.1 — Update admin auth tests
File: `tests/e2e/admin/01-auth.spec.ts`

| Sebelum | Sesudah |
|---------|---------|
| `page.fill('input[name="email"]', ...)` | `page.getByLabel(/email/i).fill(...)` |
| `page.fill('input[name="password"]', ...)` | `page.getByLabel(/password/i).fill(...)` |
| `page.click('button[type="submit"]')` | `page.getByRole('button', { name: /submit|masuk/i }).click()` |
| `page.locator("text=Email atau password salah")` | `page.getByText('Email atau password salah')` |
| `page.click("text=Logout")` | `page.getByRole('button', { name: /logout/i }).click()` |

### Task 1.2 — Update client-portal auth tests
File: `tests/e2e/client-portal/01-magic-link-auth.spec.ts`

| Sebelum | Sesudah |
|---------|---------|
| `page.fill('input[type="email"]', ...)` | `page.getByLabel(/email/i).fill(...)` |
| `page.click('button[type="submit"]')` | `page.getByRole('button', { name: /submit|kirim/i }).click()` |
| `text=Link masuk telah dikirim` | `page.getByText('Link masuk telah dikirim')` |

### Task 1.3 — Update all other test files
Review dan update semua file di:
- `tests/e2e/admin/*.spec.ts`
- `tests/e2e/client-portal/*.spec.ts`
- `tests/e2e/public/*.spec.ts`
- `tests/e2e/integration/*.spec.ts`

Ganti semua:
- `page.locator('input[name="..."]')` → `page.getByLabel(...)`
- `page.click('button[type="..."]')` → `page.getByRole('button', ...)`
- CSS selectors → role-based locators

---

## Phase 2: Fix Assertions 🟡 P1

> 1 jam. Ganti manual assertions ke web-first assertions.

### Task 2.1 — Update helpers.ts
File: `tests/e2e/helpers.ts`

```typescript
// ❌ Sebelum (manual assertion)
export async function waitForToast(page: Page, message: string) {
  await page.waitForSelector(`text=${message}`, { timeout: 5000 });
}

// ✓ Sesudah (web-first assertion)
export async function waitForToast(page: Page, message: string) {
  await expect(page.getByText(message)).toBeVisible({ timeout: 5000 });
}
```

### Task 2.2 — Update rate-limiting tests
File: `tests/e2e/integration/01-rate-limiting.spec.ts`

Hapus semua `page.waitForTimeout(100)` — Playwright sudah auto-wait.

---

## Phase 3: Create Page Object Model 🟡 P1

> 3 jam. Kurangi duplikasi dengan POM.

### Task 3.1 — Create admin POM
File: `tests/e2e/pages/admin.ts`

```typescript
import { test as base, Page } from '@playwright/test';

export class AdminPage {
  constructor(private page: Page) {}

  async login(email: string, password: string) {
    await this.page.goto('/login');
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
    await this.page.getByRole('button', { name: /masuk/i }).click();
    await this.page.waitForURL('/admin');
  }

  async logout() {
    await this.page.click('[data-testid="user-menu"]');
    await this.page.getByRole('button', { name: /logout/i }).click();
  }
}

export const adminPage = base.extend<{ adminPage: AdminPage }>({
  adminPage: async ({ page }, use) => {
    await use(new AdminPage(page));
  },
});
```

### Task 3.2 — Create client-portal POM
File: `tests/e2e/pages/client-portal.ts`

```typescript
export class ClientPortalPage {
  constructor(private page: Page) {}

  async login(email: string) {
    await this.page.goto('/portal/login');
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByRole('button', { name: /kirim/i }).click();
  }

  async verifyMagicLink(token: string) {
    await this.page.goto(`/portal/verify?token=${token}`);
    await this.page.waitForURL('/portal/dashboard');
  }
}
```

### Task 3.3 — Update tests to use POM
Refactor semua test files untuk gunakan POM yang sudah dibuat.

---

## Phase 4: Add Setup Project for Auth 🟢 P2

> 1 jam. Cache authenticated state.

### Task 4.1 — Create auth setup
File: `tests/e2e/fixtures/auth.ts`

```typescript
import { test as base, chromium, BrowserContext } from '@playwright/test';
import { login } from './helpers';

export const test = base.extend<{
  authenticatedContext: BrowserContext;
  adminPage: any;
  clientPage: any;
}>({
  authenticatedContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page);
    await use(context);
    await context.close();
  },
});
```

---

## File Summary

### File Baru
```
tests/e2e/
├── pages/
│   ├── admin.ts
│   ├── client-portal.ts
│   └── index.ts
└── fixtures/
    └── auth.ts
```

### File Dimodifikasi
| File | Perubahan |
|------|-----------|
| `tests/e2e/helpers.ts` | Fix waitForToast → web-first assertion |
| `tests/e2e/admin/01-auth.spec.ts` | Update to getByRole |
| `tests/e2e/client-portal/01-magic-link-auth.spec.ts` | Update to getByRole |
| `tests/e2e/integration/01-rate-limiting.spec.ts` | Remove waitForTimeout |
| `playwright.config.ts` | +setupProject untuk cached auth |

---

## Progress Tracker

| # | Phase | Status | Task | Effort |
|---|-------|--------|------|--------|
| 1.1 | P0 🔴 | ✅ | Fix admin auth locators | 20m |
| 1.2 | P0 🔴 | ✅ | Fix client-portal auth locators | 20m |
| 1.3 | P0 🔴 | ✅ | Fix all other test files | 80m |
| 2.1 | P1 🟡 | ✅ | Fix helpers.ts assertions | 20m |
| 2.2 | P1 🟡 | ✅ | Fix rate-limiting tests | 40m |
| 3.1 | P1 🟡 | ✅ | Create admin POM | 60m |
| 3.2 | P1 🟡 | ✅ | Create client-portal POM | 60m |
| 3.3 | P1 🟡 | ✅ | Refactor tests to use POM | 60m |
| 4.1 | P2 🟢 | ✅ | Add auth setup project | 60m |

| Phase | Effort |
|-------|--------|
| P0 🔴 | 2 jam |
| P1 🟡 | 4 jam |
| P2 🟢 | 1 jam |
| **Total** | **~7 jam** |

---

## Verification

Setelah semua task selesai, jalankan:

```bash
npx playwright test
npx playwright show-report
```

Pastikan:
- Semua test passed
- Tidak ada warning tentang deprecated locators
- Trace viewer menunjukkan locator使用的是 role-based

---

*Generated 2026-05-08*