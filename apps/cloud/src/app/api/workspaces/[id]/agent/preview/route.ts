import { NextRequest, NextResponse } from "next/server";
import { ok, err, extensionPlanSchema, type ExtensionPlan } from "@runory/contracts";
import { previewExtension } from "@runory/platform-core";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = extensionPlanSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return NextResponse.json(err("INVALID_PLAN", errors.join("; ")), { status: 400 });
    }
    const plan = parsed.data as ExtensionPlan;
    const preview = await previewExtension(id, plan);
    return NextResponse.json(ok(preview));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("PLAN_PREVIEW_FAILED", message), { status: 500 });
  }
}
