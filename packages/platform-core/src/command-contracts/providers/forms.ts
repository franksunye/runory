import { TABLES, businessTable } from "../../contracts";
import { now, queryOne, type BatchStatement } from "../../db";
import { InvalidInputError } from "../../context";
import { registerCommandEffectProvider } from "../registry";

interface ProjectionFormSchema {
  blocks: Array<{
    block_type: string;
    id: string;
  }>;
}

async function buildCompleteWorkItemStatement(
  workspaceId: string,
  workItemId: string,
  ts: string,
): Promise<BatchStatement | null> {
  const workItem = await queryOne<{ id: string; version: number; status: string }>(
    `SELECT id, version, status FROM ${TABLES.workItems}
     WHERE workspace_id = ? AND id = ? AND status IN ('ready', 'active')`,
    [workspaceId, workItemId],
  );
  if (!workItem) return null;

  return {
    sql: `UPDATE ${TABLES.workItems}
          SET status = 'completed', completed_at = ?, version = version + 1, updated_at = ?
          WHERE id = ? AND version = ? AND status IN ('ready', 'active')`,
    args: [ts, ts, workItemId, workItem.version],
    expectedRowsAffected: 1,
  };
}

async function buildServiceReportStatement(
  submission: Record<string, unknown>,
  acceptedBy: string,
  targetMapping: Record<string, unknown> | null,
  reportId: string,
): Promise<BatchStatement> {
  const ts = now();
  const workspaceId = submission["workspace_id"] as string;

  let answers: Record<string, unknown> = {};
  const answersJson = submission["answers_json"] as string | undefined;
  if (answersJson) {
    try {
      answers = JSON.parse(answersJson) as Record<string, unknown>;
    } catch {
      answers = {};
    }
  }

  let schema: ProjectionFormSchema | null = null;
  const formVersionId = submission["form_version_id"] as string | undefined;
  if (formVersionId) {
    const versionRow = await queryOne<{ schema_json: string }>(
      `SELECT schema_json FROM ${TABLES.formDefinitionVersions} WHERE id = ?`,
      [formVersionId],
    );
    if (versionRow) {
      try {
        schema = JSON.parse(versionRow.schema_json) as ProjectionFormSchema;
      } catch {
        schema = null;
      }
    }
  }

  const mapField = (key: string): unknown => {
    if (targetMapping && typeof targetMapping[key] === "string") {
      return answers[targetMapping[key] as string];
    }
    return answers[key];
  };

  const summary = mapField("summary") ?? mapField("service_summary") ?? "";
  const resolution = mapField("resolution") ?? "";
  let customerSignature: string | null = null;
  if (schema) {
    for (const block of schema.blocks) {
      if (block.block_type === "signature") {
        const signature = answers[block.id] as { signedBy?: string } | undefined;
        if (signature?.signedBy) {
          customerSignature = String(signature.signedBy);
          break;
        }
      }
    }
  }

  const photoIds: string[] = [];
  if (schema) {
    for (const block of schema.blocks) {
      if (block.block_type === "evidence") {
        const evidence = answers[block.id] as { attachments?: unknown[] } | undefined;
        if (Array.isArray(evidence?.attachments)) {
          photoIds.push(...evidence.attachments.map(String));
        }
      }
    }
  }

  const subjectType = (submission["subject_type"] as string | null) ?? null;
  const subjectId = (submission["subject_id"] as string | null) ?? null;
  let workOrderId: string | null = null;
  let serviceVisitId: string | null = null;
  if (subjectType === "work_order") {
    workOrderId = subjectId;
  } else if (subjectType === "service_visit") {
    serviceVisitId = subjectId;
  } else {
    workOrderId = (mapField("work_order_id") as string) ?? null;
    serviceVisitId = (mapField("service_visit_id") as string) ?? null;
  }

  return {
    sql: `INSERT INTO ${businessTable("service_report")}
          (id, workspace_id, work_order_id, service_visit_id, summary, resolution,
           customer_signature, photos, created_by, completed_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      reportId,
      workspaceId,
      workOrderId,
      serviceVisitId,
      String(summary),
      String(resolution),
      customerSignature,
      photoIds.length > 0 ? JSON.stringify(photoIds) : null,
      acceptedBy,
      ts,
      ts,
      ts,
    ],
    expectedRowsAffected: 1,
  };
}

registerCommandEffectProvider({
  capability: "forms.project_service_report",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ effectInput }) => {
    const input = effectInput as {
      enabled?: boolean;
      submission?: Record<string, unknown>;
      acceptedBy?: string;
      targetMapping?: Record<string, unknown> | null;
      reportId?: string;
    } | undefined;
    if (!input?.enabled) return { recordCount: 0, statements: [] };
    if (!input.submission || !input.acceptedBy || !input.reportId) {
      throw new InvalidInputError("Service report projection input is incomplete");
    }
    return {
      recordCount: 1,
      statements: [await buildServiceReportStatement(
        input.submission,
        input.acceptedBy,
        input.targetMapping ?? null,
        input.reportId,
      )],
    };
  },
});

registerCommandEffectProvider({
  capability: "workflow.complete_linked_work_item",
  version: "1.0.0",
  consistency: "atomic",
  prepare: async ({ envelope, effectInput }) => {
    const input = effectInput as { workItemId?: string; occurredAt?: string } | undefined;
    if (!input?.workItemId) return { recordCount: 0, statements: [] };
    const statement = await buildCompleteWorkItemStatement(
      envelope.workspaceId,
      input.workItemId,
      input.occurredAt ?? envelope.occurredAt,
    );
    return {
      recordCount: statement ? 1 : 0,
      statements: statement ? [statement] : [],
    };
  },
});
