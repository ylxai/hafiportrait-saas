import { Page, expect } from "@playwright/test";
import * as jwt from "jsonwebtoken";

export class ClientPortalPage {
  constructor(private page: Page) {}

  generateMagicLinkToken(clientId: string, clientEmail: string): string {
    const secret = process.env.NEXTAUTH_SECRET || "test-secret";
    return jwt.sign({ clientId, email: clientEmail }, secret, {
      expiresIn: "15m",
    });
  }

  async loginWithMagicLink(clientId: string, clientEmail: string) {
    const token = this.generateMagicLinkToken(clientId, clientEmail);
    await this.page.goto(`/portal/verify?token=${token}`);
    await this.page.waitForURL("/portal/dashboard", { timeout: 10000 });
  }

  async requestMagicLink(email: string) {
    await this.page.goto("/portal/login");
    await this.page.fill('input[type="email"]', email);
    await this.page.click('button[type="submit"]');
    await expect(this.page.getByText("Link masuk telah dikirim")).toBeVisible();
  }

  async accessGallery(galleryToken: string) {
    await this.page.goto(`/gallery/${galleryToken}`);
    await this.page.waitForLoadState("networkidle");
  }

  async expectToBeOnDashboard() {
    await expect(this.page).toHaveURL(/\/portal\/dashboard/);
  }
}
