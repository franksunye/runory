import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  chooseLookup,
  clickAndAwaitPost,
  createCompletedQuoteWorkOrder,
  createConvertedWorkOrder,
  createCustomerParties,
  ensureFsmRoleAssignments,
  ensureSalesQuoteRoleAssignments,
  expectRecordStatus,
  fillField,
  findVisitForWorkOrder,
  getRecord,
  getVisitWorkItemId,
  resolveWorkspace,
  saveFormAndWaitForCreate,
  selectField,
  switchPersona,
  syncPackPermissionGroups,
  uniqueDispatchWindow,
  type WorkspaceContext,
} from "./_helpers";

/**
 * One-shot fixture prep for G3 Agent browser experience sample.
 * Writes apps/cloud/e2e/.g3-sample-fixture.json incrementally (gitignored runtime).
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

const FIXTURE_PATH = resolve(process.cwd(), "e2e/.g3-sample-fixture.json");

type Fixture = {
  runToken: string;
  seededAt: string;
  workspace: WorkspaceContext;
  path2?: Record<string, string>;
  path1And3?: Record<string, string>;
  path4?: Record<string, string>;
};

function readFixture(): Fixture | null {
  if (!existsSync(FIXTURE_PATH)) return null;
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

function writeFixture(fixture: Fixture) {
  writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  console.log(`G3 fixture updated: ${FIXTURE_PATH}`);
}

test.describe("G3 prep seed", () => {
  test.beforeAll(() => {
    syncPackPermissionGroups();
  });

  test("seed path2 in_review quote", async ({ page }) => {
    test.setTimeout(180_000);
    const existing = readFixture();
    if (existing?.path2) {
      test.info().annotations.push({ type: "skip-reason", description: "path2 already seeded" });
      return;
    }

    const runToken = existing?.runToken ?? `G3-${Date.now()}`;
    await switchPersona(page, "dev-local-owner");
    const workspace = existing?.workspace ?? (await resolveWorkspace(page));
    await ensureSalesQuoteRoleAssignments(page, workspace.workspaceId);
    await ensureFsmRoleAssignments(page, workspace.workspaceId);

    const parties = await createCustomerParties(page, workspace, `${runToken}-Q`);
    await switchPersona(page, "persona:sales-rep");
    await page.goto(`/w/${workspace.workspaceSlug}/quotes/new`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#field-title")).toBeVisible();
    const quoteTitle = `${runToken} Approval sample`;
    await fillField(page, "quote_number", `Q-${runToken}-IR`);
    await fillField(page, "title", quoteTitle);
    await selectField(page, "status", "draft");
    await fillField(page, "version", "1");
    await fillField(page, "currency", "USD");
    await chooseLookup(page, "company_id", parties.companyName);
    await chooseLookup(page, "contact_id", parties.contactName);
    await chooseLookup(page, "service_site_id", parties.siteName);
    const inReviewQuoteId = await saveFormAndWaitForCreate(page, "quote");
    await page.goto(
      `/w/${workspace.workspaceSlug}/quote-lines/new?parentField=quote_id&parentId=${encodeURIComponent(inReviewQuoteId)}&returnTo=${encodeURIComponent(`/w/${workspace.workspaceSlug}/quotes/${inReviewQuoteId}`)}`,
      { waitUntil: "domcontentloaded" },
    );
    await fillField(page, "description", `${runToken} Labor`);
    await fillField(page, "quantity", "1");
    await fillField(page, "unit_price", "200");
    await fillField(page, "discount_amount", "0");
    await fillField(page, "tax_amount", "0");
    await fillField(page, "sort_order", "1");
    await saveFormAndWaitForCreate(page, "quote_line");
    await page.goto(`/w/${workspace.workspaceSlug}/quotes/${inReviewQuoteId}`, {
      waitUntil: "domcontentloaded",
    });
    await clickAndAwaitPost(
      page,
      /^(Submit for approval|提交审批|提交批准)$/,
      "/commands/quote.submit_for_approval",
    );
    await expectRecordStatus(page, workspace.workspaceId, "quote", inReviewQuoteId, "in_review");

    writeFixture({
      runToken,
      seededAt: new Date().toISOString(),
      workspace,
      ...(existing ?? {}),
      path2: {
        quoteId: inReviewQuoteId,
        quoteTitle,
        companyName: parties.companyName,
        status: "in_review",
        url: `/w/${workspace.workspaceSlug}/quotes/${inReviewQuoteId}`,
      },
    });
  });

  test("seed path1+3 planned visit", async ({ page }) => {
    test.setTimeout(300_000);
    const existing = readFixture();
    expect(existing, "run path2 seed first").toBeTruthy();
    if (existing!.path1And3) {
      test.info().annotations.push({ type: "skip-reason", description: "path1And3 already seeded" });
      return;
    }

    const { runToken, workspace } = existing!;
    await switchPersona(page, "dev-local-owner");
    await ensureSalesQuoteRoleAssignments(page, workspace.workspaceId);
    await ensureFsmRoleAssignments(page, workspace.workspaceId);

    const field = await createConvertedWorkOrder(page, workspace, `${runToken}-F`);
    await switchPersona(page, "persona:dispatcher");
    await page.goto(`/w/${workspace.workspaceSlug}/work-orders/${field.workOrderId}`, {
      waitUntil: "domcontentloaded",
    });
    await clickAndAwaitPost(page, /^(Triage|分诊)$/, "/commands/work_order.triage");
    await expectRecordStatus(page, workspace.workspaceId, "work_order", field.workOrderId, "triaged");
    await page.goto(`/w/${workspace.workspaceSlug}/work-orders/${field.workOrderId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: /^(Plan & dispatch|计划并派工)$/ }).first().click();
    await expect(page.getByRole("button", { name: /^(Dispatch visit|派发访问)$/ })).toBeVisible();
    await page.getByLabel(/^Technician/).selectOption({ label: "David Park" });
    const window = uniqueDispatchWindow();
    await page.getByLabel(/^Scheduled start/).fill(window.start);
    await page.getByLabel(/^Scheduled end/).fill(window.end);
    await page.getByLabel(/^Dispatch notes/).fill(`${runToken} g3 dispatch`);
    await clickAndAwaitPost(
      page,
      /^(Dispatch visit|派发访问)$/,
      "/commands/work_order.create_visit",
    );
    await expectRecordStatus(page, workspace.workspaceId, "work_order", field.workOrderId, "planned");
    const visitId = await findVisitForWorkOrder(page, workspace.workspaceId, field.workOrderId);
    const workItemId = await getVisitWorkItemId(page, workspace.workspaceId, visitId);

    writeFixture({
      ...existing!,
      seededAt: new Date().toISOString(),
      path1And3: {
        quoteId: field.quoteId,
        workOrderId: field.workOrderId,
        visitId,
        workItemId,
        companyName: field.companyName,
        workOrderUrl: `/w/${workspace.workspaceSlug}/work-orders/${field.workOrderId}`,
        visitUrl: `/w/${workspace.workspaceSlug}/service-visits/${visitId}`,
        mobileToday: `/m/w/${workspace.workspaceId}`,
        mobileVisit: `/m/w/${workspace.workspaceId}/visits/${visitId}`,
        mobileForm: `/m/w/${workspace.workspaceId}/work/${workItemId}/form`,
      },
    });
  });

  test("seed path4 invoice + grant", async ({ page }) => {
    test.setTimeout(360_000);
    const existing = readFixture();
    expect(existing, "run earlier seeds first").toBeTruthy();
    if (existing!.path4) {
      test.info().annotations.push({ type: "skip-reason", description: "path4 already seeded" });
      return;
    }

    const { runToken, workspace } = existing!;
    await switchPersona(page, "dev-local-owner");
    await ensureSalesQuoteRoleAssignments(page, workspace.workspaceId);
    await ensureFsmRoleAssignments(page, workspace.workspaceId);

    const paid = await createCompletedQuoteWorkOrder(page, workspace, `${runToken}-P`);
    await switchPersona(page, "persona:supervisor");
    await page.goto(`/w/${workspace.workspaceSlug}/work-orders/${paid.workOrderId}`, {
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
    const quote = await getRecord(page, workspace.workspaceId, "quote", paid.quoteId);
    const invoice = await getRecord(page, workspace.workspaceId, "invoice", invoiceId);
    const expiresAt = new Date(Date.now() + 24 * 3_600_000).toISOString();
    const issueResponse = await page.request.post(
      `/api/workspaces/${workspace.workspaceId}/customer-access/grants`,
      {
        data: {
          subjectType: "contact",
          subjectId: paid.contactId,
          rootObjectType: "quote",
          rootRecordId: paid.quoteId,
          capabilities: [...GRANT_CAPABILITIES],
          expiresAt,
        },
        headers: { "X-Requested-With": "XMLHttpRequest" },
      },
    );
    const issueBody = await issueResponse.json() as {
      success?: boolean;
      data?: { grant?: { id?: string }; accessUrl?: string };
      error?: { message?: string };
    };
    expect(issueResponse.ok(), issueBody.error?.message ?? String(issueResponse.status())).toBeTruthy();
    const accessUrl = String(issueBody.data?.accessUrl ?? "");
    expect(accessUrl).toMatch(/access#token=/);
    const tokenMatch = accessUrl.match(/#token=([^&]+)/);
    expect(tokenMatch?.[1]).toBeTruthy();

    writeFixture({
      ...existing!,
      seededAt: new Date().toISOString(),
      path4: {
        quoteId: paid.quoteId,
        workOrderId: paid.workOrderId,
        invoiceId,
        contactName: paid.contactName,
        quoteNumber: String(quote.quote_number ?? ""),
        invoiceNumber: String(invoice.invoice_number ?? invoice.number ?? ""),
        grantId: String(issueBody.data?.grant?.id ?? ""),
        portalPath: `/en/access#token=${tokenMatch![1]}`,
        invoiceUrl: `/w/${workspace.workspaceSlug}/invoices/${invoiceId}`,
      },
    });
  });
});
