import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@runory/contracts";
import { getExtensions } from "@runory/platform-core";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const extensions = await getExtensions(id);
    return NextResponse.json(ok(extensions));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("EXTENSIONS_FETCH_FAILED", message), { status: 500 });
  }
}
