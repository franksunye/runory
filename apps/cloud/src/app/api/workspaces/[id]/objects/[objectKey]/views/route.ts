import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@/lib/manifest";
import { getViews } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string }> }
) {
  try {
    const { id, objectKey } = await params;
    const views = getViews(id, objectKey);
    return NextResponse.json(ok(views));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("VIEWS_FETCH_FAILED", message), { status: 500 });
  }
}
