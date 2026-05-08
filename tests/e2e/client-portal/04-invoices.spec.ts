import { test, expect } from "@playwright/test";
import {
  seedClient,
  seedEvent,
  seedPayment,
  prisma,
} from "../fixtures/db-seed";
import { cleanupByEmail } from "../fixtures/db-cleanup";
import { loginAsClient } from "../helpers";

test.describe("Client Portal - Invoices", () => {
  const testEmail = "client-invoices@test.com";
  let clientId: string;
  let eventId: string;
  const paymentIds: string[] = [];

  test.beforeAll(async () => {
    await cleanupByEmail(testEmail);

    const client = await seedClient({
      email: testEmail,
      nama: "Invoice Test Client",
    });
    clientId = client.id;

    const event = await seedEvent(clientId, {
      namaProject: "Test Event",
      totalPrice: 5000000,
      paidAmount: 2500000,
      paymentStatus: "partial",
    });
    eventId = event.id;

    const payment1 = await seedPayment(eventId, {
      amount: 2500000,
      type: "dp",
      method: "transfer",
      status: "approved",
    });
    paymentIds.push(payment1.id);

    const payment2 = await seedPayment(eventId, {
      amount: 1000000,
      type: "dp",
      method: "cash",
      status: "approved",
    });
    paymentIds.push(payment2.id);

    const payment3 = await seedPayment(eventId, {
      amount: 500000,
      type: "dp",
      method: "transfer",
      status: "pending",
    });
    paymentIds.push(payment3.id);

    for (let i = 0; i < 8; i++) {
      const payment = await seedPayment(eventId, {
        amount: 100000 * (i + 1),
        type: "dp",
        status: "approved",
      });
      paymentIds.push(payment.id);
    }
  });

  test.afterAll(async () => {
    await cleanupByEmail(testEmail);
  });

  test.beforeEach(async ({ page }) => {
    await loginAsClient(page, clientId, testEmail);
    await page.goto("/portal/invoices");
    await page.waitForLoadState("networkidle");
  });

  test("should view payment history", async ({ page }) => {
    await expect(page.locator("text=/riwayat|history|invoice/i")).toBeVisible();

    const paymentRows = page.locator('[data-testid="payment-row"]');
    const count = await paymentRows.count();
    expect(count).toBeGreaterThan(0);
  });

  test("should display invoice details", async ({ page }) => {
    await expect(page.locator("text=Rp")).toBeVisible();
    await expect(page.locator("text=/transfer|cash/i")).toBeVisible();
    await expect(page.locator("text=/approved|pending/i")).toBeVisible();
  });

  test("should show payment status correctly", async ({ page }) => {
    await expect(page.locator("text=/approved/i")).toBeVisible();
    await expect(page.locator("text=/pending/i")).toBeVisible();
  });

  test("should display payment amount formatted", async ({ page }) => {
    const amountText = await page
      .locator("text=/Rp.*2.500.000/")
      .first()
      .textContent();
    expect(amountText).toContain("Rp");
    expect(amountText).toMatch(/2[.,]500[.,]000/);
  });

  test("should handle pagination", async ({ page }) => {
    const hasNextButton = await page
      .locator('button:has-text("Next"), button:has-text("Selanjutnya")')
      .isVisible();

    if (hasNextButton) {
      await page.click(
        'button:has-text("Next"), button:has-text("Selanjutnya")',
      );
      await page.waitForLoadState("networkidle");

      const paymentRows = page.locator('[data-testid="payment-row"]');
      const count = await paymentRows.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test("should show empty state when no payments", async ({ page }) => {
    await prisma.payment.deleteMany({ where: { eventId } });

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=/belum ada|no payment/i")).toBeVisible();

    for (let i = 0; i < 8; i++) {
      await seedPayment(eventId, {
        amount: 100000 * (i + 1),
        type: "dp",
        status: "approved",
      });
    }
  });

  test("should display total paid amount", async ({ page }) => {
    await expect(page.locator("text=/total|dibayar|paid/i")).toBeVisible();
    await expect(page.locator("text=/Rp/i")).toBeVisible();
  });
});
