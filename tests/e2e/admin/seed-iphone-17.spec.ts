import { test, expect } from '@playwright/test';

// Admin credentials: admin@photostudio.com | admin123
const TEST_USER = {
  email: 'admin@photostudio.com',
  password: 'admin123'
};

test.describe('Admin Login - iPhone 17 Pro Max (Large)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
  });

  test('seed - admin login on iPhone 17 Pro Max', async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /masuk/i }).click();
    await expect(page).toHaveURL(/\/admin/);
  });

  test('seed - reject invalid credentials on iPhone 17 Pro Max', async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    await page.getByLabel(/email/i).fill('wrong@email.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /masuk/i }).click();
    await expect(page.getByText(/email atau password salah/i)).toBeVisible();
  });
});