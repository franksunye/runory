import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@/lib/manifest";
import { createWorkspace } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { name?: string; templateId?: string };
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json(err("INVALID_INPUT", "name is required"), { status: 400 });
    }
    const workspace = createWorkspace(body.name, body.templateId);
    return NextResponse.json(ok(workspace), { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("WORKSPACE_CREATE_FAILED", message), { status: 500 });
  }
}
