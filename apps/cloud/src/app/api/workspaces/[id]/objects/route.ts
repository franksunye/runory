import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@runory/contracts";
import { getObjects } from "@runory/platform-core";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const objects = await getObjects(id);
    return NextResponse.json(ok(objects));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("OBJECTS_FETCH_FAILED", message), { status: 500 });
  }
}
