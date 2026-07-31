import { expect, test } from "@playwright/test";
import {
  clickAndAwaitPost,
  createCompletedQuoteWorkOrder,
  ensureFsmRoleAssignments,
  ensureSalesQuoteRoleAssignments,
  expectRecordStatus,
  getRecord,
  resolveWorkspace,
  switchPersona,
  syncPackPermissionGroups,
} from "./_helpers";

/**
 * G2-S3 — Invoice issue and sandbox pay
 *
 * Fresh completed quote-sourced WO → Supervisor Issue invoice → Request payment
 * → checkout.stripe.com. Requires `pnpm stripe:payments:setup`.
 * Hosted card settle / Connect webhook are out of Playwright (external one-time).
 */

test.describe("G2-S3 invoice issue and sandbox pay", () => {
  test.beforeAll(() => {
    syncPackPermissionGroups();
  });

  test("supervisor issues invoice and opens Stripe Checkout when Connect is ready", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);

    const runToken = `G2S3-${Date.now()}`;
    await switchPersona(page, "dev-local-owner");
    const workspace = await resolveWorkspace(page);
    await ensureSalesQuoteRoleAssignments(page, workspace.workspaceId);
    await ensureFsmRoleAssignments(page, workspace.workspaceId);

    const { workOrderId } = await createCompletedQuoteWorkOrder(page, workspace, runToken);
    const workOrder = await getRecord(page, workspace.workspaceId, "work_order", workOrderId);
    expect(String(workOrder.status)).toBe("completed");
    expect(String(workOrder.source_type)).toBe("quote");

    await switchPersona(page, "persona:supervisor");
    await page.goto(`/w/${workspace.workspaceSlug}/work-orders/${workOrderId}`, {
      waitUntil: "domcontentloaded",
    });
    await clickAndAwaitPost(
      page,
      /^(Issue invoice|开具发票)$/,
      "/commands/invoice.issue_from_work_order",
    );
    await expect(page).toHaveURL(new RegExp(`/w/${workspace.workspaceSlug}/invoices/[^/?]+`));
    const invoiceUrl = page.url();
    const invoiceId = invoiceUrl.split("/invoices/")[1]?.split(/[?#]/)[0] ?? "";
    expect(invoiceId, "invoice id from redirect").toBeTruthy();
    await expectRecordStatus(page, workspace.workspaceId, "invoice", invoiceId, "issued");

    const invoice = await getRecord(page, workspace.workspaceId, "invoice", invoiceId);
    expect(Number(invoice.balance_due_minor ?? 0)).toBeGreaterThan(0);
    expect(Number(invoice.amount_paid_minor ?? 0)).toBe(0);

    await expect(page.getByText(/^Customer payment$/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Request payment|请求付款)$/ })).toBeVisible();

    const paymentResponsePromise = page.waitForResponse((response) => {
      return response.request().method() === "POST"
        && response.url().includes("/payments/requests")
        && response.status() < 500;
    }, { timeout: 30_000 }).catch(() => null);

    await page.getByRole("button", { name: /^(Request payment|请求付款)$/ }).click();

    const paymentResponse = await paymentResponsePromise;
    if (paymentResponse?.ok()) {
      const body = await paymentResponse.json() as {
        success?: boolean;
        data?: { checkoutUrl?: string | null };
        error?: { message?: string };
      };
      expect(body.success !== false).toBeTruthy();
      const checkoutUrl = body.data?.checkoutUrl ?? "";
      expect(checkoutUrl, "checkout URL from payment request").toMatch(/checkout\.stripe\.com/);

      await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 }).catch(() => undefined);
      if (page.url().includes("checkout.stripe.com")) {
        testInfo.annotations.push({
          type: "g2-s3-checkout",
          description: `Checkout opened: ${page.url().slice(0, 80)}…`,
        });
        await page.goto(invoiceUrl, { waitUntil: "domcontentloaded" });
      }
      await expectRecordStatus(page, workspace.workspaceId, "invoice", invoiceId, "issued");
      return;
    }

    // Connect not enrolled (or other provider readiness failure): UI must fail closed.
    const error = page.locator("p.text-rose-600, p.text-red-600").filter({
      hasText: /Connect|PAYMENT_|Checkout could not be created|not found|onboarding/i,
    });
    await expect(error.first()).toBeVisible({ timeout: 15_000 });
    testInfo.annotations.push({
      type: "blocked",
      description: `Stripe Checkout blocked until Connect ready: ${await error.first().innerText()}`,
    });
    await expectRecordStatus(page, workspace.workspaceId, "invoice", invoiceId, "issued");
  });
});
