import { test, expect } from '@playwright/test';

// Admin credentials: admin@photostudio.com | admin123

test('seed - admin login setup', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await page.getByLabel(/email/i).fill('admin@photostudio.com');
  await page.getByLabel(/password/i).fill('admin123');
  await page.getByRole('button', { name: /masuk/i }).click();
  await expect(page).toHaveURL(/\/admin/);
});