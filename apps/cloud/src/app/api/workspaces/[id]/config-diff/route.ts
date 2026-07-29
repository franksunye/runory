import { NextRequest } from "next/server";
import {
  diffWorkspaces,
  diffWorkspaceAgainstReference,
  resolveWorkspaceId,
} from "@runory/platform-core";
import { requirePrincipal } from "@/lib/auth";
import { successResponse, handleError } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/workspaces/[id]/config-diff — configuration diff between a
 * baseline and the target workspace.
 *
 * Query params:
 *   - baseline=<workspaceId>  Compare against another workspace
 *   - reference=<solutionName> Compare against a reference solution
 *
 * If neither is provided, returns a diff of the workspace against an empty
 * baseline (showing everything as "added"), which is useful for auditing
 * a workspace's complete configuration.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePrincipal(request);
    const { id } = await params;
    const workspaceId = await resolveWorkspaceId(id);
    const url = new URL(request.url);
    const baseline = url.searchParams.get("baseline");
    const reference = url.searchParams.get("reference");

    if (baseline) {
      const baselineWorkspaceId = await resolveWorkspaceId(baseline);
      const diff = await diffWorkspaces(baselineWorkspaceId, workspaceId);
      return successResponse(diff);
    }

    if (reference) {
      // Load the reference solution from the catalog
      const { readFileSync } = await import("node:fs");
      const { resolve, join } = await import("node:path");
      const { existsSync } = await import("node:fs");

      const candidates = [
        resolve(process.cwd(), ".resources", "catalog", "reference-solutions", `${reference}.solution.json`),
        resolve(process.cwd(), "catalog", "reference-solutions", `${reference}.solution.json`),
        resolve(process.cwd(), "..", "..", "catalog", "reference-solutions", `${reference}.solution.json`),
      ];

      let solutionPath: string | null = null;
      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          solutionPath = candidate;
          break;
        }
      }

      if (!solutionPath) {
        return handleError(
          new Error(`Reference solution not found: ${reference}`),
        );
      }

      const solution = JSON.parse(readFileSync(solutionPath, "utf-8"));
      const diff = await diffWorkspaceAgainstReference(
        {
          name: solution.name,
          packs: solution.spec.packs,
        },
        workspaceId,
      );
      return successResponse(diff);
    }

    // Default: diff against empty baseline (audit mode)
    const diff = await diffWorkspaceAgainstReference(
      { name: "empty", packs: [] },
      workspaceId,
    );
    return successResponse(diff);
  } catch (e) {
    return handleError(e);
  }
}
