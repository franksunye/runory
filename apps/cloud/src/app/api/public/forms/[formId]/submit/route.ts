import { NextRequest, NextResponse } from "next/server";
import {
  submitForm,
  getFormDefinition,
  getFormBinding,
  queryAll,
  businessTable,
  now,
  genId,
  execute,
  TABLES,
  type FormSchema,
  BusinessError,
  ERROR_CODES,
} from "@runory/platform-core";
import { checkRateLimit } from "@/lib/rate-limit";
import { successResponse, handleError, invalidInput } from "@/lib/http";

export const dynamic = "force-dynamic";

// Honeypot field name — if this field is filled, the submission is spam
const HONEYPOT_FIELD = "_company_website";

// Maximum payload size (bytes)
const MAX_PAYLOAD_SIZE = 64 * 1024; // 64KB

interface FormRecord {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  status: string;
  target_object: string;
  fields_json: string | null;
  submit_button_label: string | null;
  success_message: string | null;
  campaign_id: string | null;
}

// ── Forms 2.0 lookup ──
//
// Per Spec Decision 10 ("Public endpoint is a form usage/channel policy, not a
// second product"), public submissions for Forms 2.0 forms flow through a
// `form_bindings` row with `usage_type = "public_endpoint"` and are persisted
// via `submitForm()` from @runory/platform-core — never written directly to the
// legacy `submission` business table.
//
// `formId` from the URL may be either a Forms 2.0 definition ID or a legacy
// v1.0 form record ID. Definition IDs are globally unique, so we resolve the
// definition without a workspace filter first, then use the official
// `getFormDefinition` API to fetch its active (published) version + schema.

interface FormsV2Definition {
  definitionId: string;
  formKey: string;
  schema: FormSchema;
  workspaceId: string;
}

async function findFormsV2Definition(
  formId: string
): Promise<FormsV2Definition | null> {
  // Bridge from the URL formId (a definition ID) to the (workspace_id,
  // form_key) pair that getFormDefinition requires.
  const rows = await queryAll<{
    id: string;
    workspace_id: string;
    form_key: string;
    status: string;
    active_version_id: string | null;
  }>(
    `SELECT id, workspace_id, form_key, status, active_version_id
     FROM ${TABLES.formDefinitions}
     WHERE id = ? AND status = 'active'`,
    [formId]
  );
  if (rows.length === 0) return null;

  const def = rows[0];
  // No active version means the form is not published for submission.
  if (!def.active_version_id) return null;

  // Fetch the active version (definition + parsed schema) via the official
  // Forms 2.0 API. Returns undefined if the definition/version is missing or
  // the schema cannot be resolved.
  const active = await getFormDefinition(def.workspace_id, def.form_key);
  if (!active) return null;

  return {
    definitionId: def.id,
    formKey: def.form_key,
    schema: active.schema,
    workspaceId: def.workspace_id,
  };
}

// Find an active `public_endpoint` binding for a Forms 2.0 form definition.
// A form is only submittable through this public endpoint if such a binding
// exists; otherwise the form is not available for public submission.
//
// Note: getFormBinding() looks bindings up by `usage_key`, but public-endpoint
// bindings are addressed by `form_definition_id` (the binding links a specific
// form definition to public availability, with an optional usage_key slug), so
// we query form_bindings directly here.
async function findPublicBinding(
  workspaceId: string,
  formDefinitionId: string
): Promise<{ id: string } | null> {
  const rows = await queryAll<{ id: string }>(
    `SELECT id FROM ${TABLES.formBindings}
     WHERE workspace_id = ? AND form_definition_id = ?
       AND usage_type = 'public_endpoint' AND active = 1`,
    [workspaceId, formDefinitionId]
  );
  return rows[0] ?? null;
}

// ── Legacy v1.0 lookup (backward compatibility) ──

async function findFormById(formId: string): Promise<FormRecord | null> {
  const tableName = businessTable("form");
  const rows = await queryAll<FormRecord>(
    `SELECT * FROM ${tableName} WHERE id = ? AND status = 'published'`,
    [formId]
  );
  return rows[0] ?? null;
}

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

function isSpamPayload(data: Record<string, unknown>): boolean {
  // Check honeypot field
  if (data[HONEYPOT_FIELD] && String(data[HONEYPOT_FIELD]).length > 0) {
    return true;
  }
  return false;
}

// Strip internal/metadata fields (prefixed with "_") and the honeypot field
// from the submitted body, leaving only the user-provided form answers.
function extractAnswers(body: Record<string, unknown>): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!key.startsWith("_") && key !== HONEYPOT_FIELD) {
      answers[key] = value;
    }
  }
  return answers;
}

