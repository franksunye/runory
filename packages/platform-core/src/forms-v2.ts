// ── Forms 2.0 Runtime (v0.5) ──
//
// Per v0.5 Commercial FSM Technical Specification §5.6:
// Form definitions are versioned and immutable once published.
// Submissions are immutable and revisioned (returned submissions spawn a new
// draft revision linked via supersedes_submission_id).
// Checklist, evidence, and signature are first-class form blocks — not separate
// runtime modules. Service reports are projected from accepted form submissions
// when a binding's usage_type is 'service_deliverable'.

import { genId, now, queryOne, queryAll, execute, batch } from "./db";
import { TABLES, businessTable } from "./contracts";
import { BusinessError, NotFoundError, InvalidInputError } from "./context";
import { ERROR_CODES } from "./errors";
import { writeAuditEvent } from "./audit-service";

// ── Types ──

export interface FormBlock {
  block_type: "header" | "field" | "checklist" | "evidence" | "signature";
  id: string;
  label?: string;
  // For field blocks:
  field_key?: string;
  field_type?: "text" | "number" | "date" | "select" | "boolean";
  required?: boolean;
  options?: string[];
  // For checklist blocks:
  items?: Array<{
    id: string;
    label: string;
    required: boolean;
    pass_fail_na?: boolean;
  }>;
  // For evidence blocks:
  required_count?: number;
  accepted_types?: string[];
  // For signature blocks:
  acknowledgment_text?: string;
}

export interface FormSchema {
  blocks: FormBlock[];
}

export interface FormDefinitionInput {
  formKey: string;
  name: string;
  schema: FormSchema;
  layout?: Record<string, unknown>;
}

// ── Row Types ──

interface FormDefinitionRow {
  id: string;
  workspace_id: string;
  form_key: string;
  name: string;
  status: string;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
}

interface FormDefinitionVersionRow {
  id: string;
  workspace_id: string;
  form_definition_id: string;
  version_number: number;
  schema_json: string;
  layout_json: string | null;
  published_by: string | null;
  published_at: string;
}

