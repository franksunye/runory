import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CommandContract } from "@runory/contracts";
import { TABLES } from "./contracts";
import { db, execute, genId, now } from "./db";
import { loadModuleManifest } from "./installer";
import { runMigrations } from "./migrations";
import {
  assignPackPermissionGroup,
  getPackPermissionGroups,
  syncPackPermissionGroups,
} from "./permission-groups";
import { authorizeCommandActor } from "./command-contracts/authorization";

const workspaceId = "ws_contract_authorization";
const organizationId = "org_contract_authorization";

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

async function seedUser(
  id: string,
  externalId: string,
  role?: "admin" | "member" | "viewer",
): Promise<void> {
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.users}
     (id, external_id, display_name, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
    [id, externalId, externalId, ts, ts],
  );
  if (role) {
    await execute(
      `INSERT INTO ${TABLES.workspaceMemberships}
       (id, workspace_id, user_id, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      [genId("wsmem"), workspaceId, id, role, ts, ts],
    );
  }
}

describe("Command Contract Runtime authorization", () => {
  let contract: CommandContract;

  beforeAll(async () => {
    await resetDatabase();
    const ts = now();
    await execute(
      `INSERT INTO ${TABLES.organizations}
       (id, name, slug, status, created_at, updated_at)
       VALUES (?, 'Contract Authorization', 'contract-authorization', 'active', ?, ?)`,
      [organizationId, ts, ts],
    );
    await execute(
      `INSERT INTO ${TABLES.workspaces}
       (id, name, slug, created_at, updated_at)
       VALUES (?, 'Contract Authorization', 'contract-authorization', ?, ?)`,
      [workspaceId, ts, ts],
    );
    await execute(
      `INSERT INTO ${TABLES.workspaceTenants}
       (workspace_id, organization_id, created_at) VALUES (?, ?, ?)`,
      [workspaceId, organizationId, ts],
    );
    await seedUser("usr_admin", "actor_admin", "admin");
    await seedUser("usr_allowed", "actor_allowed", "member");
    await seedUser("usr_denied", "actor_denied", "member");
    await seedUser("usr_outsider", "actor_outsider");

    await syncPackPermissionGroups(workspaceId, "test-pack", [{
      key: "visit_executor",
      label: "Visit Executor",
      permissions: ["visit.execute"],
    }, {
      key: "read_only",
      label: "Read Only",
      permissions: ["work_order.read"],
    }]);
    const groups = await getPackPermissionGroups(workspaceId, "test-pack");
    await assignPackPermissionGroup(
      workspaceId,
      groups.find((group) => group.groupKey === "visit_executor")!.id,
      "usr_allowed",
      "usr_admin",
    );
    await assignPackPermissionGroup(
      workspaceId,
      groups.find((group) => group.groupKey === "read_only")!.id,
      "usr_denied",
      "usr_admin",
    );
    contract = loadModuleManifest("runory.service-visit").domain!.commands
      .find((command) => command.key === "visit.complete")!;
  });
  afterAll(resetDatabase);

  it("allows Workspace admins and explicitly permitted members", async () => {
    await expect(authorizeCommandActor(
      workspaceId,
      { type: "user", id: "actor_admin" },
      contract,
    )).resolves.toBeUndefined();
    await expect(authorizeCommandActor(
      workspaceId,
      { type: "api_key", id: "usr_allowed" },
      contract,
    )).resolves.toBeUndefined();
  });

  it("rejects missing business permission and missing Workspace membership", async () => {
    await expect(authorizeCommandActor(
      workspaceId,
      { type: "user", id: "actor_denied" },
      contract,
    )).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(authorizeCommandActor(
      workspaceId,
      { type: "user", id: "actor_outsider" },
      contract,
    )).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("allows trusted system actors but requires explicit policy for Agents", async () => {
    await expect(authorizeCommandActor(
      workspaceId,
      { type: "system", id: "provider:webhook" },
      contract,
    )).resolves.toBeUndefined();
    await expect(authorizeCommandActor(
      workspaceId,
      { type: "agent", id: "usr_allowed" },
      contract,
    )).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

    const userOnly = { ...contract, allowedActorTypes: ["user"] } as CommandContract;
    await expect(authorizeCommandActor(
      workspaceId,
      { type: "system", id: "provider:webhook" },
      userOnly,
    )).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});
