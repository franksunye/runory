import { expect, test } from "@playwright/test";
import {
  assertListUrl,
  chooseLookup,
  createCustomerParties,
  fillField,
  getRecord,
  resolveWorkspace,
  saveFormAndWaitForCreate,
  selectField,
  switchPersona,
} from "./_helpers";

/**
 * G2-S0 — CRM foundation → Work Order attach
 *
 * Creates fresh Company, Contact, and Service Site through the product UI
 * (two-step path), then creates a Work Order attached to those parties.
 * Does not use seeded Maya/Acme fixtures.
 */

test.describe("G2-S0 CRM foundation", () => {
  test("creates customer parties and attaches them to a Work Order", async ({ page }) => {
    test.setTimeout(120_000);

    const runToken = `G2S0-${Date.now()}`;
    const workOrderTitle = `${runToken} Repair WO`;

    await switchPersona(page, "dev-local-owner");
    const workspace = await resolveWorkspace(page);
    const { companyId, contactId, siteId, companyName, contactName, siteName } =
      await createCustomerParties(page, workspace, runToken);

    await page.goto(`/w/${workspace.workspaceSlug}/work-orders/new`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("#field-title")).toBeVisible();
    await fillField(page, "title", workOrderTitle);
    await selectField(page, "status", "new");
    await chooseLookup(page, "company_id", companyName);
    await chooseLookup(page, "contact_id", contactName);
    await chooseLookup(page, "service_site_id", siteName);
    const workOrderId = await saveFormAndWaitForCreate(page, "work_order");
    await assertListUrl(page, workspace.workspaceSlug, "work-orders");

    const workOrderData = await getRecord(
      page,
      workspace.workspaceId,
      "work_order",
      workOrderId,
    );
    expect(String(workOrderData.company_id)).toBe(companyId);
    expect(String(workOrderData.contact_id)).toBe(contactId);
    expect(String(workOrderData.service_site_id)).toBe(siteId);

    await page.goto(`/w/${workspace.workspaceSlug}/work-orders/${workOrderId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(workOrderTitle, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(companyName, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(contactName, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(siteName, { exact: false }).first()).toBeVisible();
  });
});
