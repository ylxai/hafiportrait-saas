import { Page } from "@playwright/test";
import * as jwt from "jsonwebtoken";

export const TEST_USER = {
  email: "admin@photostudio.com",
  password: "admin123",
};

export async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_USER.email);
  await page.fill('input[name="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/admin");
}

export async function logout(page: Page) {
  await page.click('[data-testid="user-menu"]');
  await page.click("text=Logout");
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
  await page.waitForSelector(`text=${message}`, { timeout: 5000 });
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
  await page.fill('input[type="email"]', email);
  await page.click('button[type="submit"]');
  await waitForToast(page, "Link masuk telah dikirim");
}

export async function accessGalleryAsClient(page: Page, galleryToken: string) {
  await page.goto(`/gallery/${galleryToken}`);
  await page.waitForLoadState("networkidle");
}
