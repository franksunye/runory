import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@/lib/manifest";
import { getObjects } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const objects = getObjects(id);
    return NextResponse.json(ok(objects));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("OBJECTS_FETCH_FAILED", message), { status: 500 });
  }
}
