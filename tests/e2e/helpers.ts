import { Page } from '@playwright/test';

export const TEST_USER = {
  email: 'admin@photostudio.com',
  password: 'admin123',
};

export async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', TEST_USER.email);
  await page.fill('input[name="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/admin');
}

export async function logout(page: Page) {
  await page.click('[data-testid="user-menu"]');
  await page.click('text=Logout');
  await page.waitForURL('/login');
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
