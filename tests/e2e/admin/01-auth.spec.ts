import { test, expect } from "@playwright/test";
import { TEST_USER } from "../helpers";

test.describe("Authentication Flow", () => {
  test("should login with valid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    await page.waitForURL("/admin");
    await expect(page).toHaveURL(/\/admin/);
  });

  test("should reject invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "wrong@email.com");
    await page.fill('input[name="password"]', "wrongpassword");
    await page.click('button[type="submit"]');

    await expect(page.locator("text=Email atau password salah")).toBeVisible();
  });

  test("should persist session after refresh", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL("/admin");

    await page.reload();
    await page.waitForURL("/admin");
    await expect(page).toHaveURL(/\/admin/);
  });

  test("should logout successfully", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL("/admin");

    await page.click('[data-testid="user-menu"]');
    await page.click("text=Logout");

    await expect(page).toHaveURL(/\/login/);
  });

  test("should redirect to login when accessing protected route", async ({
    page,
  }) => {
    await page.goto("/admin/galleries");
    await page.waitForURL("/login");
    await expect(page).toHaveURL(/\/login/);
  });

  test("should show loading state during login", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    await expect(submitButton).toBeDisabled();
  });

  test("should handle session expiry", async ({ page, context }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL("/admin");

    // Clear cookies to simulate session expiry
    await context.clearCookies();

    await page.goto("/admin/galleries");
    await page.waitForURL("/login");
    await expect(page).toHaveURL(/\/login/);
  });
});
