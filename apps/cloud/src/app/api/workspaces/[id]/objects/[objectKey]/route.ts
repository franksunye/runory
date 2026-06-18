import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@/lib/manifest";
import { getObject, getFields } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string }> }
) {
  try {
    const { id, objectKey } = await params;
    const object = getObject(id, objectKey);
    if (!object) {
      return NextResponse.json(err("OBJECT_NOT_FOUND", `Object ${objectKey} not found`), { status: 404 });
    }
    const fields = getFields(id, objectKey);
    return NextResponse.json(ok({ object, fields }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("OBJECT_FETCH_FAILED", message), { status: 500 });
  }
}
