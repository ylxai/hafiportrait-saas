import { Page, expect } from "@playwright/test";
import * as jwt from "jsonwebtoken";

export const TEST_USER = {
  email: "admin@photostudio.com",
  password: "admin123",
};

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(TEST_USER.email);
  await page.getByLabel(/password/i).fill(TEST_USER.password);
  await page.getByRole("button", { name: /submit|masuk/i }).click();
  await page.waitForURL("/admin");
}

export async function logout(page: Page) {
  await page.click('[data-testid="user-menu"]');
  await page.getByText("Logout").click();
  await page.waitForURL("/login");
}

export function generateTestData() {
  const timestamp = Date.now();
  return {
    clientName: `Test Client ${timestamp}`,
    eventName: `Test Event ${timestamp}`,
    galleryName: `Test Gallery ${timestamp}`,
    packageName: `Test Package ${timestamp}`,
  };
}

export async function waitForToast(page: Page, message: string) {
  await expect(page.getByText(message)).toBeVisible();
}

// Client Portal Auth Helpers
export function generateMagicLinkToken(
  clientId: string,
  clientEmail: string,
): string {
  const secret = process.env.NEXTAUTH_SECRET || "test-secret";
  return jwt.sign({ clientId, email: clientEmail }, secret, {
    expiresIn: "15m",
  });
}

export async function loginAsClient(
  page: Page,
  clientId: string,
  clientEmail: string,
) {
  const token = generateMagicLinkToken(clientId, clientEmail);
  await page.goto(`/portal/verify?token=${token}`);
  await page.waitForURL("/portal/dashboard", { timeout: 10000 });
}

export async function requestMagicLink(page: Page, email: string) {
  await page.goto("/portal/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole("button", { name: /submit|kirim/i }).click();
  await waitForToast(page, "Link masuk telah dikirim");
}

export async function accessGalleryAsClient(page: Page, galleryToken: string) {
  await page.goto(`/gallery/${galleryToken}`);
  await page.waitForLoadState("networkidle");
}
