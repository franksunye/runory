import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@runory/contracts";
import { getExtensionVersions } from "@runory/platform-core";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; extId: string }> }
) {
  try {
    const { id, extId } = await params;
    const versions = await getExtensionVersions(id, extId);
    return NextResponse.json(ok(versions));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("EXTENSION_VERSIONS_FETCH_FAILED", message), { status: 500 });
  }
}
