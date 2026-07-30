import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

interface ApiEvidence {
  finalDecision: "PASS" | "FAIL";
  commit: string;
  workingTreeDirty: boolean;
  records: {
    workspaceId: string | null;
    workspaceSlug: string | null;
    quoteId: string | null;
    workOrderId: string | null;
    visitId: string | null;
    formSubmissionId: string | null;
  };
}

let evidence: ApiEvidence;

test.beforeAll(() => {
  const resultPath = process.env.RUNORY_E2E_RESULT_PATH;
  expect(resultPath, "RUNORY_E2E_RESULT_PATH must point to a validated API walkthrough artifact").toBeTruthy();
  evidence = JSON.parse(readFileSync(resolve(resultPath!), "utf8")) as ApiEvidence;

  const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { encoding: "utf8" },
  ).trim().length > 0;

  expect(evidence.finalDecision).toBe("PASS");
  expect(evidence.commit).toBe(currentCommit);
  expect(evidence.workingTreeDirty).toBe(false);
  expect(dirty, "Browser evidence is binding only for a clean working tree").toBe(false);
  for (const [key, value] of Object.entries(evidence.records)) {
    expect(value, `API evidence records.${key} is required`).toBeTruthy();
  }
});

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

async function semanticRecordText(page: Page, objectKey: string, recordId: string) {
  const response = await page.request.get(
    `/api/workspaces/${evidence.records.workspaceId}/objects/${objectKey}/records/${recordId}`,
  );
  expect(response.ok(), `Read fresh ${objectKey} ${recordId}`).toBeTruthy();
  const record = (await response.json()).data as Record<string, unknown>;
  // Prefer the business-facing title/name because dynamic detail views may
  // intentionally omit internal or secondary reference-number fields.
  for (const key of ["title", "name", "quote_number", "work_order_number", "visit_number", "submission_number"]) {
    if (typeof record?.[key] === "string" && record[key]) return String(record[key]);
  }
  return null;
}

async function formSubmissionEvidenceText(page: Page, submissionId: string) {
  const response = await page.request.get(
    `/api/workspaces/${evidence.records.workspaceId}/forms/submissions/${submissionId}`,
  );
  expect(response.ok(), `Read fresh Form Submission ${submissionId}`).toBeTruthy();
  const submission = (await response.json()).data as { answers_json?: string };
  const answers = JSON.parse(submission.answers_json ?? "{}") as Record<string, unknown>;
  const workPerformed = answers.work_performed;
  expect(typeof workPerformed, "Fresh Form Submission has work_performed evidence").toBe("string");
  return String(workPerformed);
}

async function assertSurface(
  page: Page,
  path: string,
  expectedText: string | null,
  testInfo: TestInfo,
  ready?: (page: Page) => Promise<void>,
) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.ok(), `${path} returns a successful document`).toBeTruthy();
  const body = page.locator("body");
  await expect(body).not.toHaveText("");
  await expect.poll(
    async () => (await body.innerText()).trim().length,
    { message: `${path} renders meaningful content beyond its loading shell` },
  ).toBeGreaterThan(50);
  if (ready) await ready(page);
  await expect(page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay"))
    .toHaveCount(0);
  if (expectedText) await expect(page.getByText(expectedText, { exact: false }).first()).toBeVisible();
  await expect(
    page.locator("a, button, input, select, textarea").first(),
    `${path} exposes an interactive surface`,
  ).toBeVisible();

  await expect.poll(
    () => page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
    { message: `${path} must settle without horizontal viewport overflow` },
  ).toBeLessThanOrEqual(2);
  expect(consoleErrors, `${path} console errors`).toEqual([]);
  expect(pageErrors, `${path} page errors`).toEqual([]);
  const surfaceName = path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-${surfaceName}.png`),
    fullPage: true,
  });
}

test("owner dashboard renders without browser errors", async ({ page }, testInfo) => {
  await switchPersona(page, "dev-local-owner");
  await assertSurface(
    page,
    `/w/${evidence.records.workspaceSlug}/dashboard`,
    null,
    testInfo,
    async (dashboardPage) => {
      await expect(
        dashboardPage.locator("main .animate-pulse"),
        "Dashboard evidence must contain loaded widgets rather than skeletons",
      ).toHaveCount(0);
    },
  );
});

test("sales representative sees the fresh Quote projection", async ({ page }, testInfo) => {
  await switchPersona(page, "persona:sales-rep");
  const expectedText = await semanticRecordText(page, "quote", evidence.records.quoteId!);
  await assertSurface(
    page,
    `/w/${evidence.records.workspaceSlug}/quotes/${evidence.records.quoteId}`,
    expectedText,
    testInfo,
  );
});

test("dispatcher sees the fresh Work Order and planning surface", async ({ page }, testInfo) => {
  await switchPersona(page, "persona:dispatcher");
  const expectedText = await semanticRecordText(page, "work_order", evidence.records.workOrderId!);
  await assertSurface(
    page,
    `/w/${evidence.records.workspaceSlug}/work-orders/${evidence.records.workOrderId}`,
    expectedText,
    testInfo,
  );
  await assertSurface(page, `/w/${evidence.records.workspaceSlug}/planning`, null, testInfo);
});

test("technician sees the fresh Visit projection", async ({ page }, testInfo) => {
  await switchPersona(page, "persona:technician");
  const expectedText = await semanticRecordText(page, "service_visit", evidence.records.visitId!);
  await assertSurface(
    page,
    `/w/${evidence.records.workspaceSlug}/service-visits/${evidence.records.visitId}`,
    expectedText,
    testInfo,
  );
});

test("supervisor sees the fresh Form Submission projection", async ({ page }, testInfo) => {
  await switchPersona(page, "persona:supervisor");
  const expectedText = await formSubmissionEvidenceText(page, evidence.records.formSubmissionId!);
  await assertSurface(
    page,
    `/w/${evidence.records.workspaceSlug}/service-visits/${evidence.records.visitId}`,
    expectedText,
    testInfo,
  );
});