function validateRequiredFields(
  data: Record<string, unknown>,
  fieldsJson: string | null
): string[] {
  if (!fieldsJson) return [];
  try {
    const fields = JSON.parse(fieldsJson) as Array<{
      key: string;
      required?: boolean;
    }>;
    const missing: string[] = [];
    for (const field of fields) {
      if (field.required) {
        const value = data[field.key];
        if (value === undefined || value === null || String(value).trim() === "") {
          missing.push(field.key);
        }
      }
    }
    return missing;
  } catch {
    return [];
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await params;

    // Rate limiting by IP
    const clientIP = getClientIP(request);
    const rateLimit = checkRateLimit(`form-submit:${clientIP}`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many submissions. Please try again later.",
          },
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rateLimit.resetAt),
          },
        }
      );
    }

    // Parse body with size limit
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE) {
      return invalidInput("Submission payload too large");
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return invalidInput("Invalid request data");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return invalidInput("Submission data must be an object");
    }

    // Spam check (honeypot)
    if (isSpamPayload(body)) {
      // Silently accept but mark as spam (don't tell the bot it was rejected)
      return NextResponse.json({
        success: true,
        data: { message: "Thank you for your submission." },
      });
    }

    // ── Forms 2.0 path ──
    // Try Forms 2.0 first; fall back to the legacy v1.0 form table below.
    const v2Definition = await findFormsV2Definition(formId);
    if (v2Definition) {
      // A form is only publicly submittable if it has an active
      // `public_endpoint` binding.
      const binding = await findPublicBinding(
        v2Definition.workspaceId,
        v2Definition.definitionId
      );
      if (!binding) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "FORM_NOT_AVAILABLE",
              message: "This form is not available for public submission.",
            },
          },
          { status: 404 }
        );
      }

      // Forms 2.0 validation (required fields, checklists, evidence,
      // signatures) happens inside submitForm via validateAnswers.
      try {
        const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
        const { submissionId } = await submitForm(
          v2Definition.workspaceId,
          {
            formDefinitionId: v2Definition.definitionId,
            bindingId: binding.id,
            answers: extractAnswers(body),
            submittedBy: "anonymous",
          },
          idempotencyKey
        );

        return NextResponse.json({
          success: true,
          data: {
            id: submissionId,
            message:
              "Thank you for your submission. We will get back to you soon.",
          },
        });
      } catch (e) {
        // Map required-input validation failures to the same 422 contract the
        // legacy path exposes, so the public API stays consistent across both
        // form generations.
        if (
          e instanceof BusinessError &&
          e.code === ERROR_CODES.REQUIRED_INPUT_MISSING
        ) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: e.message,
              },
            },
            { status: 422 }
          );
        }
        throw e;
      }
    }

    // ── Legacy v1.0 path (backward compatibility) ──
    // Existing marketing-capture-pack workspaces store forms in
    // businessTable("form") and submissions in businessTable("submission").
    const form = await findFormById(formId);
    if (!form) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORM_NOT_FOUND",
            message: "Form not found or not published.",
          },
        },
        { status: 404 }
      );
    }

    // Validate required fields
    const missing = validateRequiredFields(body, form.fields_json);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Missing required fields: ${missing.join(", ")}`,
          },
        },
        { status: 422 }
      );
    }

    // Extract metadata from request
    const userAgent = request.headers.get("user-agent") ?? "";
    const referrer = request.headers.get("referer") ?? "";
    const sourceUrl = body._source_url ? String(body._source_url) : null;
    const landingPageId = body._landing_page_id ? String(body._landing_page_id) : null;
    const consentGiven = Boolean(body._consent);
    const consentText = body._consent_text ? String(body._consent_text) : null;

    // Remove internal fields from payload
    const payloadData = extractAnswers(body);

    // Create submission record
    const submissionId = genId("sub");
    const timestamp = now();
    const payloadJson = JSON.stringify(payloadData);

    await execute(
      `INSERT INTO ${businessTable("submission")}
       (id, workspace_id, form_id, landing_page_id, campaign_id, status, payload_json,
        source_url, referrer, ip_address, user_agent, consent_given, consent_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        submissionId,
        form.workspace_id,
        form.id,
        landingPageId,
        form.campaign_id,
        "new",
        payloadJson,
        sourceUrl,
        referrer,
        clientIP,
        userAgent,
        consentGiven ? 1 : 0,
        consentText,
        timestamp,
        timestamp,
      ]
    );

    return NextResponse.json({
      success: true,
      data: {
        id: submissionId,
        message: form.success_message ?? "Thank you for your submission. We will get back to you soon.",
      },
    });
  } catch (e) {
    return handleError(e, "public-form-submit");
  }
}
