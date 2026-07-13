import { NextRequest } from "next/server";
import { queryAll, TABLES } from "@runory/platform-core";
import { requirePlatformAdmin } from "@/lib/auth";
import { successResponse, handleError, getOrCreateRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

// DB row (snake_case) — runory_catalog_compatibility_reports table
interface CompatibilityReportRow {
  id: string;
  workspace_id: string;
  catalog_item_id: string;
  from_version_id: string | null;
  to_version_id: string;
  status: string;
  core_compatibility_json: string | null;
  dependency_diff_json: string | null;
  permission_diff_json: string | null;
  schema_diff_json: string | null;
  extension_conflicts_json: string | null;
  migration_risk_json: string | null;
  created_at: string;
}

function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// GET /api/admin/compatibility — lists all compatibility reports (platform admins only)
//
// `listCompatibilityReports` from @runory/platform-core is scoped to a single
// workspace, so for the platform-wide admin view we query the
// runory_catalog_compatibility_reports table directly.
export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));
  try {
    await requirePlatformAdmin(request);

    const rows = await queryAll<CompatibilityReportRow>(
      `SELECT * FROM ${TABLES.compatibilityReports}
       ORDER BY created_at DESC`
    );

    const reports = rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      catalogItemId: row.catalog_item_id,
      fromVersionId: row.from_version_id,
      toVersionId: row.to_version_id,
      status: row.status,
      coreCompatibility: parseJson(row.core_compatibility_json),
      dependencyDiff: parseJson(row.dependency_diff_json),
      permissionDiff: parseJson(row.permission_diff_json),
      schemaDiff: parseJson(row.schema_diff_json),
      extensionConflicts: parseJson(row.extension_conflicts_json),
      migrationRisk: parseJson(row.migration_risk_json),
      createdAt: row.created_at,
    }));

    return successResponse(reports, 200, requestId);
  } catch (e) {
    return handleError(e, requestId);
  }
}
