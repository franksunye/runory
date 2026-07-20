import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { TABLES } from "./contracts";
import {
  BatchRowsAffectedError,
  batch,
  db,
  execute,
  genId,
  now,
  queryOne,
} from "./db";
import { repairWorkspaceCommandContracts } from "./command-contract-repair";
import {
  acceptFormSubmissionHandler,
  publishFormDefinition,
  returnFormSubmissionHandler,
  reviseFormSubmissionHandler,
  saveFormDraftHandler,
  submitForm,
  submitFormHandler,
} from "./forms";
import { runMigrations } from "./migrations";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

let workspaceId: string;

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

async function setupWorkspace(): Promise<void> {
  workspaceId = genId("ws");
  const ts = now();
  await execute(
    `INSERT INTO ${TABLES.workspaces} (id, name, slug, created_at, updated_at)
     VALUES (?, 'Form Concurrency', ?, ?, ?)`,
    [workspaceId, `form-concurrency-${workspaceId}`, ts, ts],
  );
  await repairWorkspaceCommandContracts(workspaceId);
  for (const userId of ["owner", "reviewer"]) {
    await execute(
      `INSERT INTO ${TABLES.users}
       (id, external_id, display_name, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      [userId, `${userId}-${workspaceId}`, userId, ts, ts],
    );
    await execute(
      `INSERT INTO ${TABLES.workspaceMemberships}
       (id, workspace_id, user_id, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      [genId("wsmem"), workspaceId, userId, ts, ts],
    );
  }
}

async function createDefinition() {
  return publishFormDefinition(workspaceId, {
    formKey: `concurrency-${genId("form")}`,
    name: "Concurrency form",
    schema: {
      blocks: [{
        block_type: "field",
        id: "result",
        field_key: "result",
        field_type: "text",
        label: "Result",
        required: true,
      }],
    },
  }, "owner");
}

beforeEach(async () => {
  await resetDatabase();
  await setupWorkspace();
});

describe("Form Submission optimistic concurrency", () => {
  it("rolls back the whole atomic batch when a guarded write misses", async () => {
    await execute("CREATE TABLE form_concurrency_probe (id TEXT PRIMARY KEY)");
    await expect(batch([
      {
        sql: "UPDATE form_concurrency_probe SET id = 'changed' WHERE id = 'missing'",
        expectedRowsAffected: 1,
      },
      {
        sql: "INSERT INTO form_concurrency_probe (id) VALUES ('must_rollback')",
      },
    ])).rejects.toBeInstanceOf(BatchRowsAffectedError);

    const count = await queryOne<{ count: number }>(
      "SELECT COUNT(*) AS count FROM form_concurrency_probe",
    );
    expect(Number(count?.count)).toBe(0);
  });

  it("allows only one prepared accept-or-return decision", async () => {
    const definition = await createDefinition();
    const submitted = await submitForm(workspaceId, {
      formDefinitionId: definition.definitionId,
      formVersionId: definition.versionId,
      answers: { result: "ready for review" },
      submittedBy: "owner",
    });
    const accept = await acceptFormSubmissionHandler(
      workspaceId,
      submitted.submissionId,
      "reviewer",
    );
    const returned = await returnFormSubmissionHandler(
      workspaceId,
      submitted.submissionId,
      "reviewer",
      "Needs correction",
    );

    await batch(accept.statements);
    await expect(batch(returned.statements)).rejects.toBeInstanceOf(
      BatchRowsAffectedError,
    );

    const row = await queryOne<{ status: string }>(
      `SELECT status FROM ${TABLES.formSubmissions} WHERE id = ?`,
      [submitted.submissionId],
    );
    const children = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${TABLES.formSubmissions}
       WHERE supersedes_submission_id = ?`,
      [submitted.submissionId],
    );
    expect(row?.status).toBe("accepted");
    expect(Number(children?.count)).toBe(0);
  });

  it("creates only one child when two revisions were prepared from the same parent", async () => {
    const definition = await createDefinition();
    const submitted = await submitForm(workspaceId, {
      formDefinitionId: definition.definitionId,
      formVersionId: definition.versionId,
      answers: { result: "original" },
      submittedBy: "owner",
    });
    const first = await reviseFormSubmissionHandler(
      workspaceId,
      submitted.submissionId,
      "owner",
      "First correction",
    );
    const second = await reviseFormSubmissionHandler(
      workspaceId,
      submitted.submissionId,
      "owner",
      "Competing correction",
    );

    await batch(first.statements);
    await expect(batch(second.statements)).rejects.toBeInstanceOf(
      BatchRowsAffectedError,
    );

    const children = await queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${TABLES.formSubmissions}
       WHERE workspace_id = ? AND supersedes_submission_id = ?`,
      [workspaceId, submitted.submissionId],
    );
    expect(Number(children?.count)).toBe(1);
  });

  it("allows only one prepared draft creation and one draft promotion", async () => {
    const definition = await createDefinition();
    const params = {
      formDefinitionId: definition.definitionId,
      subjectType: "service_visit",
      subjectId: "visit-concurrency",
      answers: { result: "draft" },
      submittedBy: "owner",
    };
    const firstDraft = await saveFormDraftHandler(workspaceId, params);
    const secondDraft = await saveFormDraftHandler(workspaceId, params);
    await batch(firstDraft.statements);
    await expect(batch(secondDraft.statements)).rejects.toBeInstanceOf(
      BatchRowsAffectedError,
    );

    const draftId = firstDraft.aggregate.submissionId;
    const submissionParams = {
      ...params,
      formVersionId: definition.versionId,
      answers: { result: "submitted" },
      draftSubmissionId: draftId,
    };
    const firstPromotion = await submitFormHandler(workspaceId, submissionParams);
    const secondPromotion = await submitFormHandler(workspaceId, submissionParams);
    await batch(firstPromotion.statements);
    await expect(batch(secondPromotion.statements)).rejects.toBeInstanceOf(
      BatchRowsAffectedError,
    );

    const row = await queryOne<{ status: string; answers_json: string }>(
      `SELECT status, answers_json FROM ${TABLES.formSubmissions} WHERE id = ?`,
      [draftId],
    );
    expect(row).toEqual({
      status: "submitted",
      answers_json: JSON.stringify({ result: "submitted" }),
    });
  });
});
