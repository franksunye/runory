import { expect, test, type Page } from "@playwright/test";

/**
 * G2-S0 — CRM foundation → Work Order attach
 *
 * Creates fresh Company, Contact, and Service Site through the product UI
 * (two-step path), then creates a Work Order attached to those parties.
 * Does not use seeded Maya/Acme fixtures.
 */

interface WorkspaceContext {
  workspaceId: string;
  workspaceSlug: string;
}

async function switchPersona(page: Page, personaId: string) {
  const response = await page.request.post("/api/dev/persona", {
    data: { personaId },
    headers: { "X-Requested-With": "XMLHttpRequest" },
  });
  if (!response.ok()) {
    throw new Error(
      `Switch to ${personaId} failed with HTTP ${response.status()}: ${await response.text()}`,
    );
  }
}

async function resolveWorkspace(page: Page): Promise<WorkspaceContext> {
  const response = await page.request.get("/api/auth/me");
  expect(response.ok(), "auth/me succeeds").toBeTruthy();
  const body = await response.json();
  const workspaces = (body.data?.workspaces ?? []) as Array<Record<string, string>>;
  expect(workspaces.length, "at least one workspace is available").toBeGreaterThan(0);
  const demo = workspaces.find((workspace) => workspace.workspaceName === "Demo Workspace")
    ?? workspaces[0];
  const workspaceId = demo.workspaceId ?? demo.id;
  const workspaceSlug = demo.workspaceSlug ?? demo.slug;
  expect(workspaceId, "workspaceId").toBeTruthy();
  expect(workspaceSlug, "workspaceSlug").toBeTruthy();
  return { workspaceId, workspaceSlug };
}

async function fillField(page: Page, fieldKey: string, value: string) {
  await page.locator(`#field-${fieldKey}`).fill(value);
}

async function selectField(page: Page, fieldKey: string, value: string) {
  await page.locator(`#field-${fieldKey}`).selectOption(value);
}

async function chooseLookup(page: Page, fieldKey: string, searchText: string) {
  const field = page.locator(`#field-${fieldKey}`);
  await field.click();
  await field.fill(searchText);
  const option = page.getByRole("option", { name: searchText });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await expect(field).toHaveValue(searchText);
}

async function saveFormAndWaitForCreate(page: Page, objectKey: string) {
  const responsePromise = page.waitForResponse((response) => {
    if (response.request().method() !== "POST") return false;
    if (!response.url().includes(`/objects/${objectKey}/records`)) return false;
    // Successful create posts to the collection URL, not .../records/{id}.
    return !/\/records\/[^/?]+$/.test(new URL(response.url()).pathname) && response.ok();
  }, { timeout: 30_000 });
  await page.getByRole("button", { name: /^(Save|保存)$/ }).click();
  const response = await responsePromise;
  const body = await response.json();
  expect(body.success, `${objectKey} create succeeds`).toBeTruthy();
  const id = body.data?.id ?? body.id;
  expect(id, `${objectKey} create returns id`).toBeTruthy();
  return String(id);
}

async function assertListUrl(page: Page, workspaceSlug: string, segment: string) {
  await expect(page).toHaveURL(
    new RegExp(`/w/${workspaceSlug}/${segment}/?(?:\\?.*)?$`),
  );
}

test.describe("G2-S0 CRM foundation", () => {
  test("creates customer parties and attaches them to a Work Order", async ({ page }) => {
    test.setTimeout(120_000);

    const runToken = `G2S0-${Date.now()}`;
    const companyName = `${runToken} Customer Co`;
    const contactName = `${runToken} Contact`;
    const siteName = `${runToken} Site`;
    const workOrderTitle = `${runToken} Repair WO`;

    await switchPersona(page, "dev-local-owner");
    const { workspaceId, workspaceSlug } = await resolveWorkspace(page);

    // 1. Company as customer
    await page.goto(`/w/${workspaceSlug}/companies/new`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#field-name")).toBeVisible();
    await fillField(page, "name", companyName);
    await selectField(page, "lifecycle_stage", "customer");
    const companyId = await saveFormAndWaitForCreate(page, "company");
    await assertListUrl(page, workspaceSlug, "companies");
    const company = await page.request.get(
      `/api/workspaces/${workspaceId}/objects/company/records/${companyId}`,
    );
    expect((await company.json()).data.lifecycle_stage).toBe("customer");

    // 2. Contact as customer, linked to company
    await page.goto(`/w/${workspaceSlug}/contacts/new`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#field-name")).toBeVisible();
    await fillField(page, "name", contactName);
    await fillField(page, "email", `${runToken.toLowerCase()}@example.test`);
    await chooseLookup(page, "primary_company_id", companyName);
    await selectField(page, "lifecycle_stage", "customer");
    const contactId = await saveFormAndWaitForCreate(page, "contact");
    await assertListUrl(page, workspaceSlug, "contacts");
    const contact = await page.request.get(
      `/api/workspaces/${workspaceId}/objects/contact/records/${contactId}`,
    );
    const contactData = (await contact.json()).data as Record<string, unknown>;
    expect(contactData.lifecycle_stage).toBe("customer");
    expect(String(contactData.primary_company_id)).toBe(companyId);

    // 3. Service Site linked to company + contact
    await page.goto(`/w/${workspaceSlug}/service-sites/new`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#field-name")).toBeVisible();
    await fillField(page, "name", siteName);
    await fillField(page, "address", `${runToken} Warehouse Road`);
    await chooseLookup(page, "company_id", companyName);
    await chooseLookup(page, "primary_contact_id", contactName);
    await selectField(page, "status", "active");
    const siteId = await saveFormAndWaitForCreate(page, "service_site");
    await assertListUrl(page, workspaceSlug, "service-sites");

    // 4. Work Order attached to fresh parties
    await page.goto(`/w/${workspaceSlug}/work-orders/new`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#field-title")).toBeVisible();
    await fillField(page, "title", workOrderTitle);
    await selectField(page, "status", "new");
    await chooseLookup(page, "company_id", companyName);
    await chooseLookup(page, "contact_id", contactName);
    await chooseLookup(page, "service_site_id", siteName);
    const workOrderId = await saveFormAndWaitForCreate(page, "work_order");
    await assertListUrl(page, workspaceSlug, "work-orders");
    const workOrder = await page.request.get(
      `/api/workspaces/${workspaceId}/objects/work_order/records/${workOrderId}`,
    );
    const workOrderData = (await workOrder.json()).data as Record<string, unknown>;
    expect(String(workOrderData.company_id)).toBe(companyId);
    expect(String(workOrderData.contact_id)).toBe(contactId);
    expect(String(workOrderData.service_site_id)).toBe(siteId);

    // 5. Detail surface shows the fresh party names
    await page.goto(`/w/${workspaceSlug}/work-orders/${workOrderId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(workOrderTitle, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(companyName, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(contactName, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(siteName, { exact: false }).first()).toBeVisible();
  });
});