interface FormBindingRow {
  id: string;
  workspace_id: string;
  form_definition_id: string;
  usage_type: string;
  usage_key: string | null;
  label_override: string | null;
  timing_json: string | null;
  requirement_policy: string;
  target_mapping_json: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

interface FormSubmissionRow {
  id: string;
  workspace_id: string;
  form_definition_id: string;
  form_version_id: string;
  binding_id: string | null;
  subject_type: string | null;
  subject_id: string | null;
  work_item_id: string | null;
  revision_number: number;
  status: string;
  answers_json: string;
  submitted_by: string | null;
  submitted_at: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  return_reason: string | null;
  supersedes_submission_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── Validation Helper ──

/**
 * Validate answers against a form schema.
 *
 * Answer conventions:
 *  - Field blocks:   answers[field_key] holds the typed value.
 *  - Checklist blocks: answers[block.id] = { [itemId]: "pass"|"fail"|"na" }.
 *  - Evidence blocks: answers[block.id] = { attachments: string[] }.
 *  - Signature blocks: answers[block.id] = { acknowledged: boolean, signedBy?: string }.
 *
 * Throws BusinessError with REQUIRED_INPUT_MISSING when a required block is
 * not satisfied.
 */
export function validateAnswers(
  schema: FormSchema,
  answers: Record<string, unknown>
): void {
  const missing: string[] = [];

  for (const block of schema.blocks) {
    switch (block.block_type) {
      case "field": {
        if (block.required) {
          const key = block.field_key ?? block.id;
          const value = answers[key];
          if (value === undefined || value === null || value === "") {
            missing.push(`field '${key}'${block.label ? ` (${block.label})` : ""}`);
          }
        }
        break;
      }

      case "checklist": {
        const blockAnswers = answers[block.id] as
          | Record<string, string>
          | undefined;
        for (const item of block.items ?? []) {
          if (item.required) {
            const result = blockAnswers?.[item.id];
            const validResults = item.pass_fail_na
              ? ["pass", "fail", "na"]
              : ["pass", "fail"];
            if (!result || !validResults.includes(result)) {
              missing.push(
                `checklist item '${item.id}'${item.label ? ` (${item.label})` : ""}`
              );
            }
          }
        }
        break;
      }

      case "evidence": {
        if (block.required) {
          const required = block.required_count ?? 1;
          const evidenceAnswers = answers[block.id] as
            | { attachments?: unknown[] }
            | undefined;
          const attachments = evidenceAnswers?.attachments ?? [];
          if (!Array.isArray(attachments) || attachments.length < required) {
            missing.push(
              `evidence block '${block.id}'${block.label ? ` (${block.label})` : ""} (requires ${required} attachment(s))`
            );
          }
        }
        break;
      }

      case "signature": {
        if (block.required) {
          const sigAnswers = answers[block.id] as
            | { acknowledged?: unknown; signedBy?: unknown }
            | undefined;
          if (!sigAnswers || sigAnswers.acknowledged !== true) {
            missing.push(
              `signature block '${block.id}'${block.label ? ` (${block.label})` : ""}`
            );
          } else if (typeof sigAnswers.signedBy !== "string" || sigAnswers.signedBy.trim() === "") {
            // Per v0.5.1 Spec §5.5: a drawn or typed acknowledgment records
            // signer label. Server-side validation ensures it is present.
            missing.push(
              `signature block '${block.id}'${block.label ? ` (${block.label})` : ""} (requires signer label)`
            );
          }
        }
        break;
      }

      case "header":
      default:
        // Header blocks carry no answerable data.
        break;
    }
  }

  if (missing.length > 0) {
    throw new BusinessError(
      ERROR_CODES.REQUIRED_INPUT_MISSING,
      `REQUIRED_INPUT_MISSING: The following required inputs are missing or invalid: ${missing.join(", ")}`,
      400
    );
  }
}

// ── publishFormDefinition ──

/**
 * Create or bump the version of a form definition.
 *
 * If no form_definition exists for the given form_key, a new one is created
 * with status='active'. A new immutable form_definition_version is always
 * inserted with an incremented version_number, and the definition's
 * active_version_id is updated to point at it.
 */
export async function publishFormDefinition(
  workspaceId: string,
  input: FormDefinitionInput,
  publishedBy: string
): Promise<{ definitionId: string; versionId: string; versionNumber: number }> {
  if (!input.formKey) {
    throw new InvalidInputError("formKey is required");
  }
  if (!input.name) {
    throw new InvalidInputError("name is required");
  }
  if (!input.schema || !Array.isArray(input.schema.blocks)) {
    throw new InvalidInputError("schema.blocks must be an array");
  }

  const ts = now();

  // Find or create the definition record
  const existing = await queryOne<Pick<FormDefinitionRow, "id" | "active_version_id">>(
    `SELECT id, active_version_id FROM ${TABLES.formDefinitions}
     WHERE workspace_id = ? AND form_key = ?`,
    [workspaceId, input.formKey]
  );

  let definitionId: string;
  let versionNumber: number;

  if (!existing) {
    definitionId = genId("fdef");
    versionNumber = 1;
    await execute(
      `INSERT INTO ${TABLES.formDefinitions}
       (id, workspace_id, form_key, name, status, active_version_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', NULL, ?, ?)`,
      [definitionId, workspaceId, input.formKey, input.name, ts, ts]
    );
  } else {
    definitionId = existing.id;
    const lastVer = await queryOne<{ version_number: number }>(
      `SELECT MAX(version_number) as version_number FROM ${TABLES.formDefinitionVersions}
       WHERE form_definition_id = ?`,
      [definitionId]
    );
    versionNumber = (lastVer?.version_number ?? 0) + 1;
  }

  // Create the immutable version
  const versionId = genId("fver");
  const schemaJson = JSON.stringify(input.schema);
  const layoutJson = input.layout ? JSON.stringify(input.layout) : null;

  await batch([
    {
      sql: `INSERT INTO ${TABLES.formDefinitionVersions}
            (id, workspace_id, form_definition_id, version_number, schema_json,
             layout_json, published_by, published_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        versionId,
        workspaceId,
        definitionId,
        versionNumber,
        schemaJson,
        layoutJson,
        publishedBy,
        ts,
      ],
    },
    {
      sql: `UPDATE ${TABLES.formDefinitions}
          SET active_version_id = ?, status = 'active', updated_at = ?
          WHERE id = ?`,
      args: [versionId, ts, definitionId],
    },
  ]);

  return { definitionId, versionId, versionNumber };
}

// ── createFormBinding ──

/**
 * Bind a form definition to a usage context (e.g. a workflow step, a record
 * action, a service deliverable, or a marketing capture point).
 */
export async function createFormBinding(
  workspaceId: string,
  formDefinitionId: string,
  params: {
    usageType: string;
    usageKey?: string;
    labelOverride?: string;
    timing?: Record<string, unknown>;
    requirementPolicy?: "optional" | "required";
    targetMapping?: Record<string, unknown>;
  }
): Promise<{ bindingId: string }> {
  if (!params.usageType) {
    throw new InvalidInputError("usageType is required");
  }

  // Verify the form definition exists
  const def = await queryOne<Pick<FormDefinitionRow, "id">>(
    `SELECT id FROM ${TABLES.formDefinitions}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, formDefinitionId]
  );
  if (!def) {
    throw new NotFoundError(`Form definition not found: ${formDefinitionId}`);
  }

  const ts = now();
  const bindingId = genId("fbnd");

  await execute(
    `INSERT INTO ${TABLES.formBindings}
     (id, workspace_id, form_definition_id, usage_type, usage_key,
      label_override, timing_json, requirement_policy, target_mapping_json,
      active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      bindingId,
      workspaceId,
      formDefinitionId,
      params.usageType,
      params.usageKey ?? null,
      params.labelOverride ?? null,
      params.timing ? JSON.stringify(params.timing) : null,
      params.requirementPolicy ?? "optional",
      params.targetMapping ? JSON.stringify(params.targetMapping) : null,
      ts,
      ts,
    ]
  );

  return { bindingId };
}

// ── submitForm ──

/**
 * Create an immutable form submission.
 *
 * Validates answers against the form schema (required fields, checklist
 * items, evidence, signatures) before persisting. The submission is created
 * with status='submitted'. If supersedesSubmissionId is set, the revision
 * chain is continued (revision_number is incremented from the prior
 * submission).
 */
export async function submitForm(
  workspaceId: string,
  params: {
    formDefinitionId: string;
    subjectType?: string;
    subjectId?: string;
    workItemId?: string;
    bindingId?: string;
    answers: Record<string, unknown>;
    submittedBy: string;
    supersedesSubmissionId?: string;
  }
): Promise<{ submissionId: string; revisionNumber: number }> {
  if (!params.formDefinitionId) {
    throw new InvalidInputError("formDefinitionId is required");
  }
  if (!params.answers || typeof params.answers !== "object") {
    throw new InvalidInputError("answers is required");
  }

  // Fetch the active form definition + version to get the schema
  const def = await queryOne<
    Pick<FormDefinitionRow, "id" | "active_version_id">
  >(
    `SELECT id, active_version_id FROM ${TABLES.formDefinitions}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, params.formDefinitionId]
  );
  if (!def) {
    throw new NotFoundError(
      `Form definition not found: ${params.formDefinitionId}`
    );
  }
  if (!def.active_version_id) {
    throw new BusinessError(
      ERROR_CODES.INVALID_INPUT,
      `Form definition ${params.formDefinitionId} has no published version`,
      400
    );
  }

  const versionRow = await queryOne<
    Pick<FormDefinitionVersionRow, "id" | "schema_json">
  >(
    `SELECT id, schema_json FROM ${TABLES.formDefinitionVersions}
     WHERE id = ?`,
    [def.active_version_id]
  );
  if (!versionRow) {
    throw new NotFoundError(
      `Form definition version not found: ${def.active_version_id}`
    );
  }

  let schema: FormSchema;
  try {
    schema = JSON.parse(versionRow.schema_json) as FormSchema;
  } catch {
    throw new BusinessError(
      ERROR_CODES.INTERNAL_ERROR,
      `Failed to parse form schema for version ${versionRow.id}`,
      500
    );
  }

  // Validate answers against schema
  validateAnswers(schema, params.answers);

  const ts = now();
  const submissionId = genId("fsub");

  // Determine revision number (handle revision chain)
  let revisionNumber = 1;
  if (params.supersedesSubmissionId) {
    const prior = await queryOne<
      Pick<FormSubmissionRow, "revision_number">
    >(
      `SELECT revision_number FROM ${TABLES.formSubmissions}
       WHERE workspace_id = ? AND id = ?`,
      [workspaceId, params.supersedesSubmissionId]
    );
    if (!prior) {
      throw new NotFoundError(
        `Prior submission not found: ${params.supersedesSubmissionId}`
      );
    }
    revisionNumber = prior.revision_number + 1;
  }

  await execute(
    `INSERT INTO ${TABLES.formSubmissions}
     (id, workspace_id, form_definition_id, form_version_id, binding_id,
      subject_type, subject_id, work_item_id, revision_number, status,
      answers_json, submitted_by, submitted_at, accepted_by, accepted_at,
      return_reason, supersedes_submission_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
    [
      submissionId,
      workspaceId,
      params.formDefinitionId,
      versionRow.id,
      params.bindingId ?? null,
      params.subjectType ?? null,
      params.subjectId ?? null,
      params.workItemId ?? null,
      revisionNumber,
      JSON.stringify(params.answers),
      params.submittedBy,
      ts,
      params.supersedesSubmissionId ?? null,
      ts,
      ts,
    ]
  );

  // Audit event — per v0.5.1 Spec §7: "audit evidence download, form submission,
  // Quote output generation, and governed commands."
  writeAuditEvent({
    workspaceId,
    actorType: "user",
    actorId: params.submittedBy,
    action: "form_submission.submit",
    entityType: params.subjectType ?? "form_submission",
    entityId: submissionId,
    before: null,
    after: {
      form_definition_id: params.formDefinitionId,
      form_version_id: versionRow.id,
      binding_id: params.bindingId ?? null,
      subject_type: params.subjectType ?? null,
      subject_id: params.subjectId ?? null,
      work_item_id: params.workItemId ?? null,
      revision_number: revisionNumber,
      supersedes_submission_id: params.supersedesSubmissionId ?? null,
    },
    requestId: `form-submit-${submissionId}-${ts}`,
  }).catch((err) => {
    console.error("[audit] Failed to write form_submission.submit audit event:", err);
  });

  return { submissionId, revisionNumber };
}

// ── saveFormDraft ──

/**
 * form_submission.save_draft — create or update a draft form submission.
 *
 * If a draft submission already exists for the same form definition + subject +
 * submitter, its answers are updated in place (so the draft is reused rather
 * than duplicated). Otherwise a new submission is created with status='draft'.
 *
 * Drafts are NOT validated against the form schema — they may be incomplete.
 */
export async function saveFormDraft(
  workspaceId: string,
  params: {
    formDefinitionId: string;
    subjectType?: string;
    subjectId?: string;
    workItemId?: string;
    bindingId?: string;
    answers: Record<string, unknown>;
    submittedBy: string;
  }
): Promise<{ submissionId: string }> {
  if (!params.formDefinitionId) {
    throw new InvalidInputError("formDefinitionId is required");
  }
  if (!params.answers || typeof params.answers !== "object") {
    throw new InvalidInputError("answers is required");
  }

  const ts = now();

  // Look for an existing draft for the same form + subject + submitter.
  // Uses NULL-safe `IS` comparison so a NULL subject_type/subject_id matches
  // another NULL (the standard `=` operator would not match NULLs).
  const existing = await queryOne<Pick<FormSubmissionRow, "id">>(
    `SELECT id FROM ${TABLES.formSubmissions}
     WHERE workspace_id = ? AND form_definition_id = ? AND status = 'draft'
       AND submitted_by = ?
       AND subject_type IS ?
       AND subject_id IS ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [
      workspaceId,
      params.formDefinitionId,
      params.submittedBy,
      params.subjectType ?? null,
      params.subjectId ?? null,
    ]
  );

  if (existing) {
    // Update the existing draft's answers in place
    await execute(
      `UPDATE ${TABLES.formSubmissions}
       SET answers_json = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
      [JSON.stringify(params.answers), ts, existing.id, workspaceId]
    );
    return { submissionId: existing.id };
  }

  // No existing draft — resolve the active form definition version
  const def = await queryOne<
    Pick<FormDefinitionRow, "id" | "active_version_id">
  >(
    `SELECT id, active_version_id FROM ${TABLES.formDefinitions}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, params.formDefinitionId]
  );
  if (!def) {
    throw new NotFoundError(
      `Form definition not found: ${params.formDefinitionId}`
    );
  }
  if (!def.active_version_id) {
    throw new BusinessError(
      ERROR_CODES.INVALID_INPUT,
      `Form definition ${params.formDefinitionId} has no published version`,
      400
    );
  }

  // Create a new draft submission. submitted_at is NULL until the draft is
  // formally submitted via submitForm.
  const submissionId = genId("fsub");

  await execute(
    `INSERT INTO ${TABLES.formSubmissions}
     (id, workspace_id, form_definition_id, form_version_id, binding_id,
      subject_type, subject_id, work_item_id, revision_number, status,
      answers_json, submitted_by, submitted_at, accepted_by, accepted_at,
      return_reason, supersedes_submission_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'draft', ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    [
      submissionId,
      workspaceId,
      params.formDefinitionId,
      def.active_version_id,
      params.bindingId ?? null,
      params.subjectType ?? null,
      params.subjectId ?? null,
      params.workItemId ?? null,
      JSON.stringify(params.answers),
      params.submittedBy,
      ts,
      ts,
    ]
  );

  return { submissionId };
}

// ── returnFormSubmission ──

/**
 * Return a submission for revision. Marks the old submission as 'returned'
 * with a return_reason, then creates a new draft submission with
 * revision_number + 1 linked via supersedes_submission_id.
 */
export async function returnFormSubmission(
  workspaceId: string,
  submissionId: string,
  returnedBy: string,
  returnReason: string
): Promise<{ newSubmissionId: string; revisionNumber: number }> {
  const ts = now();

  const submission = await queryOne<FormSubmissionRow>(
    `SELECT * FROM ${TABLES.formSubmissions}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, submissionId]
  );
  if (!submission) {
    throw new NotFoundError(`Form submission not found: ${submissionId}`);
  }

