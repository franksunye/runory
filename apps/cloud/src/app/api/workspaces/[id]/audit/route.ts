import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@runory/contracts";
import { getAuditLogs } from "@runory/platform-core";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const logs = await getAuditLogs(id);
    return NextResponse.json(ok(logs));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("AUDIT_FETCH_FAILED", message), { status: 500 });
  }
}
