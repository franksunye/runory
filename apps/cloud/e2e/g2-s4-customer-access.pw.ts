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
 * G2-S4 — Customer access surface
 *
 * Owner issues a magic-link grant (API; no Owner grant UI yet) → customer
 * portal shows Quote/Invoice projection → Owner revokes → Access unavailable.
 * Card settle / Pay now Checkout are out of Playwright.
 */

const GRANT_CAPABILITIES = [
  "quote.view",
  "quote.accept",
  "work_order.view_status",
  "service_report.view",
  "invoice.view",
  "invoice.pay",
  "payment.view_status",
] as const;

test.describe("G2-S4 customer access surface", () => {
  test.beforeAll(() => {
    syncPackPermissionGroups();
  });

  test("grant shows Quote/Invoice projection; revoke denies access", async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);

    const runToken = `G2S4-${Date.now()}`;
    await switchPersona(page, "dev-local-owner");
    const workspace = await resolveWorkspace(page);
    await ensureSalesQuoteRoleAssignments(page, workspace.workspaceId);
    await ensureFsmRoleAssignments(page, workspace.workspaceId);

    const { workOrderId, quoteId, contactId, contactName } =
      await createCompletedQuoteWorkOrder(page, workspace, runToken);

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
    const invoiceId = page.url().split("/invoices/")[1]?.split(/[?#]/)[0] ?? "";
    expect(invoiceId).toBeTruthy();
    await expectRecordStatus(page, workspace.workspaceId, "invoice", invoiceId, "issued");

    await switchPersona(page, "dev-local-owner");
    const quote = await getRecord(page, workspace.workspaceId, "quote", quoteId);
    const invoice = await getRecord(page, workspace.workspaceId, "invoice", invoiceId);
    const quoteNumber = String(quote.quote_number ?? "");
    const invoiceNumber = String(invoice.invoice_number ?? invoice.number ?? "");
    expect(quoteNumber).toBeTruthy();

    const expiresAt = new Date(Date.now() + 24 * 3_600_000).toISOString();
    const issueResponse = await page.request.post(
      `/api/workspaces/${workspace.workspaceId}/customer-access/grants`,
      {
        data: {
          subjectType: "contact",
          subjectId: contactId,
          rootObjectType: "quote",
          rootRecordId: quoteId,
          capabilities: [...GRANT_CAPABILITIES],
          expiresAt,
        },
        headers: { "X-Requested-With": "XMLHttpRequest" },
      },
    );
    const issueBody = await issueResponse.json() as {
      success?: boolean;
      data?: {
        grant?: { id?: string; aggregate_version?: number };
        accessUrl?: string;
      };
      error?: { message?: string };
    };
    expect(
      issueResponse.ok(),
      `grant issue HTTP ok: ${issueBody.error?.message ?? issueResponse.status()}`,
    ).toBeTruthy();
    expect(issueBody.success !== false).toBeTruthy();
    const grantId = String(issueBody.data?.grant?.id ?? "");
    const grantVersion = Number(issueBody.data?.grant?.aggregate_version ?? 1);
    const accessUrl = String(issueBody.data?.accessUrl ?? "");
    expect(grantId).toBeTruthy();
    expect(accessUrl).toMatch(/access#token=/);

    const tokenMatch = accessUrl.match(/#token=([^&]+)/);
    expect(tokenMatch?.[1]).toBeTruthy();
    const portalPath = `/en/access#token=${tokenMatch![1]}`;

    const customerContext = await browser.newContext();
    const customerPage = await customerContext.newPage();
    await customerPage.goto(portalPath, { waitUntil: "domcontentloaded" });
    await expect(customerPage.getByText(/Securing your access/i)).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(
      customerPage.getByText(new RegExp(`Hello,\\s*${contactName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)),
    ).toBeVisible({ timeout: 30_000 });
    await expect(customerPage.getByText(/^Quote$/).first()).toBeVisible();
    await expect(customerPage.getByText(quoteNumber, { exact: false }).first()).toBeVisible();
    await expect(customerPage.getByText(/^Invoice$/).first()).toBeVisible();
    if (invoiceNumber) {
      await expect(customerPage.getByText(invoiceNumber, { exact: false }).first()).toBeVisible();
    }
    await expect(customerPage.getByText(/Payment due/i).first()).toBeVisible();
    await expect(customerPage.getByRole("button", { name: /^(Pay now|立即支付)$/ })).toBeVisible();

    const revokeResponse = await page.request.post(
      `/api/workspaces/${workspace.workspaceId}/customer-access/grants/${grantId}/revoke`,
      {
        data: { expectedVersion: grantVersion },
        headers: { "X-Requested-With": "XMLHttpRequest" },
      },
    );
    const revokeBody = await revokeResponse.json().catch(() => ({} as { error?: { message?: string } }));
    expect(
      revokeResponse.ok(),
      `grant revoke HTTP ok: ${revokeBody.error?.message ?? revokeResponse.status()}`,
    ).toBeTruthy();

    await customerPage.reload({ waitUntil: "domcontentloaded" });
    await expect(customerPage.getByText(/Access unavailable/i)).toBeVisible({ timeout: 30_000 });

    await customerPage.goto(portalPath, { waitUntil: "domcontentloaded" });
    await expect(customerPage.getByText(/Access unavailable/i)).toBeVisible({ timeout: 30_000 });

    await customerContext.close();
  });
});
