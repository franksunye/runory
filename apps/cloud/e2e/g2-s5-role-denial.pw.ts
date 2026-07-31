import { expect, test } from "@playwright/test";
import {
  chooseLookup,
  clickAndAwaitPost,
  createConvertedWorkOrder,
  createCustomerParties,
  dispatchAndCompleteWorkOrder,
  ensureFsmRoleAssignments,
  ensureSalesQuoteRoleAssignments,
  expectCommandDeniedFromUi,
  expectRecordStatus,
  fillField,
  getRecord,
  resolveWorkspace,
  saveFormAndWaitForCreate,
  selectField,
  switchPersona,
  syncPackPermissionGroups,
} from "./_helpers";

/**
 * G2-S5 — Role denial smoke
 *
 * Unauthorized actors must not succeed at approve / dispatch / issue-invoice
 * from the UI. Button omission or fail-closed command both pass.
 */

test.describe("G2-S5 role denial smoke", () => {
  test.beforeAll(() => {
    syncPackPermissionGroups();
  });

  test("sales rep cannot approve; technician cannot triage or issue invoice", async ({ page }) => {
    test.setTimeout(300_000);

    const runToken = `G2S5-${Date.now()}`;
    await switchPersona(page, "dev-local-owner");
    const workspace = await resolveWorkspace(page);
    await ensureSalesQuoteRoleAssignments(page, workspace.workspaceId);
    await ensureFsmRoleAssignments(page, workspace.workspaceId);

    // ── Approve denial (Sales Rep) ──
    const quoteNumber = `Q-${runToken}-DENY`;
    const quoteTitle = `${runToken} Denial quote`;
    const { companyName, contactName, siteName } =
      await createCustomerParties(page, workspace, `${runToken}-Q`);

    await switchPersona(page, "persona:sales-rep");
    await page.goto(`/w/${workspace.workspaceSlug}/quotes/new`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#field-title")).toBeVisible();
    await fillField(page, "quote_number", quoteNumber);
    await fillField(page, "title", quoteTitle);
    await selectField(page, "status", "draft");
    await fillField(page, "version", "1");
    await fillField(page, "currency", "USD");
    await chooseLookup(page, "company_id", companyName);
    await chooseLookup(page, "contact_id", contactName);
    await chooseLookup(page, "service_site_id", siteName);
    const denyQuoteId = await saveFormAndWaitForCreate(page, "quote");

    await page.goto(
      `/w/${workspace.workspaceSlug}/quote-lines/new?parentField=quote_id&parentId=${encodeURIComponent(denyQuoteId)}&returnTo=${encodeURIComponent(`/w/${workspace.workspaceSlug}/quotes/${denyQuoteId}`)}`,
      { waitUntil: "domcontentloaded" },
    );
    await fillField(page, "description", `${runToken} Labor`);
    await fillField(page, "quantity", "1");
    await fillField(page, "unit_price", "100");
    await fillField(page, "discount_amount", "0");
    await fillField(page, "tax_amount", "0");
    await fillField(page, "sort_order", "1");
    await saveFormAndWaitForCreate(page, "quote_line");

    await page.goto(`/w/${workspace.workspaceSlug}/quotes/${denyQuoteId}`, {
      waitUntil: "domcontentloaded",
    });
    await clickAndAwaitPost(
      page,
      /^(Submit for approval|提交审批|提交批准)$/,
      "/commands/quote.submit_for_approval",
    );
    await expectRecordStatus(page, workspace.workspaceId, "quote", denyQuoteId, "in_review");

    await page.goto(`/w/${workspace.workspaceSlug}/quotes/${denyQuoteId}`, {
      waitUntil: "domcontentloaded",
    });
    const approveDenial = await expectCommandDeniedFromUi(
      page,
      /^(Approve|批准)$/,
      /\/commands\/quote\.approve|\/decisions/,
    );
    if (!approveDenial.omitted) {
      await expectRecordStatus(page, workspace.workspaceId, "quote", denyQuoteId, "in_review");
    }

    // ── Dispatch denial (Technician) ──
    await switchPersona(page, "dev-local-owner");
    const { workOrderId } = await createConvertedWorkOrder(page, workspace, `${runToken}-WO`);
    await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "new");

    await switchPersona(page, "persona:technician");
    await page.goto(`/w/${workspace.workspaceSlug}/work-orders/${workOrderId}`, {
      waitUntil: "domcontentloaded",
    });
    const triageDenial = await expectCommandDeniedFromUi(
      page,
      /^(Triage|分诊)$/,
      "/commands/work_order.triage",
    );
    if (!triageDenial.omitted) {
      await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "new");
    }
    const dispatchDenial = await expectCommandDeniedFromUi(
      page,
      /^(Plan & dispatch|计划并派工)$/,
      "/commands/work_order.create_visit",
    );
    if (!dispatchDenial.omitted) {
      await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "new");
    }

    // ── Issue-invoice denial (Technician) — pay-path gate on completed WO ──
    await dispatchAndCompleteWorkOrder(page, workspace, workOrderId, `${runToken}-WO`);
    await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "completed");

    await switchPersona(page, "persona:technician");
    await page.goto(`/w/${workspace.workspaceSlug}/work-orders/${workOrderId}`, {
      waitUntil: "domcontentloaded",
    });
    const invoiceDenial = await expectCommandDeniedFromUi(
      page,
      /^(Issue invoice|开具发票)$/,
      "/commands/invoice.issue_from_work_order",
    );
    if (!invoiceDenial.omitted) {
      await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "completed");
      const wo = await getRecord(page, workspace.workspaceId, "work_order", workOrderId);
      expect(wo.invoice_id == null || String(wo.invoice_id) === "").toBeTruthy();
    }
  });
});
