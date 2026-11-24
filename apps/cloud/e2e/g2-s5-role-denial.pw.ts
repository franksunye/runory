import { expect, test, type Page } from "@playwright/test";
import {
  chooseLookup,
  clickAndAwaitPost,
  createConvertedWorkOrder,
  createCustomerParties,
  createCompletedQuoteWorkOrder,
  ensureFsmRoleAssignments,
  ensureSalesQuoteRoleAssignments,
  expectCommandDeniedFromUi,
  expectRecordStatus,
  fillField,
  resolveWorkspace,
  saveFormAndWaitForCreate,
  selectField,
  switchPersona,
  syncPackPermissionGroups,
  uniqueDispatchWindow,
} from "./_helpers";

/**
 * G2-S5 — Role denial smoke
 *
 * Unauthorized actors must not succeed at approve / dispatch / issue-invoice
 * from the UI. Each denial has an eligible-actor UI control and a direct
 * command request that must fail with an authorization error.
 */

test.describe("G2-S5 role denial smoke", () => {
  test.beforeAll(() => {
    syncPackPermissionGroups();
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(300_000);
    await switchPersona(page, "dev-local-owner");
  });

  async function roleWorkspace(page: Page) {
    const workspace = await resolveWorkspace(page);
    await ensureSalesQuoteRoleAssignments(page, workspace.workspaceId);
    await ensureFsmRoleAssignments(page, workspace.workspaceId);
    return workspace;
  }

  test("sales rep can submit a quote but cannot approve it", async ({ page }) => {
    const runToken = `G2S5-Q-${Date.now()}`;
    const workspace = await roleWorkspace(page);
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

    await expectCommandDeniedFromUi(
      page,
      /^(Approve|批准)$/,
      /\/commands\/quote\.approve|\/decisions/,
      {
        workspaceId: workspace.workspaceId,
        objectKey: "quote",
        recordId: denyQuoteId,
        recordPath: `/w/${workspace.workspaceSlug}/quotes/${denyQuoteId}`,
        commandType: "quote.approve",
        allowedPersonaId: "persona:sales-manager",
        deniedPersonaId: "persona:sales-rep",
        recordVisibility: "visible",
      },
    );
    await expectRecordStatus(page, workspace.workspaceId, "quote", denyQuoteId, "in_review");
  });

  test("technician cannot read, triage or dispatch an unassigned work order", async ({ page }) => {
    const runToken = `G2S5-Dispatch-${Date.now()}`;
    const workspace = await roleWorkspace(page);
    const { workOrderId } = await createConvertedWorkOrder(page, workspace, `${runToken}-WO`);
    await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "new");

    const workOrderPath = `/w/${workspace.workspaceSlug}/work-orders/${workOrderId}`;
    const workOrderDenial = {
      workspaceId: workspace.workspaceId,
      objectKey: "work_order",
      recordId: workOrderId,
      recordPath: workOrderPath,
      allowedPersonaId: "persona:dispatcher",
      deniedPersonaId: "persona:technician",
      recordVisibility: "hidden" as const,
    };
    await expectCommandDeniedFromUi(
      page,
      /^(Accept for planning|受理并进入计划)$/,
      "/commands/work_order.triage",
      { ...workOrderDenial, commandType: "work_order.triage" },
    );
    await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "new");

    // Dispatch is only available after triage. Use a valid dispatch input so
    // validation/state errors cannot masquerade as a permission denial.
    await switchPersona(page, "persona:dispatcher");
    await page.goto(workOrderPath, { waitUntil: "domcontentloaded" });
    await clickAndAwaitPost(page, /^(Accept for planning|受理并进入计划)$/, "/commands/work_order.triage");
    await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "triaged");
    await page.goto(workOrderPath, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^(Plan & dispatch|计划与派工)$/ }).click();
    await page.getByLabel(/^Technician/).selectOption({ label: "David Park" });
    const technicianId = await page.getByLabel(/^Technician/).inputValue();
    expect(technicianId, "valid technician for dispatch denial").toBeTruthy();
    const window = uniqueDispatchWindow();
    const visitsUrl = `/api/workspaces/${workspace.workspaceId}/objects/service_visit/records?filter.work_order_id=${encodeURIComponent(workOrderId)}`;
    const visitsBefore = await page.request.get(visitsUrl, { maxRetries: 1 });
    expect(visitsBefore.ok()).toBeTruthy();
    expect((await visitsBefore.json()).data).toEqual([]);

    await expectCommandDeniedFromUi(
      page,
      /^(Plan & dispatch|计划与派工)$/,
      "/commands/work_order.create_visit",
      {
        ...workOrderDenial,
        commandType: "work_order.create_visit",
        input: {
          technicianId,
          scheduledStart: new Date(window.start).toISOString(),
          scheduledEnd: new Date(window.end).toISOString(),
          notes: `${runToken} denied dispatch`,
        },
        submitUi: async () => {
          await page.getByLabel(/^Technician/).selectOption(technicianId);
          await page.getByLabel(/^Scheduled start/).fill(window.start);
          await page.getByLabel(/^Scheduled end/).fill(window.end);
          await page.getByRole("button", { name: /^(Dispatch visit|派发访问)$/ }).click();
        },
      },
    );
    await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "triaged");
    await switchPersona(page, "persona:dispatcher");
    const visitsAfter = await page.request.get(visitsUrl, { maxRetries: 1 });
    expect(visitsAfter.ok()).toBeTruthy();
    expect((await visitsAfter.json()).data, "denied dispatch creates no visit").toEqual([]);
  });

  test("technician can read assigned completed work but cannot issue an invoice", async ({ page }) => {
    const workspace = await roleWorkspace(page);
    const { workOrderId } = await createCompletedQuoteWorkOrder(page, workspace, `G2S5-Invoice-${Date.now()}`);
    await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "completed");

    await switchPersona(page, "persona:supervisor");
    const invoicesUrl = `/api/workspaces/${workspace.workspaceId}/objects/invoice/records?filter.work_order_id=${encodeURIComponent(workOrderId)}`;
    const invoicesBefore = await page.request.get(invoicesUrl, { maxRetries: 1 });
    expect(invoicesBefore.ok()).toBeTruthy();
    expect((await invoicesBefore.json()).data).toEqual([]);
    await expectCommandDeniedFromUi(
      page,
      /^(Issue invoice|开具发票)$/,
      "/commands/invoice.issue_from_work_order",
      {
        workspaceId: workspace.workspaceId,
        objectKey: "work_order",
        recordId: workOrderId,
        recordPath: `/w/${workspace.workspaceSlug}/work-orders/${workOrderId}`,
        allowedPersonaId: "persona:supervisor",
        deniedPersonaId: "persona:technician",
        recordVisibility: "visible",
        commandType: "invoice.issue_from_work_order",
        input: { workOrderId },
      },
    );
    await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "completed");
    await switchPersona(page, "persona:supervisor");
    const invoicesAfter = await page.request.get(invoicesUrl, { maxRetries: 1 });
    expect(invoicesAfter.ok()).toBeTruthy();
    expect((await invoicesAfter.json()).data, "denied invoice command creates no invoice").toEqual([]);
  });
});
