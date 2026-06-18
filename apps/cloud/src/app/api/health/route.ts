import { NextResponse } from "next/server";
import { ok } from "@/lib/manifest";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(ok({ ok: true, service: "runory-cloud" }));
}
