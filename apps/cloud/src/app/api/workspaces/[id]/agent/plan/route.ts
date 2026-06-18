import { NextRequest, NextResponse } from "next/server";
import { ok, err, extensionPlanSchema, type ExtensionPlan } from "@/lib/manifest";
import { validateExtensionPlan } from "@/lib/extension";

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
      return NextResponse.json(ok({ valid: false, errors }));
    }
    const plan = parsed.data as ExtensionPlan;
    const result = validateExtensionPlan(id, plan);
    return NextResponse.json(ok(result));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("PLAN_VALIDATE_FAILED", message), { status: 500 });
  }
}
