import { NextRequest, NextResponse } from "next/server";
import { ok, err } from "@runory/contracts";
import { getRecords, createRecord } from "@runory/platform-core";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string }> }
) {
  try {
    const { id, objectKey } = await params;
    const records = await getRecords(id, objectKey);
    return NextResponse.json(ok(records));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("RECORDS_FETCH_FAILED", message), { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; objectKey: string }> }
) {
  try {
    const { id, objectKey } = await params;
    const data = await request.json() as Record<string, unknown>;
    const record = await createRecord(id, objectKey, data);
    return NextResponse.json(ok(record), { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(err("RECORD_CREATE_FAILED", message), { status: 500 });
  }
}
