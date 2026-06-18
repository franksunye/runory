import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@/lib/manifest";
import { getWorkspace } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const workspace = getWorkspace(id);
    if (!workspace) {
      return NextResponse.json(err("WORKSPACE_NOT_FOUND", `Workspace ${id} not found`), { status: 404 });
    }
    return NextResponse.json(ok(workspace));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("WORKSPACE_FETCH_FAILED", message), { status: 500 });
  }
}
