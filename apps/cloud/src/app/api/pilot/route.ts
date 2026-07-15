import { NextRequest } from "next/server";
import { db, genId, now } from "@runory/platform-core";
import { getOrCreateRequestId, handleError, invalidInput, successResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

type PilotInquiry = {
  name?: string;
  email?: string;
  company?: string;
  industry?: string;
  teamSize?: string;
  workflow?: string;
  website?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get("x-request-id"));

  try {
    const body = (await request.json()) as PilotInquiry;

    if (body.website) {
      return successResponse({ received: true }, 200, requestId);
    }

    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const company = body.company?.trim();
    const workflow = body.workflow?.trim();

    if (!name || !email || !EMAIL_RE.test(email) || !company || !workflow) {
      return invalidInput("Name, valid work email, company, and workflow are required", requestId);
    }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS pilot_inquiries (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        company TEXT NOT NULL,
        industry TEXT,
        team_size TEXT,
        workflow TEXT NOT NULL,
        source_url TEXT,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new'
      )
    `);

    const id = genId("pilot");
    await db.execute({
      sql: `INSERT INTO pilot_inquiries
        (id, name, email, company, industry, team_size, workflow, source_url, created_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
      args: [
        id,
        name,
        email,
        company,
        body.industry?.trim() || null,
        body.teamSize?.trim() || null,
        workflow,
        request.headers.get("referer"),
        now(),
      ],
    });

    return successResponse({ id, received: true }, 201, requestId);
  } catch (error) {
    return handleError(error, requestId);
  }
}
