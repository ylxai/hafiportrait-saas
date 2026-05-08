import { Page, expect } from "@playwright/test";

export class AdminPage {
  constructor(private page: Page) {}

  async login(email: string, password: string) {
    await this.page.goto("/login");
    await this.page.getByLabel(/email/i).fill(email);
    await this.page.getByLabel(/password/i).fill(password);
    await this.page.getByRole("button", { name: /submit|masuk/i }).click();
    await this.page.waitForURL("/admin");
  }

  async logout() {
    await this.page.click('[data-testid="user-menu"]');
    await this.page.getByText("Logout").click();
    await this.page.waitForURL("/login");
  }

  async expectToBeOnAdminPage() {
    await expect(this.page).toHaveURL(/\/admin/);
  }

  async expectToBeOnLoginPage() {
    await expect(this.page).toHaveURL(/\/login/);
  }
}
