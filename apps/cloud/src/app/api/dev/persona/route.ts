import { NextRequest, NextResponse } from "next/server";
import { queryAll, TABLES } from "@runory/platform-core";

export const dynamic = "force-dynamic";

const PERSONAS = [
  { id: "dev-local-owner", label: "Local workspace owner", externalId: "dev-local-owner", color: "slate" },
  { id: "persona:sales-rep", label: "Sarah Chen", externalId: "persona:sales-rep", color: "blue" },
  { id: "persona:sales-manager", label: "Michael Torres", externalId: "persona:sales-manager", color: "indigo" },
  { id: "persona:dispatcher", label: "Lisa Wang", externalId: "persona:dispatcher", color: "amber" },
  { id: "persona:technician", label: "David Park", externalId: "persona:technician", color: "emerald" },
  { id: "persona:technician-james", label: "James Wilson", externalId: "persona:technician-james", color: "emerald" },
  { id: "persona:technician-maria", label: "Maria Garcia", externalId: "persona:technician-maria", color: "emerald" },
  { id: "persona:supervisor", label: "Robert Kim", externalId: "persona:supervisor", color: "purple" },
] as const;

const PERSONA_IDS = new Set<string>(PERSONAS.map((persona) => persona.id));

// GET: list available personas
export async function GET(request: NextRequest) {
  // Only available in dev mode
  if (process.env.PLATFORM_DEV_BOOTSTRAP !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  // Read current persona from cookie
  const selectedPersona = request.cookies.get("dev-persona")?.value;
  const currentPersona = selectedPersona && PERSONA_IDS.has(selectedPersona)
    ? selectedPersona
    : "dev-local-owner";

  const identities = await queryAll<{ external_id: string; display_name: string }>(
    `SELECT external_id, display_name FROM ${TABLES.users}
     WHERE external_id IN (${PERSONAS.map(() => "?").join(",")})`,
    PERSONAS.map((persona) => persona.externalId)
  );
  const names = new Map(identities.map((identity) => [identity.external_id, identity.display_name]));
  const personas = PERSONAS.map((persona) => ({
    ...persona,
    label: names.get(persona.externalId) ?? persona.label,
  }));

  return NextResponse.json({ personas, current: currentPersona });
}

// POST: switch persona
export async function POST(request: NextRequest) {
  if (process.env.PLATFORM_DEV_BOOTSTRAP !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const personaId = body.personaId as string;

    if (!personaId || !PERSONA_IDS.has(personaId)) {
      return NextResponse.json({ error: "Unknown personaId" }, { status: 400 });
    }

    const response = NextResponse.json({ success: true, personaId });
    response.cookies.set("dev-persona", personaId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
