import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, execute, genId, now, queryOne } from "./db";
import { runMigrations } from "./migrations";
import { TABLES } from "./contracts";
import { hasOperationalTeamAccess } from "./visibility";
import { getMyWork } from "./workflow";
import {
  assignBusinessRole,
  getBusinessRoles,
  getUserPermissionGroups,
  removeBusinessRoleAssignment,
  syncPackPermissionGroups,
} from "./permission-groups";

async function resetDatabase(): Promise<void> {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows as unknown as Array<{ name: string }>) {
    await db.execute({ sql: `DROP TABLE IF EXISTS "${row.name}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

describe("composable business roles", () => {
  const workspaceId = "ws_business_roles";
  const userId = "usr_sales_manager";

  beforeAll(async () => {
    await resetDatabase();
    const timestamp = now();
    await execute(
      `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      [workspaceId, "Role Test", `role-test-${genId("slug")}`, timestamp, timestamp]
    );
    await syncPackPermissionGroups(workspaceId, "crm-lite-pack", [{
      key: "sales_admin",
      label: "Sales Admin",
      permissions: ["deal.read", "deal.update"],
      businessRole: { key: "sales_manager", label: "Sales Manager" },
    }]);
    await syncPackPermissionGroups(workspaceId, "sales-quote-pack", [{
      key: "sales_manager",
      label: "Sales Manager",
      permissions: ["quote.read", "quote.approve"],
      businessRole: { key: "sales_manager", label: "Sales Manager" },
    }]);
    await assignBusinessRole(workspaceId, "sales_manager", userId, "test");
  });

  afterAll(async () => {
    await db.close();
  });

  it("aggregates installed Pack contributions behind one stable role", async () => {
    const roles = await getBusinessRoles(workspaceId);
    expect(roles).toHaveLength(1);
    expect(roles[0]).toMatchObject({
      roleKey: "sales_manager",
      packIds: ["crm-lite-pack", "sales-quote-pack"],
    });
    expect(new Set(roles[0].permissions)).toEqual(new Set([
      "deal.read", "deal.update", "quote.read", "quote.approve",
    ]));

    const groups = await getUserPermissionGroups(workspaceId, userId);
    expect(new Set(groups.flatMap((group) => group.permissions))).toEqual(new Set([
      "deal.read", "deal.update", "quote.read", "quote.approve",
    ]));
  });

  it("preserves the role assignment while Pack contributions are removed and restored", async () => {
    await execute(
      `DELETE FROM ${TABLES.packPermissionGroups} WHERE workspace_id = ? AND pack_id = ?`,
      [workspaceId, "sales-quote-pack"]
    );
    let permissions = (await getUserPermissionGroups(workspaceId, userId)).flatMap((group) => group.permissions);
    expect(permissions).toContain("deal.read");
    expect(permissions).not.toContain("quote.read");

    await syncPackPermissionGroups(workspaceId, "sales-quote-pack", [{
      key: "sales_manager",
      label: "Sales Manager",
      permissions: ["quote.read", "quote.approve"],
      businessRole: { key: "sales_manager", label: "Sales Manager" },
    }]);
    permissions = (await getUserPermissionGroups(workspaceId, userId)).flatMap((group) => group.permissions);
    expect(permissions).toContain("quote.read");

    const assignment = await queryOne<{ role_key: string }>(
      `SELECT role_key FROM ${TABLES.businessRoleAssignments}
       WHERE workspace_id = ? AND user_id = ?`,
      [workspaceId, userId]
    );
    expect(assignment?.role_key).toBe("sales_manager");
  });

  it("revokes every contributed permission when the stable role is removed", async () => {
    await removeBusinessRoleAssignment(workspaceId, "sales_manager", userId);
    expect(await getUserPermissionGroups(workspaceId, userId)).toEqual([]);
  });

  it("keeps sales approval scope separate from FSM team scope", async () => {
    const scopeWorkspaceId = "ws_domain_scope";
    const salesManagerId = "usr_domain_sales_manager";
    const dispatcherId = "usr_domain_dispatcher";
    const timestamp = now();
    await execute(
      `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      [scopeWorkspaceId, "Domain Scope", `domain-scope-${genId("slug")}`, timestamp, timestamp]
    );
    for (const [id, externalId, name] of [
      [salesManagerId, "persona:domain-sales-manager", "Domain Sales Manager"],
      [dispatcherId, "persona:domain-dispatcher", "Domain Dispatcher"],
    ]) {
      await execute(
        `INSERT INTO ${TABLES.users} (id, external_id, display_name, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)`,
        [id, externalId, name, timestamp, timestamp]
      );
    }
    await syncPackPermissionGroups(scopeWorkspaceId, "sales-quote-pack", [{
      key: "sales_manager",
      label: "Sales Manager",
      permissions: ["quote.read", "workflow.approval.decide"],
      businessRole: { key: "sales_manager", label: "Sales Manager" },
    }]);
    await syncPackPermissionGroups(scopeWorkspaceId, "fsm-pack", [{
      key: "dispatcher",
      label: "Dispatcher",
      permissions: ["work_order.read", "assignment.manage", "schedule.manage"],
      businessRole: { key: "dispatcher", label: "Dispatcher" },
    }]);
    await assignBusinessRole(scopeWorkspaceId, "sales_manager", salesManagerId, "test");
    await assignBusinessRole(scopeWorkspaceId, "dispatcher", dispatcherId, "test");

    for (const [id, assigneeType, assigneeId] of [
      ["wi_sales_approval", "permission_group", "sales_manager"],
      ["wi_sales_direct", "user", salesManagerId],
    ]) {
      await execute(
        `INSERT INTO ${TABLES.workItems}
         (id, workspace_id, instance_id, step_id, kind, status, assignee_type, assignee_id, version, created_at, updated_at)
         VALUES (?, ?, 'instance', 'approval', 'approval', 'ready', ?, ?, 1, ?, ?)`,
        [id, scopeWorkspaceId, assigneeType, assigneeId, timestamp, timestamp]
      );
    }

    await expect(hasOperationalTeamAccess(scopeWorkspaceId, {
      userId: "persona:domain-sales-manager",
      role: "member",
    })).resolves.toBe(false);
    await expect(hasOperationalTeamAccess(scopeWorkspaceId, {
      userId: "persona:domain-dispatcher",
      role: "member",
    })).resolves.toBe(true);

    const salesQueue = await getMyWork(scopeWorkspaceId, "persona:domain-sales-manager");
    expect(salesQueue.items.map((item) => item.id).sort()).toEqual([
      "wi_sales_approval",
      "wi_sales_direct",
    ]);
  });
});
