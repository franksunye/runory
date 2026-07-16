import type { Metadata } from "next";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = buildMarketingMetadata({
  title: "HVAC Service Software | CRM, Scheduling and FSM",
  description: "Runory connects HVAC intake, customer and equipment context, quoting, maintenance plans, technician scheduling, field execution, and service history.",
  path: "/solutions/hvac",
  keywords: ["HVAC service software", "HVAC CRM", "HVAC field service management", "HVAC scheduling software", "AI voice intake HVAC"],
});

export default function HvacLayout({ children }: { children: React.ReactNode }) {
  return children;
}
