import { expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  const body = await response.json().catch(() => ({} as {
    success?: boolean;
    error?: { message?: string };
  }));
  expect(
    response.ok(),
    `${String(urlIncludes)} HTTP ok: ${body.error?.message ?? response.status()}`,
  ).toBeTruthy();
  if ("success" in body) {
    expect(
      body.success,
      `${String(urlIncludes)} succeeds: ${body.error?.message ?? "unknown"}`,
    ).toBeTruthy();
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

export function loadCloudEnv(envPath = resolve(__dirname, "../.env.local")): NodeJS.ProcessEnv {
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

export function syncPackPermissionGroups() {
  execFileSync("pnpm", ["exec", "tsx", "scripts/sync-pack-permission-groups.mjs"], {
    cwd: resolve(__dirname, ".."),
    env: loadCloudEnv(),
    stdio: "pipe",
  });
}

export async function ensureFsmRoleAssignments(page: Page, workspaceId: string) {
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
  const fsmGroups = groups.filter((group) => group.packId === "fsm-pack");
  const wanted = [
    ["dispatcher", "Lisa Wang"],
    ["field_technician", "David Park"],
    ["service_supervisor", "Robert Kim"],
  ] as const;
  for (const [groupKey, displayName] of wanted) {
    const group = fsmGroups.find((item) => item.groupKey === groupKey);
    const userId = byName.get(displayName);
    expect(group?.id, `fsm ${groupKey} group`).toBeTruthy();
    expect(userId, `${displayName} user id`).toBeTruthy();
    const response = await page.request.post(
      `/api/workspaces/${workspaceId}/permission-groups/${group!.id}/assignments`,
      {
        data: { userId },
        headers: { "X-Requested-With": "XMLHttpRequest" },
      },
    );
    expect(response.ok(), `assign ${displayName} to ${groupKey}`).toBeTruthy();
  }
}

export function localDateTimeOffset(hoursFromNow: number): string {
  const date = new Date(Date.now() + hoursFromNow * 3_600_000);
  return formatLocalDateTime(date);
}

export function formatLocalDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Far-future, call-unique window so repeated G2-S2 runs do not stack David Park conflicts. */
export function uniqueDispatchWindow(durationHours = 2): { start: string; end: string } {
  const nonce = process.hrtime.bigint();
  // Spread by unique minutes across a wide far-future band (avoids 2h overlaps from back-to-back runs).
  const startMs = Date.now() + 180 * 86_400_000 + Number(nonce % 8_000_000n) * 60_000;
  const start = new Date(startMs);
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + durationHours * 3_600_000);
  return { start: formatLocalDateTime(start), end: formatLocalDateTime(end) };
}

export async function createConvertedWorkOrder(
  page: Page,
  workspace: WorkspaceContext,
  runToken: string,
) {
  const quoteNumber = `Q-${runToken}`;
  const quoteTitle = `${runToken} Commercial repair proposal`;
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

  await page.goto(`/w/${workspace.workspaceSlug}/quotes/${quoteId}`, { waitUntil: "domcontentloaded" });
  await clickAndAwaitPost(
    page,
    /^(Submit for approval|提交审批|提交批准)$/,
    "/commands/quote.submit_for_approval",
  );
  await expectRecordStatus(page, workspace.workspaceId, "quote", quoteId, "in_review");

  await switchPersona(page, "persona:sales-manager");
  await approveInReviewQuote(page, workspace.workspaceSlug, workspace.workspaceId, quoteId);

  await switchPersona(page, "dev-local-owner");
  await page.goto(`/w/${workspace.workspaceSlug}/quotes/${quoteId}`, { waitUntil: "domcontentloaded" });
  await clickAndAwaitPost(page, /^(Mark as sent|标记已发送)$/, "/commands/quote.mark_sent");
  await expectRecordStatus(page, workspace.workspaceId, "quote", quoteId, "sent");
  await page.goto(`/w/${workspace.workspaceSlug}/quotes/${quoteId}`, { waitUntil: "domcontentloaded" });
  await clickAndAwaitPost(page, /^(Accept|接受)$/, "/commands/quote.accept");
  await expectRecordStatus(page, workspace.workspaceId, "quote", quoteId, "accepted");
  await page.goto(`/w/${workspace.workspaceSlug}/quotes/${quoteId}`, { waitUntil: "domcontentloaded" });
  await clickAndAwaitPost(
    page,
    /^(Convert to Work Order|转换为工单)$/,
    "/commands/quote.convert_to_work_order",
  );
  await expectRecordStatus(page, workspace.workspaceId, "quote", quoteId, "converted");

  const quote = await getRecord(page, workspace.workspaceId, "quote", quoteId);
  const workOrderId = String(quote.work_order_id ?? "");
  expect(workOrderId).toBeTruthy();

  return {
    quoteId,
    workOrderId,
    companyId,
    contactId,
    siteId,
    companyName,
    contactName,
    siteName,
    quoteTitle,
  };
}

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export async function findVisitForWorkOrder(
  page: Page,
  workspaceId: string,
  workOrderId: string,
) {
  let visitId = "";
  await expect.poll(async () => {
    const response = await page.request.get(
      `/api/workspaces/${workspaceId}/objects/service_visit/records?limit=100`,
    );
    if (!response.ok()) return false;
    const body = await response.json();
    const records = (body.data ?? []) as Array<Record<string, unknown>>;
    const visit = records.find((record) => String(record.work_order_id ?? "") === workOrderId);
    if (!visit?.id) return false;
    visitId = String(visit.id);
    return true;
  }, { timeout: 30_000, message: "service visit appears for work order" }).toBeTruthy();
  return visitId;
}

export async function getVisitWorkItemId(page: Page, workspaceId: string, visitId: string) {
  const response = await page.request.get(
    `/api/workspaces/${workspaceId}/service-visits/${visitId}/execution`,
  );
  expect(response.ok(), "visit execution requirements").toBeTruthy();
  const body = await response.json();
  const requirements = (body.data?.requirements ?? []) as Array<Record<string, unknown>>;
  const workItemId = requirements.map((item) => item.work_item_id).find(Boolean);
  expect(workItemId, "required form work_item_id").toBeTruthy();
  return String(workItemId);
}

export async function fillServiceVisitCompletionForm(page: Page, workPerformed: string) {
  await expect(page.getByRole("button", { name: /^(Submit Form|提交表单)$/ })).toBeVisible({
    timeout: 30_000,
  });

  const passButtons = page.getByRole("button", { name: /^Pass$/ });
  await expect(passButtons).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await passButtons.nth(index).click();
  }

  await page.getByLabel(/^Work Performed/).fill(workPerformed);
  await page.getByLabel(/^System Status After Service/).selectOption("operational");

  const galleryInput = page.locator('input[type="file"][multiple]').first();
  await galleryInput.setInputFiles([
    { name: "before.png", mimeType: "image/png", buffer: TINY_PNG },
    { name: "after.png", mimeType: "image/png", buffer: TINY_PNG },
  ]);
  await expect(page.getByText(/Uploading/)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText(/\(2\/2\)/)).toBeVisible({ timeout: 30_000 });

  await page.getByPlaceholder(/Signer name/).fill("G2 Field Customer");
  await page.getByRole("button", { name: /^I acknowledge$/ }).click();
  await expect(page.getByText(/Signed at/)).toBeVisible();

  await page.locator('[title="Demo identity"]').evaluate((el) => {
    (el as HTMLElement).style.display = "none";
  }).catch(() => undefined);
  await page.locator('nav[aria-label="Mobile navigation"]').evaluate((el) => {
    (el as HTMLElement).style.display = "none";
  }).catch(() => undefined);

  const submitButton = page.getByRole("button", { name: /^(Submit Form|提交表单)$/ });
  await submitButton.scrollIntoViewIfNeeded();
  const submit = page.waitForResponse((response) => {
    return response.request().method() === "POST"
      && response.url().includes("/forms/submissions")
      && response.status() < 500;
  }, { timeout: 30_000 });
  await submitButton.evaluate((el: HTMLButtonElement) => el.click());
  const response = await submit;
  const body = await response.json().catch(() => ({} as { success?: boolean; error?: { message?: string } }));
  expect(
    response.ok(),
    `form submit HTTP ok: ${body.error?.message ?? response.status()}`,
  ).toBeTruthy();
  if ("success" in body) expect(body.success).toBeTruthy();
}

/** Triage → dispatch → field form → supervisor complete for a quote-sourced WO. */
export async function dispatchAndCompleteWorkOrder(
  page: Page,
  workspace: WorkspaceContext,
  workOrderId: string,
  runToken: string,
  companyName?: string,
) {
  await switchPersona(page, "persona:dispatcher");
  await page.goto(`/w/${workspace.workspaceSlug}/work-orders/${workOrderId}`, {
    waitUntil: "domcontentloaded",
  });
  if (companyName) {
    await expect(page.getByText(companyName, { exact: false }).first()).toBeVisible();
  }
  await clickAndAwaitPost(page, /^(Triage|分诊)$/, "/commands/work_order.triage");
  await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "triaged");

  await page.goto(`/w/${workspace.workspaceSlug}/work-orders/${workOrderId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: /^(Plan & dispatch|计划并派工)$/ }).first().click();
  await expect(page.getByRole("button", { name: /^(Dispatch visit|派发访问)$/ })).toBeVisible();
  await page.getByLabel(/^Technician/).selectOption({ label: "David Park" });
  const window = uniqueDispatchWindow();
  await page.getByLabel(/^Scheduled start/).fill(window.start);
  await page.getByLabel(/^Scheduled end/).fill(window.end);
  await page.getByLabel(/^Dispatch notes/).fill(`${runToken} dispatch`);
  const dispatchBody = await clickAndAwaitPost(
    page,
    /^(Dispatch visit|派发访问)$/,
    "/commands/work_order.create_visit",
  );
  const conflictHint = JSON.stringify(dispatchBody);
  expect(
    conflictHint.includes('"conflictState":"conflict"')
      || conflictHint.includes('"conflict_state":"conflict"'),
    `dispatch must not create a conflicted schedule (window ${window.start}–${window.end})`,
  ).toBeFalsy();
  await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "planned");

  const visitId = await findVisitForWorkOrder(page, workspace.workspaceId, workOrderId);
  const workItemId = await getVisitWorkItemId(page, workspace.workspaceId, visitId);

  await switchPersona(page, "persona:technician");
  await page.goto(`/w/${workspace.workspaceSlug}/service-visits/${visitId}`, {
    waitUntil: "domcontentloaded",
  });
  await clickAndAwaitPost(page, /^(Start travel|开始行程)$/, "/commands/visit.start_travel");
  await expectRecordStatus(page, workspace.workspaceId, "service_visit", visitId, "en_route");

  await page.goto(`/w/${workspace.workspaceSlug}/service-visits/${visitId}`, {
    waitUntil: "domcontentloaded",
  });
  await clickAndAwaitPost(page, /^(Arrive on site|到达现场)$/, "/commands/visit.arrive");
  await expectRecordStatus(page, workspace.workspaceId, "service_visit", visitId, "on_site");

  await page.goto(`/m/w/${workspace.workspaceSlug}/work/${workItemId}/form`, {
    waitUntil: "domcontentloaded",
  });
  await fillServiceVisitCompletionForm(page, `${runToken} replaced filters and verified airflow.`);

  await page.goto(`/w/${workspace.workspaceSlug}/service-visits/${visitId}`, {
    waitUntil: "domcontentloaded",
  });
  await clickAndAwaitPost(page, /^(Complete visit|完成访问)$/, "/commands/visit.complete");
  await expectRecordStatus(page, workspace.workspaceId, "service_visit", visitId, "completed");

  await switchPersona(page, "persona:supervisor");
  await page.goto(`/w/${workspace.workspaceSlug}/work-orders/${workOrderId}`, {
    waitUntil: "domcontentloaded",
  });
  await clickAndAwaitPost(page, /^(Start work|开始工作)$/, "/commands/work_order.start");
  await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "in_progress");

  await page.goto(`/w/${workspace.workspaceSlug}/work-orders/${workOrderId}`, {
    waitUntil: "domcontentloaded",
  });
  page.once("dialog", async (dialog) => {
    await dialog.accept(`${runToken} closed`);
  });
  await clickAndAwaitPost(page, /^(Complete|完成)$/, "/commands/work_order.complete");
  await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "completed");

  return { visitId, workItemId };
}

/** Quote commercial loop + field completion → completed quote-sourced Work Order. */
export async function createCompletedQuoteWorkOrder(
  page: Page,
  workspace: WorkspaceContext,
  runToken: string,
) {
  const created = await createConvertedWorkOrder(page, workspace, runToken);
  const { visitId } = await dispatchAndCompleteWorkOrder(
    page,
    workspace,
    created.workOrderId,
    runToken,
    created.companyName,
  );
  return { ...created, visitId };
}