  if (submission.status !== "submitted") {
    throw new BusinessError(
      ERROR_CODES.INVALID_TRANSITION,
      `Cannot return submission in status '${submission.status}'; expected 'submitted'`,
      409
    );
  }

  const newSubmissionId = genId("fsub");
  const newRevisionNumber = submission.revision_number + 1;

  await batch([
    // Mark old submission as returned
    {
      sql: `UPDATE ${TABLES.formSubmissions}
            SET status = 'returned', return_reason = ?, updated_at = ?
            WHERE id = ? AND workspace_id = ?`,
      args: [returnReason, ts, submissionId, workspaceId],
    },
    // Create new draft submission carrying the prior answers, linked to the chain
    {
      sql: `INSERT INTO ${TABLES.formSubmissions}
            (id, workspace_id, form_definition_id, form_version_id, binding_id,
             subject_type, subject_id, work_item_id, revision_number, status,
             answers_json, submitted_by, submitted_at, accepted_by, accepted_at,
             return_reason, supersedes_submission_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, NULL, NULL, NULL, NULL,
                    NULL, ?, ?, ?)`,
      args: [
        newSubmissionId,
        workspaceId,
        submission.form_definition_id,
        submission.form_version_id,
        submission.binding_id,
        submission.subject_type,
        submission.subject_id,
        submission.work_item_id,
        newRevisionNumber,
        submission.answers_json,
        submissionId,
        ts,
        ts,
      ],
    },
  ]);

