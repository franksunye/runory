import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@/lib/manifest";
import { getRecord, updateRecord } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string; recordId: string }> }
) {
  try {
    const { id, objectKey, recordId } = await params;
    const record = getRecord(id, objectKey, recordId);
    if (!record) {
      return NextResponse.json(err("RECORD_NOT_FOUND", `Record ${recordId} not found`), { status: 404 });
    }
    return NextResponse.json(ok(record));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("RECORD_FETCH_FAILED", message), { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string; recordId: string }> }
) {
  try {
    const { id, objectKey, recordId } = await params;
    const data = await request.json() as Record<string, unknown>;
    const record = updateRecord(id, objectKey, recordId, data);
    if (!record) {
      return NextResponse.json(err("RECORD_NOT_FOUND", `Record ${recordId} not found`), { status: 404 });
    }
    return NextResponse.json(ok(record));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("RECORD_UPDATE_FAILED", message), { status: 500 });
  }
}
