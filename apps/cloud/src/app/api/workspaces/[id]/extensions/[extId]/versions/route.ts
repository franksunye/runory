import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@/lib/manifest";
import { getExtensionVersions } from "@/lib/extension";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; extId: string }> }
) {
  try {
    const { id, extId } = await params;
    const versions = getExtensionVersions(id, extId);
    return NextResponse.json(ok(versions));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("EXTENSION_VERSIONS_FETCH_FAILED", message), { status: 500 });
  }
}
