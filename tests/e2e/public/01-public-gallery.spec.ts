import { test, expect } from "@playwright/test";

test.describe("Public Gallery Access", () => {
  const VALID_TOKEN = "test-gallery-token-123";
  const INVALID_TOKEN = "invalid-token-xyz";

  test("should access gallery without authentication", async ({ page }) => {
    await page.goto(`/gallery/${VALID_TOKEN}`);

    // Should NOT redirect to login
    await expect(page).toHaveURL(/\/gallery\//);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("should access gallery with valid token", async ({ page }) => {
    await page.goto(`/gallery/${VALID_TOKEN}`);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Gallery",
    );
    await expect(page.locator('[data-testid="photo-grid"]')).toBeVisible();
  });

  test("should show 404 for invalid token", async ({ page }) => {
    await page.goto(`/gallery/${INVALID_TOKEN}`);

    await expect(page.getByText("Gallery not found")).toBeVisible();
  });

  test("should select and deselect photos", async ({ page }) => {
    await page.goto(`/gallery/${VALID_TOKEN}`);

    // Select photo
    const firstPhoto = page.locator('[data-testid="photo-card"]').first();
    await firstPhoto.click();
    await expect(firstPhoto.locator('[data-selected="true"]')).toBeVisible();

    // Deselect photo
    await firstPhoto.click();
    await expect(
      firstPhoto.locator('[data-selected="true"]'),
    ).not.toBeVisible();
  });

  test("should submit photo selection", async ({ page }) => {
    await page.goto(`/gallery/${VALID_TOKEN}`);

    // Select multiple photos
    await page.locator('[data-testid="photo-card"]').first().click();
    await page.locator('[data-testid="photo-card"]').nth(1).click();

    // Submit selection
    await page.getByRole("button", { name: /submit/i }).click();

    await expect(page.getByText(/berhasil|success/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test("should download selected photos", async ({ page }) => {
    await page.goto(`/gallery/${VALID_TOKEN}`);

    // Select photos
    await page.locator('[data-testid="photo-card"]').first().click();

    // Download
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /download/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain(".zip");
  });

  test("should show locked message for locked gallery", async ({ page }) => {
    await page.goto(`/gallery/${VALID_TOKEN}`);

    // Check if gallery is locked
    const lockedMessage = page.getByText(/terkunci|locked/i);
    if (await lockedMessage.isVisible()) {
      await expect(lockedMessage).toBeVisible();
      const photoCard = page.locator('[data-testid="photo-card"]').first();
      const isDisabled = await photoCard.evaluate(
        (el) =>
          el.hasAttribute("disabled") ||
          el.classList.contains("pointer-events-none"),
      );
      expect(isDisabled).toBeTruthy();
    }
  });

  test("should view photo in lightbox", async ({ page }) => {
    await page.goto(`/gallery/${VALID_TOKEN}`);

    await page.locator('[data-testid="photo-card"]').first().dblclick();

    await expect(page.locator('[data-testid="lightbox"]')).toBeVisible();

    // Close lightbox
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="lightbox"]')).not.toBeVisible();
  });
});
