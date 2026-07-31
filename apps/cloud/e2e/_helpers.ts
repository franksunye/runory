import { expect, type Page } from "@playwright/test";

export interface WorkspaceContext {
  workspaceId: string;
  workspaceSlug: string;
}

export async function switchPersona(page: Page, personaId: string) {
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

export async function resolveWorkspace(page: Page): Promise<WorkspaceContext> {
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

export async function fillField(page: Page, fieldKey: string, value: string) {
  await page.locator(`#field-${fieldKey}`).fill(value);
}

export async function selectField(page: Page, fieldKey: string, value: string) {
  await page.locator(`#field-${fieldKey}`).selectOption(value);
}

export async function chooseLookup(page: Page, fieldKey: string, searchText: string) {
  const field = page.locator(`#field-${fieldKey}`);
  await field.click();
  await field.fill(searchText);
  const option = page.getByRole("option", { name: searchText });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await expect(field).toHaveValue(searchText);
}

export async function saveFormAndWaitForCreate(page: Page, objectKey: string) {
  const responsePromise = page.waitForResponse((response) => {
    if (response.request().method() !== "POST") return false;
    if (!response.url().includes(`/objects/${objectKey}/records`)) return false;
    return !/\/records\/[^/?]+$/.test(new URL(response.url()).pathname);
  }, { timeout: 30_000 });
  await page.getByRole("button", { name: /^(Save|保存)$/ }).click();
  const response = await responsePromise;
  const body = await response.json().catch(() => ({} as {
    success?: boolean;
    error?: { message?: string };
    data?: { id?: string };
    id?: string;
  }));
  expect(
    response.ok() && body.success !== false,
    `${objectKey} create succeeds: ${body.error?.message ?? response.status()}`,
  ).toBeTruthy();
  const id = body.data?.id ?? body.id;
  expect(id, `${objectKey} create returns id`).toBeTruthy();
  return String(id);
}

export async function assertListUrl(page: Page, workspaceSlug: string, segment: string) {
  await expect(page).toHaveURL(
    new RegExp(`/w/${workspaceSlug}/${segment}/?(?:\\?.*)?$`),
  );
}

export async function createCustomerParties(
  page: Page,
  workspace: WorkspaceContext,
  runToken: string,
) {
  const companyName = `${runToken} Customer Co`;
  const contactName = `${runToken} Contact`;
  const siteName = `${runToken} Site`;
  const { workspaceId, workspaceSlug } = workspace;

  await page.goto(`/w/${workspaceSlug}/companies/new`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#field-name")).toBeVisible();
  await fillField(page, "name", companyName);
  await selectField(page, "lifecycle_stage", "customer");
  const companyId = await saveFormAndWaitForCreate(page, "company");
  await assertListUrl(page, workspaceSlug, "companies");

  await page.goto(`/w/${workspaceSlug}/contacts/new`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#field-name")).toBeVisible();
  await fillField(page, "name", contactName);
  await fillField(page, "email", `${runToken.toLowerCase().replace(/[^a-z0-9]/g, "")}@example.test`);
  await chooseLookup(page, "primary_company_id", companyName);
  await selectField(page, "lifecycle_stage", "customer");
  const contactId = await saveFormAndWaitForCreate(page, "contact");
  await assertListUrl(page, workspaceSlug, "contacts");

  await page.goto(`/w/${workspaceSlug}/service-sites/new`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#field-name")).toBeVisible();
  await fillField(page, "name", siteName);
  await fillField(page, "address", `${runToken} Warehouse Road`);
  await chooseLookup(page, "company_id", companyName);
  await chooseLookup(page, "primary_contact_id", contactName);
  await selectField(page, "status", "active");
  const siteId = await saveFormAndWaitForCreate(page, "service_site");
  await assertListUrl(page, workspaceSlug, "service-sites");

  const company = await page.request.get(
    `/api/workspaces/${workspaceId}/objects/company/records/${companyId}`,
  );
  expect((await company.json()).data.lifecycle_stage).toBe("customer");

  return { companyId, contactId, siteId, companyName, contactName, siteName };
}

export async function getRecord(
  page: Page,
  workspaceId: string,
  objectKey: string,
  recordId: string,
) {
  const response = await page.request.get(
    `/api/workspaces/${workspaceId}/objects/${objectKey}/records/${recordId}`,
  );
  expect(response.ok(), `read ${objectKey} ${recordId}`).toBeTruthy();
  return (await response.json()).data as Record<string, unknown>;
}

export async function expectRecordStatus(
  page: Page,
  workspaceId: string,
  objectKey: string,
  recordId: string,
  status: string,
) {
  await expect.poll(async () => {
    const record = await getRecord(page, workspaceId, objectKey, recordId);
    return String(record.status ?? "");
  }, { timeout: 30_000, message: `${objectKey} reaches status ${status}` }).toBe(status);
}

export async function clickAndAwaitPost(
  page: Page,
  buttonName: RegExp,
  urlIncludes: string | RegExp,
) {
  const matchesUrl = (url: string) =>
    typeof urlIncludes === "string" ? url.includes(urlIncludes) : urlIncludes.test(url);
  const responsePromise = page.waitForResponse((response) => {
    return response.request().method() === "POST"
      && matchesUrl(response.url())
      && response.status() < 500;
  }, { timeout: 30_000 });
  await page.getByRole("button", { name: buttonName }).first().click();
  const response = await responsePromise;
  const body = await response.json().catch(() => ({} as { success?: boolean }));
  expect(response.ok(), `${String(urlIncludes)} HTTP ok`).toBeTruthy();
  if ("success" in body) {
    expect(body.success, `${String(urlIncludes)} succeeds`).toBeTruthy();
  }
  return body;
}

export async function approveInReviewQuote(
  page: Page,
  workspaceSlug: string,
  workspaceId: string,
  quoteId: string,
) {
  await page.goto(`/w/${workspaceSlug}/quotes/${quoteId}`, { waitUntil: "domcontentloaded" });
  const claim = page.getByRole("button", { name: /^(Claim|认领)$/ }).first();
  if (await claim.isVisible().catch(() => false)) {
    await clickAndAwaitPost(page, /^(Claim|认领)$/, /\/work-items\/[^/]+\/claim/);
    await page.goto(`/w/${workspaceSlug}/quotes/${quoteId}`, { waitUntil: "domcontentloaded" });
  }

  const approve = page.getByRole("button", { name: /^(Approve|批准)$/ }).first();
  await expect(approve, "Approve action is available for Sales Manager").toBeVisible();
  const responsePromise = page.waitForResponse((response) => {
    if (response.request().method() !== "POST" || response.status() >= 500) return false;
    const url = response.url();
    return url.includes("/decisions") || url.includes("/commands/quote.approve");
  }, { timeout: 30_000 });
  await approve.click();
  const response = await responsePromise;
  const body = await response.json().catch(() => ({} as { success?: boolean }));
  expect(response.ok(), "approve HTTP ok").toBeTruthy();
  if ("success" in body) expect(body.success).toBeTruthy();
  await expectRecordStatus(page, workspaceId, "quote", quoteId, "approved");
}

export async function ensureSalesQuoteRoleAssignments(
  page: Page,
  workspaceId: string,
) {
  await switchPersona(page, "dev-local-owner");
  const [groupsRes, peopleRes] = await Promise.all([
    page.request.get(`/api/workspaces/${workspaceId}/permission-groups`),
    page.request.get(`/api/workspaces/${workspaceId}/people`),
  ]);
  expect(groupsRes.ok()).toBeTruthy();
  expect(peopleRes.ok()).toBeTruthy();
  const groups = (await groupsRes.json()).data as Array<Record<string, string>>;
  const people = (await peopleRes.json()).data as Array<Record<string, string>>;
  const byName = new Map(people.map((person) => [person.displayName, person.id]));
  const salesQuoteGroups = groups.filter((group) => group.packId === "sales-quote-pack");
  const repGroup = salesQuoteGroups.find((group) => group.groupKey === "sales_representative");
  const managerGroup = salesQuoteGroups.find((group) => group.groupKey === "sales_manager");
  expect(repGroup?.id, "sales-quote sales_representative group").toBeTruthy();
  expect(managerGroup?.id, "sales-quote sales_manager group").toBeTruthy();
  const sarahId = byName.get("Sarah Chen");
  const michaelId = byName.get("Michael Torres");
  expect(sarahId, "Sarah Chen user id").toBeTruthy();
  expect(michaelId, "Michael Torres user id").toBeTruthy();
  for (const [groupId, userId] of [
    [repGroup!.id, sarahId!],
    [managerGroup!.id, michaelId!],
  ] as const) {
    const response = await page.request.post(
      `/api/workspaces/${workspaceId}/permission-groups/${groupId}/assignments`,
      {
        data: { userId },
        headers: { "X-Requested-With": "XMLHttpRequest" },
      },
    );
    expect(response.ok(), `assign ${userId} to ${groupId}`).toBeTruthy();
  }
}