  // Audit event — per v0.5.1 Spec §7 and §4.3: return is a governed action
  writeAuditEvent({
    workspaceId,
    actorType: "user",
    actorId: returnedBy,
    action: "form_submission.return",
    entityType: "form_submission",
    entityId: submissionId,
    before: { status: "submitted", revision_number: submission.revision_number },
    after: {
      status: "returned",
      return_reason: returnReason,
      new_submission_id: newSubmissionId,
      new_revision_number: newRevisionNumber,
    },
    requestId: `form-return-${submissionId}-${ts}`,
  }).catch((err) => {
    console.error("[audit] Failed to write form_submission.return audit event:", err);
  });

  return { newSubmissionId, revisionNumber: newRevisionNumber };
}

// ── acceptFormSubmission ──

/**
 * Accept a submission. Verifies the submission is in 'submitted' status,
 * transitions it to 'accepted', and — when the bound form has
 * usage_type='service_deliverable' — projects a service_report record.
 * If the submission is linked to a work_item, the work item is advanced.
 */
export async function acceptFormSubmission(
  workspaceId: string,
  submissionId: string,
  acceptedBy: string
): Promise<{ accepted: boolean; serviceReportId?: string }> {
  const ts = now();

  const submission = await queryOne<FormSubmissionRow>(
    `SELECT * FROM ${TABLES.formSubmissions}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, submissionId]
  );
  if (!submission) {
    throw new NotFoundError(`Form submission not found: ${submissionId}`);
  }

  if (submission.status !== "submitted") {
    throw new BusinessError(
      ERROR_CODES.INVALID_TRANSITION,
      `Cannot accept submission in status '${submission.status}'; expected 'submitted'`,
      409
    );
  }

  // Resolve the binding (if any) to determine whether a service report
  // projection should be created.
  let usageType: string | null = null;
  let targetMapping: Record<string, unknown> | null = null;
  if (submission.binding_id) {
    const binding = await queryOne<FormBindingRow>(
      `SELECT * FROM ${TABLES.formBindings}
       WHERE workspace_id = ? AND id = ?`,
      [workspaceId, submission.binding_id]
    );
    if (binding) {
      usageType = binding.usage_type;
      if (binding.target_mapping_json) {
        try {
          targetMapping = JSON.parse(binding.target_mapping_json);
        } catch {
          targetMapping = null;
        }
      }
    }
  }

  const statements: Array<{ sql: string; args?: unknown[] }> = [
    {
      sql: `UPDATE ${TABLES.formSubmissions}
            SET status = 'accepted', accepted_by = ?, accepted_at = ?, updated_at = ?
            WHERE id = ? AND workspace_id = ?`,
      args: [acceptedBy, ts, ts, submissionId, workspaceId],
    },
  ];

  await batch(statements);

  // Project a service report when the binding is a service deliverable.
  let serviceReportId: string | undefined;
  if (usageType === "service_deliverable") {
    serviceReportId = await createServiceReportProjection(
      workspaceId,
      submission as unknown as Record<string, unknown>,
      acceptedBy,
      targetMapping
    );
  }

  // If linked to a work item, advance the workflow by completing the work item.
  if (submission.work_item_id) {
    await completeWorkItem(workspaceId, submission.work_item_id, acceptedBy, ts);
  }

  // Audit event — per v0.5.1 Spec §7: "audit evidence download, form submission,
  // Quote output generation, and governed commands."
  writeAuditEvent({
    workspaceId,
    actorType: "user",
    actorId: acceptedBy,
    action: "form_submission.accept",
    entityType: "form_submission",
    entityId: submissionId,
    before: { status: "submitted", revision_number: submission.revision_number },
    after: {
      status: "accepted",
      service_report_id: serviceReportId ?? null,
      work_item_id: submission.work_item_id ?? null,
    },
    requestId: `form-accept-${submissionId}-${ts}`,
  }).catch((err) => {
    console.error("[audit] Failed to write form_submission.accept audit event:", err);
  });

  return { accepted: true, serviceReportId };
}

// ── getFormSubmissions ──

/**
 * Query form submissions by subject, binding, work item, or status.
 */
export async function getFormSubmissions(
  workspaceId: string,
  filters: {
    subjectType?: string;
    subjectId?: string;
    workItemId?: string;
    bindingId?: string;
    status?: string;
  }
): Promise<Record<string, unknown>[]> {
  const conditions: string[] = ["workspace_id = ?"];
  const args: unknown[] = [workspaceId];

  if (filters.subjectType) {
    conditions.push("subject_type = ?");
    args.push(filters.subjectType);
  }
  if (filters.subjectId) {
    conditions.push("subject_id = ?");
    args.push(filters.subjectId);
  }
  if (filters.workItemId) {
    conditions.push("work_item_id = ?");
    args.push(filters.workItemId);
  }
  if (filters.bindingId) {
    conditions.push("binding_id = ?");
    args.push(filters.bindingId);
  }
  if (filters.status) {
    conditions.push("status = ?");
    args.push(filters.status);
  }

  const where = conditions.join(" AND ");

  return queryAll<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.formSubmissions} WHERE ${where}
     ORDER BY created_at DESC`,
    args
  );
}

// ── getFormBinding ──

/**
 * Fetch an active form binding by usage_type + usage_key.
 */
export async function getFormBinding(
  workspaceId: string,
  usageType: string,
  usageKey: string
): Promise<Record<string, unknown> | undefined> {
  return queryOne<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.formBindings}
     WHERE workspace_id = ? AND usage_type = ? AND usage_key = ? AND active = 1
     ORDER BY created_at DESC
     LIMIT 1`,
    [workspaceId, usageType, usageKey]
  );
}

// ── getFormDefinition ──

/**
 * Get the active version of a form definition (definition + parsed schema).
 */
export async function getFormDefinition(
  workspaceId: string,
  formKey: string
): Promise<
  { definition: Record<string, unknown>; schema: FormSchema } | undefined
> {
  const def = await queryOne<FormDefinitionRow>(
    `SELECT * FROM ${TABLES.formDefinitions}
     WHERE workspace_id = ? AND form_key = ?`,
    [workspaceId, formKey]
  );
  if (!def || !def.active_version_id) {
    return undefined;
  }

  const versionRow = await queryOne<FormDefinitionVersionRow>(
    `SELECT * FROM ${TABLES.formDefinitionVersions}
     WHERE id = ?`,
    [def.active_version_id]
  );
  if (!versionRow) {
    return undefined;
  }

  let schema: FormSchema;
  try {
    schema = JSON.parse(versionRow.schema_json) as FormSchema;
  } catch {
    throw new BusinessError(
      ERROR_CODES.INTERNAL_ERROR,
      `Failed to parse form schema for version ${versionRow.id}`,
      500
    );
  }

  return {
    definition: {
      id: def.id,
      form_key: def.form_key,
      name: def.name,
      status: def.status,
      active_version_id: def.active_version_id,
      version_number: versionRow.version_number,
      published_by: versionRow.published_by,
      published_at: versionRow.published_at,
      layout: versionRow.layout_json
        ? JSON.parse(versionRow.layout_json)
        : undefined,
    },
    schema,
  };
}

// ── getFormSubmission ──

/**
 * Fetch a single form submission by ID.
 */
export async function getFormSubmission(
  workspaceId: string,
  submissionId: string
): Promise<FormSubmissionRow> {
  const row = await queryOne<FormSubmissionRow>(
    `SELECT * FROM ${TABLES.formSubmissions}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, submissionId]
  );
  if (!row) {
    throw new NotFoundError(`Form submission not found: ${submissionId}`);
  }
  return row;
}

