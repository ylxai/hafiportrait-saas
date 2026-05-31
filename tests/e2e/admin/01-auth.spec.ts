import { test, expect, TEST_USER } from "../fixtures/auth";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Authentication Flow", () => {
  test("should login with valid credentials", async ({ adminPage }) => {
    await adminPage.login(TEST_USER.email, TEST_USER.password);
    await adminPage.expectToBeOnAdminPage();
  });

  test("should reject invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("wrong@email.com");
    await page.getByLabel(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /submit|masuk/i }).click();

    await expect(page.getByText("Email atau password salah")).toBeVisible();
  });

  test("should persist session after refresh", async ({ adminPage }) => {
    await adminPage.login(TEST_USER.email, TEST_USER.password);

    await adminPage["page"].reload();
    await adminPage["page"].waitForURL("/admin");
    await adminPage.expectToBeOnAdminPage();
  });

  test("should logout successfully", async ({ adminPage }) => {
    await adminPage.login(TEST_USER.email, TEST_USER.password);
    await adminPage.logout();
    await adminPage.expectToBeOnLoginPage();
  });

  test("should redirect to login when accessing protected route", async ({
    page,
    adminPage,
  }) => {
    await page.goto("/admin/galleries");
    await adminPage.expectToBeOnLoginPage();
  });

  test("should show loading state during login", async ({ page, adminPage }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);

    let delayedAuthRequest = false;
    await page.route("**/api/auth/callback/admin-credentials", async (route) => {
      if (!delayedAuthRequest) {
        delayedAuthRequest = true;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      await route.continue();
    });

    const submitButton = page.getByRole("button").first();
    await submitButton.click();

    await expect(submitButton).toBeDisabled();
    await adminPage.expectToBeOnAdminPage();
  });

  test("should handle session expiry", async ({ page, context, adminPage }) => {
    await adminPage.login(TEST_USER.email, TEST_USER.password);

    // Clear cookies to simulate session expiry
    await context.clearCookies();

    await page.goto("/admin/galleries");
    await adminPage.expectToBeOnLoginPage();
  });
});
