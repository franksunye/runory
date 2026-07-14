import { NextRequest } from "next/server";
import { handleRetellTool } from "@/integrations/retell/tool-handler";
export async function POST(request: NextRequest) { return handleRetellTool(request, "create-work-order"); }
