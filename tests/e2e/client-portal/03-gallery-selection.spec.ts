import { test, expect } from "@playwright/test";
import {
  seedClient,
  seedEvent,
  seedGallery,
  seedPhoto,
  prisma,
} from "../fixtures/db-seed";
import { cleanupByEmail } from "../fixtures/db-cleanup";
import { loginAsClient } from "../helpers";

test.describe("Client Portal - Gallery Selection", () => {
  const testEmail = "client-gallery@test.com";
  const otherEmail = "other-client@test.com";
  let clientId: string;
  let otherClientId: string;
  let eventId: string;
  let otherEventId: string;
  let galleryId: string;
  let otherGalleryId: string;
  const photoIds: string[] = [];

  test.beforeAll(async () => {
    await cleanupByEmail(testEmail);
    await cleanupByEmail(otherEmail);

    const client = await seedClient({
      email: testEmail,
      nama: "Gallery Test Client",
    });
    clientId = client.id;

    const otherClient = await seedClient({
      email: otherEmail,
      nama: "Other Client",
    });
    otherClientId = otherClient.id;

    const event = await seedEvent(clientId, { namaProject: "Test Event" });
    eventId = event.id;

    const otherEvent = await seedEvent(otherClientId, {
      namaProject: "Other Event",
    });
    otherEventId = otherEvent.id;

    const gallery = await seedGallery(eventId, {
      namaProject: "Test Gallery",
      status: "published",
      maxSelection: 5,
    });
    galleryId = gallery.id;

    const otherGallery = await seedGallery(otherEventId, {
      namaProject: "Other Gallery",
      status: "published",
    });
    otherGalleryId = otherGallery.id;

    for (let i = 0; i < 12; i++) {
      const photo = await seedPhoto(galleryId, {
        filename: `photo-${i + 1}.jpg`,
      });
      photoIds.push(photo.id);
    }
  });

  test.afterAll(async () => {
    await cleanupByEmail(testEmail);
    await cleanupByEmail(otherEmail);
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsClient(page, clientId, testEmail);
    const gallery = await prisma.gallery.findUnique({
      where: { id: galleryId },
    });
    await page.goto(`/gallery/${gallery?.clientToken}`);
    await page.waitForLoadState("networkidle");
  });

  test("should view photos with pagination", async ({ page }) => {
    await expect(page.locator('img[alt*="photo"]').first()).toBeVisible();

    const photoCount = await page.locator('img[alt*="photo"]').count();
    expect(photoCount).toBeGreaterThan(0);
    expect(photoCount).toBeLessThanOrEqual(12);
  });

  test("should select and deselect photos", async ({ page }) => {
    const firstPhoto = page.locator('[data-testid="photo-card"]').first();
    await firstPhoto.click();

    await expect(firstPhoto.locator('[data-selected="true"]')).toBeVisible();

    await firstPhoto.click();
    await expect(
      firstPhoto.locator('[data-selected="true"]'),
    ).not.toBeVisible();
  });

  test("should enforce selection limit", async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await page.locator('[data-testid="photo-card"]').nth(i).click();
    }

    await page.locator('[data-testid="photo-card"]').nth(5).click();

    await expect(page.locator("text=/maksimal|limit/i")).toBeVisible();
  });

  test("should submit selection successfully", async ({ page }) => {
    await page.locator('[data-testid="photo-card"]').first().click();
    await page.locator('[data-testid="photo-card"]').nth(1).click();

    await page.click('button:has-text("Submit")');

    await expect(page.locator("text=/berhasil|success/i")).toBeVisible({
      timeout: 5000,
    });

    const selection = await prisma.selection.findFirst({
      where: { galleryId },
      include: { photos: true },
    });
    expect(selection?.photos.length).toBe(2);
  });

  test("should show locked state after submission", async ({ page }) => {
    await prisma.gallery.update({
      where: { id: galleryId },
      data: { isSelectionLocked: true },
    });

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=/terkunci|locked/i")).toBeVisible();

    const photoCard = page.locator('[data-testid="photo-card"]').first();
    const isDisabled = await photoCard.evaluate(
      (el) =>
        el.hasAttribute("disabled") ||
        el.classList.contains("pointer-events-none"),
    );
    expect(isDisabled).toBeTruthy();

    await prisma.gallery.update({
      where: { id: galleryId },
      data: { isSelectionLocked: false },
    });
  });

  test("should validate minimum selection", async ({ page }) => {
    await page.click('button:has-text("Submit")');

    await expect(page.locator("text=/pilih|select/i")).toBeVisible();
  });

  test("should not access other client galleries", async ({ page }) => {
    const otherGallery = await prisma.gallery.findUnique({
      where: { id: otherGalleryId },
    });

    await page.goto(`/gallery/${otherGallery?.clientToken}`);

    await expect(
      page.locator(
        "text=/tidak ditemukan|not found|akses ditolak|access denied/i",
      ),
    ).toBeVisible({ timeout: 5000 });
  });
});
