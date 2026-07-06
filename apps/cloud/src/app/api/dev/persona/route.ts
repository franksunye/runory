import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET: list available personas
export async function GET(request: NextRequest) {
  // Only available in dev mode
  if (process.env.PLATFORM_DEV_BOOTSTRAP !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const personas = [
    { id: "dev-local-owner", label: "Local Owner (Admin)", externalId: "dev-local-owner", color: "slate" },
    { id: "persona:sales-rep", label: "Sales Rep — Sarah Chen", externalId: "persona:sales-rep", color: "blue" },
    { id: "persona:sales-manager", label: "Sales Manager — Michael Torres", externalId: "persona:sales-manager", color: "indigo" },
    { id: "persona:dispatcher", label: "Dispatcher — Lisa Wang", externalId: "persona:dispatcher", color: "amber" },
    { id: "persona:technician", label: "Technician — David Park", externalId: "persona:technician", color: "emerald" },
    { id: "persona:supervisor", label: "Supervisor — Robert Kim", externalId: "persona:supervisor", color: "purple" },
  ];

  // Read current persona from cookie
  const currentPersona = request.cookies.get("dev-persona")?.value ?? "dev-local-owner";

  return NextResponse.json({ personas, current: currentPersona });
}

// POST: switch persona
export async function POST(request: NextRequest) {
  if (process.env.PLATFORM_DEV_BOOTSTRAP !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const body = await request.json();
  const personaId = body.personaId as string;

  if (!personaId) {
    return NextResponse.json({ error: "personaId required" }, { status: 400 });
  }

  const response = NextResponse.json({ success: true, personaId });
  response.cookies.set("dev-persona", personaId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return response;
}
