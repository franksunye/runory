import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@/lib/manifest";
import { rollbackExtension } from "@/lib/extension";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json() as { extensionId?: string; rolledBy?: string };
    if (!body.extensionId || !body.rolledBy) {
      return NextResponse.json(err("INVALID_INPUT", "extensionId and rolledBy are required"), { status: 400 });
    }
    const version = rollbackExtension(id, body.extensionId, body.rolledBy);
    return NextResponse.json(ok(version), { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("ROLLBACK_FAILED", message), { status: 500 });
  }
}
