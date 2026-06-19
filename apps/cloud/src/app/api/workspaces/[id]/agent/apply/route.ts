import { NextRequest, NextResponse } from "next/server";
import { ok, err, extensionPlanSchema, type ExtensionPlan } from "@runory/contracts";
import { applyExtension } from "@runory/platform-core";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json() as { plan?: ExtensionPlan; createdBy?: string };
    if (!body.plan || !body.createdBy) {
      return NextResponse.json(err("INVALID_INPUT", "plan and createdBy are required"), { status: 400 });
    }
    const parsed = extensionPlanSchema.safeParse(body.plan);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json(err("INVALID_PLAN", errors.join("; ")), { status: 400 });
    }
    const plan = parsed.data as ExtensionPlan;
    const version = await applyExtension(id, plan, body.createdBy);
    return NextResponse.json(ok(version), { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("PLAN_APPLY_FAILED", message), { status: 500 });
  }
}
