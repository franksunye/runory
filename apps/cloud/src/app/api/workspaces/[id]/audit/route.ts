import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@/lib/manifest";
import { getAuditLogs } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const logs = getAuditLogs(id);
    return NextResponse.json(ok(logs));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("AUDIT_FETCH_FAILED", message), { status: 500 });
  }
}
