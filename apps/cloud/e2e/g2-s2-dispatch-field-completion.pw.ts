import { expect, test, type Page } from "@playwright/test";
import {
  clickAndAwaitPost,
  createConvertedWorkOrder,
  ensureFsmRoleAssignments,
  ensureSalesQuoteRoleAssignments,
  expectRecordStatus,
  getRecord,
  resolveWorkspace,
  switchPersona,
  syncPackPermissionGroups,
  uniqueDispatchWindow,
} from "./_helpers";

/**
 * G2-S2 — Dispatch and field completion
 *
 * Fresh Quote→WO (S1 helper) → Dispatcher triage + Plan & dispatch →
 * Technician travel/arrive + required form/evidence → Supervisor start/complete WO.
 */

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function findVisitForWorkOrder(page: Page, workspaceId: string, workOrderId: string) {
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

async function getVisitWorkItemId(page: Page, workspaceId: string, visitId: string) {
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

async function fillServiceVisitCompletionForm(page: Page) {
  await expect(page.getByRole("button", { name: /^(Submit Form|提交表单)$/ })).toBeVisible({
    timeout: 30_000,
  });

  const passButtons = page.getByRole("button", { name: /^Pass$/ });
  await expect(passButtons).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await passButtons.nth(index).click();
  }

  await page.getByLabel(/^Work Performed/).fill("G2-S2 replaced filters and verified airflow.");
  await page.getByLabel(/^System Status After Service/).selectOption("operational");

  const galleryInput = page.locator('input[type="file"][multiple]').first();
  await galleryInput.setInputFiles([
    { name: "before.png", mimeType: "image/png", buffer: TINY_PNG },
    { name: "after.png", mimeType: "image/png", buffer: TINY_PNG },
  ]);
  await expect(page.getByText(/Uploading/)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText(/\(2\/2\)/)).toBeVisible({ timeout: 30_000 });

  await page.getByPlaceholder(/Signer name/).fill("G2-S2 Customer");
  await page.getByRole("button", { name: /^I acknowledge$/ }).click();
  await expect(page.getByText(/Signed at/)).toBeVisible();

  // Persona FAB + mobile tab bar sit over the sticky submit control on Pixel viewports.
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

test.describe("G2-S2 dispatch and field completion", () => {
  test.beforeAll(() => {
    syncPackPermissionGroups();
  });

  test("dispatcher plans visit; technician completes form; supervisor closes WO", async ({ page }) => {
    test.setTimeout(240_000);

    const runToken = `G2S2-${Date.now()}`;
    await switchPersona(page, "dev-local-owner");
    const workspace = await resolveWorkspace(page);
    await ensureSalesQuoteRoleAssignments(page, workspace.workspaceId);
    await ensureFsmRoleAssignments(page, workspace.workspaceId);

    const { workOrderId, companyName } = await createConvertedWorkOrder(
      page,
      workspace,
      runToken,
    );
    await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "new");

    await switchPersona(page, "persona:dispatcher");
    await page.goto(`/w/${workspace.workspaceSlug}/work-orders/${workOrderId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText(companyName, { exact: false }).first()).toBeVisible();
    await clickAndAwaitPost(page, /^(Triage|分诊)$/, "/commands/work_order.triage");
    await expectRecordStatus(page, workspace.workspaceId, "work_order", workOrderId, "triaged");

    await page.goto(`/w/${workspace.workspaceSlug}/work-orders/${workOrderId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: /^(Plan & dispatch|计划并派工)$/ }).first().click();
    await expect(page.getByRole("button", { name: /^(Dispatch visit|派发访问)$/ })).toBeVisible();
    await page.getByLabel(/^Technician/).selectOption({ label: "David Park" });
    // Unique far-future slot avoids SCHEDULE_CONFLICT with seeded/prior e2e visits
    // (completed visits still leave confirmed schedule rows that detectConflicts counts).
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
    await fillServiceVisitCompletionForm(page);

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

    const workOrder = await getRecord(page, workspace.workspaceId, "work_order", workOrderId);
    expect(String(workOrder.status)).toBe("completed");
    const visit = await getRecord(page, workspace.workspaceId, "service_visit", visitId);
    expect(String(visit.status)).toBe("completed");
  });
});
