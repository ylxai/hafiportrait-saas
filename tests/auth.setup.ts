import { test as setup } from "@playwright/test";
import { TEST_USER } from "./e2e/helpers";
import { AdminPage } from "./e2e/pages/admin";

const adminAuthFile = "playwright/.auth/admin.json";

setup("authenticate as admin", async ({ page }) => {
  const adminPage = new AdminPage(page);
  await adminPage.login(TEST_USER.email, TEST_USER.password);
  await page.context().storageState({ path: adminAuthFile });
});
