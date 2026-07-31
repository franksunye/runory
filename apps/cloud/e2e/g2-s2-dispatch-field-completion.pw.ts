import { expect, test } from "@playwright/test";
import {
  createConvertedWorkOrder,
  dispatchAndCompleteWorkOrder,
  ensureFsmRoleAssignments,
  ensureSalesQuoteRoleAssignments,
  getRecord,
  resolveWorkspace,
  switchPersona,
  syncPackPermissionGroups,
} from "./_helpers";

/**
 * G2-S2 — Dispatch and field completion
 *
 * Fresh Quote→WO (S1 helper) → Dispatcher triage + Plan & dispatch →
 * Technician travel/arrive + required form/evidence → Supervisor start/complete WO.
 */

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
    const { visitId } = await dispatchAndCompleteWorkOrder(
      page,
      workspace,
      workOrderId,
      runToken,
      companyName,
    );

    const workOrder = await getRecord(page, workspace.workspaceId, "work_order", workOrderId);
    expect(String(workOrder.status)).toBe("completed");
    const visit = await getRecord(page, workspace.workspaceId, "service_visit", visitId);
    expect(String(visit.status)).toBe("completed");
  });
});
