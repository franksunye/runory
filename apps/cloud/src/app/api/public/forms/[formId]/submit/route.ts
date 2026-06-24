import { NextRequest, NextResponse } from "next/server";
import {
  getRecords,
  createRecord,
  queryAll,
  businessTable,
  now,
  genId,
  execute,
  TABLES,
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
            message: "提交过于频繁，请稍后再试。",
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
      return invalidInput("提交数据过大");
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return invalidInput("无效的请求数据");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return invalidInput("提交数据必须是对象");
    }

    // Spam check (honeypot)
    if (isSpamPayload(body)) {
      // Silently accept but mark as spam (don't tell the bot it was rejected)
      return NextResponse.json({
        success: true,
        data: { message: "感谢您的提交。" },
      });
    }

    // Find the form
    const form = await findFormById(formId);
    if (!form) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "FORM_NOT_FOUND",
            message: "表单不存在或未发布。",
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
            message: `缺少必填字段: ${missing.join(", ")}`,
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
    const payloadData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!key.startsWith("_") && key !== HONEYPOT_FIELD) {
        payloadData[key] = value;
      }
    }

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
        message: form.success_message ?? "感谢您的提交，我们会尽快与您联系。",
      },
    });
  } catch (e) {
    return handleError(e, "public-form-submit");
  }
}
