import { expect, test } from "@playwright/test";
import {
  approveInReviewQuote,
  chooseLookup,
  clickAndAwaitPost,
  createCustomerParties,
  ensureSalesQuoteRoleAssignments,
  expectRecordStatus,
  fillField,
  getRecord,
  resolveWorkspace,
  saveFormAndWaitForCreate,
  selectField,
  switchPersona,
} from "./_helpers";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadCloudEnv(): NodeJS.ProcessEnv {
  const envPath = resolve(__dirname, "../.env.local");
  const env = { ...process.env };
  if (!existsSync(envPath)) return env;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx);
    let value = trimmed.slice(idx + 1);
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function syncPackPermissionGroups() {
  execFileSync("pnpm", ["exec", "tsx", "scripts/sync-pack-permission-groups.mjs"], {
    cwd: resolve(__dirname, ".."),
    env: loadCloudEnv(),
    stdio: "pipe",
  });
}
/**
 * G2-S1 — Quote commercial loop
 *
 * Fresh CRM parties → Sales Rep creates Quote + line → submit →
 * Sales Manager approves → Owner mark sent / accept / convert to Work Order.
 */

async function openQuote(page: import("@playwright/test").Page, workspaceSlug: string, quoteId: string) {
  await page.goto(`/w/${workspaceSlug}/quotes/${quoteId}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main")).toBeVisible();
}

test.describe("G2-S1 Quote commercial loop", () => {
  test.beforeAll(() => {
    syncPackPermissionGroups();
  });

  test("submits, approves, sends, accepts, and converts a fresh Quote", async ({ page }) => {
    test.setTimeout(180_000);

    const runToken = `G2S1-${Date.now()}`;
    const quoteNumber = `Q-${runToken}`;
    const quoteTitle = `${runToken} Commercial repair proposal`;

    await switchPersona(page, "dev-local-owner");
    const workspace = await resolveWorkspace(page);
    await ensureSalesQuoteRoleAssignments(page, workspace.workspaceId);
    const { companyId, contactId, siteId, companyName, contactName, siteName } =
      await createCustomerParties(page, workspace, runToken);

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
    const quoteId = await saveFormAndWaitForCreate(page, "quote");

    await page.goto(
      `/w/${workspace.workspaceSlug}/quote-lines/new?parentField=quote_id&parentId=${encodeURIComponent(quoteId)}&returnTo=${encodeURIComponent(`/w/${workspace.workspaceSlug}/quotes/${quoteId}`)}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.locator("#field-description")).toBeVisible();
    await fillField(page, "description", `${runToken} Labor`);
    await fillField(page, "quantity", "2");
    await fillField(page, "unit_price", "150");
    await fillField(page, "discount_amount", "0");
    await fillField(page, "tax_amount", "0");
    await fillField(page, "sort_order", "1");
    await saveFormAndWaitForCreate(page, "quote_line");

    await openQuote(page, workspace.workspaceSlug, quoteId);
    await expect(page.getByText(quoteTitle, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(companyName, { exact: false }).first()).toBeVisible();

    await clickAndAwaitPost(
      page,
      /^(Submit for approval|提交审批|提交批准)$/,
      "/commands/quote.submit_for_approval",
    );
    await expectRecordStatus(page, workspace.workspaceId, "quote", quoteId, "in_review");

    await openQuote(page, workspace.workspaceSlug, quoteId);
    const repApprove = page.getByRole("button", { name: /^(Approve|批准)$/ }).first();
    if (await repApprove.isVisible().catch(() => false)) {
      const denial = page.waitForResponse((response) => {
        const url = response.url();
        return response.request().method() === "POST"
          && (url.includes("/commands/quote.approve") || url.includes("/decisions"))
          && response.status() < 500;
      }, { timeout: 15_000 });
      await repApprove.click();
      const response = await denial;
      const body = await response.json().catch(() => ({} as { success?: boolean }));
      expect(
        response.ok() === false || body.success === false,
        "Sales Rep approve must fail closed",
      ).toBeTruthy();
      await expectRecordStatus(page, workspace.workspaceId, "quote", quoteId, "in_review");
    }

    await switchPersona(page, "persona:sales-manager");
    await approveInReviewQuote(page, workspace.workspaceSlug, workspace.workspaceId, quoteId);

    await switchPersona(page, "dev-local-owner");
    await openQuote(page, workspace.workspaceSlug, quoteId);
    await clickAndAwaitPost(page, /^(Mark as sent|标记已发送)$/, "/commands/quote.mark_sent");
    await expectRecordStatus(page, workspace.workspaceId, "quote", quoteId, "sent");

    await openQuote(page, workspace.workspaceSlug, quoteId);
    await clickAndAwaitPost(page, /^(Accept|接受)$/, "/commands/quote.accept");
    await expectRecordStatus(page, workspace.workspaceId, "quote", quoteId, "accepted");

    await openQuote(page, workspace.workspaceSlug, quoteId);
    await clickAndAwaitPost(
      page,
      /^(Convert to Work Order|转换为工单)$/,
      "/commands/quote.convert_to_work_order",
    );
    await expectRecordStatus(page, workspace.workspaceId, "quote", quoteId, "converted");

    const quote = await getRecord(page, workspace.workspaceId, "quote", quoteId);
    const workOrderId = String(quote.work_order_id ?? "");
    expect(workOrderId, "converted quote has work_order_id").toBeTruthy();

    const workOrder = await getRecord(page, workspace.workspaceId, "work_order", workOrderId);
    expect(String(workOrder.company_id)).toBe(companyId);
    expect(String(workOrder.contact_id)).toBe(contactId);
    if (workOrder.service_site_id) {
      expect(String(workOrder.service_site_id)).toBe(siteId);
    }

    await page.goto(`/w/${workspace.workspaceSlug}/work-orders/${workOrderId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(companyName, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(contactName, { exact: false }).first()).toBeVisible();
  });
});
