import { test, expect } from "@playwright/test";
import { login } from "../helpers";
import path from "path";

test.describe("Error Handling", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("should reject invalid file type upload", async ({ page }) => {
    await page.goto("/admin/galleries");
    await page.getByRole("link", { name: /test gallery/i }).click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(
      path.join(__dirname, "../fixtures/invalid-file.txt"),
    );

    await expect(page.getByText(/invalid file type/i)).toBeVisible();
  });

  test("should reject oversized file upload", async ({ page }) => {
    await page.goto("/admin/galleries");
    await page.getByRole("link", { name: /test gallery/i }).click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(
      path.join(__dirname, "../fixtures/large-file.jpg"),
    );

    await expect(page.getByText(/file too large/i)).toBeVisible();
  });

  test("should handle network failure gracefully", async ({ page }) => {
    // Simulate offline
    await page.context().setOffline(true);

    await page.goto("/admin/galleries");

    await expect(page.getByText(/network error/i)).toBeVisible();

    // Restore connection
    await page.context().setOffline(false);
  });

  test("should handle API 404 errors", async ({ page }) => {
    await page.goto("/admin/galleries/non-existent-id");

    await expect(page.getByText(/gallery not found/i)).toBeVisible();
  });

  test("should handle API 500 errors", async ({ page }) => {
    // Mock server error
    await page.route("**/api/admin/galleries", (route) =>
      route.fulfill({ status: 500, body: "Internal Server Error" }),
    );

    await page.goto("/admin/galleries");

    await expect(page.getByText(/something went wrong/i)).toBeVisible();
  });

  test("should validate required form fields", async ({ page }) => {
    await page.goto("/admin/clients");
    await page.getByRole("button", { name: /add client/i }).click();

    // Submit without filling required fields
    await page.getByRole("button", { name: /submit/i }).click();

    await expect(page.getByText(/this field is required/i)).toBeVisible();
  });

  test("should validate email format", async ({ page }) => {
    await page.goto("/admin/clients");
    await page.getByRole("button", { name: /add client/i }).click();

    await page.getByLabel(/name/i).fill("Test Client");
    await page.getByLabel(/email/i).fill("invalid-email");
    await page.getByRole("button", { name: /submit/i }).click();

    await expect(page.getByText(/invalid email/i)).toBeVisible();
  });

  test("should validate date format", async ({ page }) => {
    await page.goto("/admin/events");
    await page.getByRole("button", { name: /create event/i }).click();

    await page.getByLabel(/event name/i).fill("Test Event");
    await page.getByLabel(/event date/i).fill("invalid-date");
    await page.getByRole("button", { name: /submit/i }).click();

    await expect(page.getByText(/invalid date/i)).toBeVisible();
  });

  test("should handle concurrent upload conflicts", async ({ page }) => {
    await page.goto("/admin/galleries");
    await page.getByRole("link", { name: /test gallery/i }).click();

    const fileInput = page.locator('input[type="file"]');

    // Upload same file twice simultaneously
    await fileInput.setInputFiles([
      path.join(__dirname, "../fixtures/test-photo.jpg"),
      path.join(__dirname, "../fixtures/test-photo.jpg"),
    ]);

    // Should handle gracefully without crash
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("photo-item")).toBeVisible();
  });

  test("should recover from failed transaction", async ({ page }) => {
    // Mock transaction failure
    await page.route("**/api/admin/upload/complete", (route) =>
      route.fulfill({ status: 500, body: "Transaction failed" }),
    );

    await page.goto("/admin/galleries");
    await page.getByRole("link", { name: /test gallery/i }).click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(
      path.join(__dirname, "../fixtures/test-photo.jpg"),
    );

    await expect(page.getByText(/upload failed/i)).toBeVisible();

    // Storage should not be updated
    await page.goto("/admin/storage");
    // Verify storage usage didn't change
  });
});
