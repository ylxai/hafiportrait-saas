import { Page } from "@playwright/test";
import jwt from "jsonwebtoken";

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
export function generateMagicLinkToken(clientEmail: string): string {
  const secret = process.env.NEXTAUTH_SECRET || "test-secret";
  return jwt.sign({ email: clientEmail, type: "magic-link" }, secret, {
    expiresIn: "15m",
  });
}

export async function loginAsClient(page: Page, clientEmail: string) {
  const token = generateMagicLinkToken(clientEmail);
  await page.goto(`/client/auth/verify?token=${token}`);
  await page.waitForURL("/client/dashboard");
}

export async function accessGalleryAsClient(page: Page, clientToken: string) {
  await page.goto(`/gallery/${clientToken}`);
  await page.waitForLoadState("networkidle");
}
