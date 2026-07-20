import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  TABLES,
  createFormBinding,
  db,
  execute,
  genId,
  now,
  publishFormDefinition,
  queryOne,
  repairWorkspaceCommandContracts,
  runMigrations,
} from "@runory/platform-core";
import { POST } from "./route";

async function resetDatabase(): Promise<void> {
  globalThis.__platformSchemaReady = undefined;
  globalThis.__platformMigrationsRun = undefined;
  await db.execute({ sql: "PRAGMA foreign_keys = OFF" });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  });
  for (const row of tables.rows) {
    await db.execute({ sql: `DROP TABLE IF EXISTS "${String(row.name)}"` });
  }
  await db.execute({ sql: "PRAGMA foreign_keys = ON" });
  await runMigrations();
}

beforeEach(resetDatabase);

describe("Public Forms V2 HTTP boundary", () => {
  it("submits an anonymous public form through the trusted public endpoint actor", async () => {
    const workspaceId = genId("ws");
    const timestamp = now();
    await execute(
      `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at)
       VALUES (?, 'Public Forms V2', ?, ?, ?)`,
      [workspaceId, `public-forms-v2-${workspaceId}`, timestamp, timestamp],
    );
    await repairWorkspaceCommandContracts(workspaceId);

    const definition = await publishFormDefinition(workspaceId, {
      formKey: `public-${genId("form")}`,
      name: "Public contact",
      schema: {
        blocks: [{
          block_type: "field",
          id: "message",
          field_key: "message",
          field_type: "text",
          label: "Message",
          required: true,
        }],
      },
    }, "test-publisher");
    await createFormBinding(workspaceId, definition.definitionId, {
      usageType: "public_endpoint",
    });

    const request = new NextRequest(
      `https://runory.example/api/public/forms/${definition.definitionId}/submit`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `public-submit-${genId("test")}`,
          "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}`,
        },
        body: JSON.stringify({ message: "Please contact me" }),
      },
    );
    const response = await POST(request, {
      params: Promise.resolve({ formId: definition.definitionId }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ success: true, data: { id: expect.any(String) } });
    await expect(queryOne<{
      submitted_by: string;
      status: string;
    }>(
      `SELECT submitted_by, status FROM ${TABLES.formSubmissions}
       WHERE workspace_id = ? AND id = ?`,
      [workspaceId, body.data.id],
    )).resolves.toEqual({ submitted_by: "anonymous", status: "submitted" });
    await expect(queryOne<{
      actor_type: string;
      actor_id: string;
    }>(
      `SELECT actor_type, actor_id FROM ${TABLES.commandExecutions}
       WHERE workspace_id = ? AND command_type = 'form_submission.submit'`,
      [workspaceId],
    )).resolves.toEqual({ actor_type: "system", actor_id: "public-form" });
  });
});
