import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@/lib/manifest";
import { getNavigation } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const navigation = getNavigation(id);
    return NextResponse.json(ok(navigation));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("NAVIGATION_FETCH_FAILED", message), { status: 500 });
  }
}
