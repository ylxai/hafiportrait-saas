/* eslint-disable react-hooks/rules-of-hooks */
import { test as base } from "@playwright/test";
import { AdminPage } from "../pages/admin";
import { ClientPortalPage } from "../pages/client-portal";

export const TEST_USER = {
  email: "admin@photostudio.com",
  password: "admin123",
};

type AuthFixtures = {
  adminPage: AdminPage;
  clientPortalPage: ClientPortalPage;
  authenticatedAdminPage: AdminPage;
  authenticatedContext: void;
};

export const test = base.extend<AuthFixtures>({
  adminPage: async ({ page }, use) => {
    const adminPage = new AdminPage(page);
    await use(adminPage);
  },

  clientPortalPage: async ({ page }, use) => {
    const clientPortalPage = new ClientPortalPage(page);
    await use(clientPortalPage);
  },

  authenticatedAdminPage: async ({ page }, use) => {
    const adminPage = new AdminPage(page);
    await adminPage.login(TEST_USER.email, TEST_USER.password);
    await use(adminPage);
  },

  authenticatedContext: async ({ context: _context }, use) => {
    // Context already has storageState loaded from config
    await use();
  },
});

export { expect } from "@playwright/test";
