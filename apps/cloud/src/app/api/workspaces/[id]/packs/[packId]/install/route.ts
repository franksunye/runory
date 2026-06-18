import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@/lib/manifest";
import { installPack } from "@/lib/installer";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; packId: string }> }
) {
  try {
    const { id, packId } = await params;
    const result = installPack(id, packId);
    return NextResponse.json(ok(result), { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("PACK_INSTALL_FAILED", message), { status: 500 });
  }
}
