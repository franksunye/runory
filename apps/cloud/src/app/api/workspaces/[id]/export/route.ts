import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@runory/contracts";
import { exportWorkspace } from "@runory/platform-core";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const exported = await exportWorkspace(id);
    return NextResponse.json(ok(exported));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("EXPORT_FAILED", message), { status: 500 });
  }
}