// ── listFormDefinitions ──

/**
 * List form definitions for a workspace, optionally filtered by status.
 */
export async function listFormDefinitions(
  workspaceId: string,
  status?: string
): Promise<Record<string, unknown>[]> {
  const conditions: string[] = ["workspace_id = ?"];
  const args: unknown[] = [workspaceId];

  if (status) {
    conditions.push("status = ?");
    args.push(status);
  }

  const where = conditions.join(" AND ");

  return queryAll<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.formDefinitions} WHERE ${where}
     ORDER BY created_at DESC`,
    args
  );
}

// ── listFormBindings ──

/**
 * List form bindings for a workspace, optionally filtered by usage_type.
 */
export async function listFormBindings(
  workspaceId: string,
  usageType?: string
): Promise<Record<string, unknown>[]> {
  const conditions: string[] = ["workspace_id = ?"];
  const args: unknown[] = [workspaceId];

  if (usageType) {
    conditions.push("usage_type = ?");
    args.push(usageType);
  }

  const where = conditions.join(" AND ");

  return queryAll<Record<string, unknown>>(
    `SELECT * FROM ${TABLES.formBindings} WHERE ${where}
     ORDER BY created_at DESC`,
    args
  );
}

// ── Internal: completeWorkItem ──
//
// Mark a work item as completed to advance the workflow. Uses an optimistic
// version check. Imported dynamically to avoid a hard dependency cycle with
// workflow-v2.

async function completeWorkItem(
  workspaceId: string,
  workItemId: string,
  actorId: string,
  ts: string
): Promise<void> {
  const workItem = await queryOne<{ id: string; version: number; status: string }>(
    `SELECT id, version, status FROM ${TABLES.workItems}
     WHERE workspace_id = ? AND id = ?`,
    [workspaceId, workItemId]
  );
  if (!workItem) return; // work item may have been removed; nothing to advance

  await execute(
    `UPDATE ${TABLES.workItems}
     SET status = 'completed', completed_at = ?, version = version + 1, updated_at = ?
     WHERE id = ? AND version = ? AND status IN ('ready', 'active')`,
    [ts, ts, workItemId, workItem.version]
  );
}

// ── Internal: createServiceReportProjection ──
//
// Create or update a service_report record from an accepted form submission.
// This is called internally by acceptFormSubmission when the binding's
// usage_type is 'service_deliverable'.
//
// Answer-to-field mapping:
//  - summary:        answers[field_key='summary'] | answers['summary']
//  - resolution:      answers[field_key='resolution'] | answers['resolution']
//  - customer_signature: derived from the first signature block's signedBy
//  - photos:          derived from evidence block attachment ids (joined)
//  - work_order_id / service_visit_id: from the submission subject
//
// Uses businessTable('service_report') directly so the projection does not
// require the metadata module's field-definition layer to be loaded.

async function createServiceReportProjection(
  workspaceId: string,
  submission: Record<string, unknown>,
  acceptedBy: string,
  targetMapping: Record<string, unknown> | null
): Promise<string | undefined> {
  const ts = now();

  // Parse the answers JSON column
  let answers: Record<string, unknown> = {};
  const answersJson = submission["answers_json"] as string | undefined;
  if (answersJson) {
    try {
      answers = JSON.parse(answersJson) as Record<string, unknown>;
    } catch {
      answers = {};
    }
  }

  // Parse the schema to find signature/evidence blocks
  let schema: FormSchema | null = null;
  const formVersionId = submission["form_version_id"] as string | undefined;
  if (formVersionId) {
    const versionRow = await queryOne<{ schema_json: string }>(
      `SELECT schema_json FROM ${TABLES.formDefinitionVersions} WHERE id = ?`,
      [formVersionId]
    );
    if (versionRow) {
      try {
        schema = JSON.parse(versionRow.schema_json) as FormSchema;
      } catch {
        schema = null;
      }
    }
  }

  // Resolve mapped values, honoring target_mapping if provided.
  const mapField = (key: string): unknown => {
    if (targetMapping && typeof targetMapping[key] === "string") {
      return answers[targetMapping[key] as string];
    }
    return answers[key];
  };

  const summary = mapField("summary") ?? mapField("service_summary") ?? "";
  const resolution = mapField("resolution") ?? "";

  // Derive customer signature from signature blocks
  let customerSignature: string | null = null;
  if (schema) {
    for (const block of schema.blocks) {
      if (block.block_type === "signature") {
        const sigAnswers = answers[block.id] as
          | { signedBy?: string; acknowledged?: boolean }
          | undefined;
        if (sigAnswers?.signedBy) {
          customerSignature = String(sigAnswers.signedBy);
          break;
        }
      }
    }
  }

  // Derive photos from evidence block attachments
  const photoIds: string[] = [];
  if (schema) {
    for (const block of schema.blocks) {
      if (block.block_type === "evidence") {
        const evidenceAnswers = answers[block.id] as
          | { attachments?: unknown[] }
          | undefined;
        if (evidenceAnswers?.attachments && Array.isArray(evidenceAnswers.attachments)) {
          photoIds.push(...evidenceAnswers.attachments.map(String));
        }
      }
    }
  }

  const subjectType = (submission["subject_type"] as string | null) ?? null;
  const subjectId = (submission["subject_id"] as string | null) ?? null;

  // Determine work_order_id / service_visit_id from the subject
  let workOrderId: string | null = null;
  let serviceVisitId: string | null = null;
  if (subjectType === "work_order") {
    workOrderId = subjectId;
  } else if (subjectType === "service_visit") {
    serviceVisitId = subjectId;
  } else {
    // Allow explicit mapping from answers
    workOrderId = (mapField("work_order_id") as string) ?? null;
    serviceVisitId = (mapField("service_visit_id") as string) ?? null;
  }

  const reportId = genId("rec");

  await execute(
    `INSERT INTO ${businessTable("service_report")}
     (id, workspace_id, work_order_id, service_visit_id, summary, resolution,
      customer_signature, photos, created_by, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
    ]
  );

  return reportId;
}
