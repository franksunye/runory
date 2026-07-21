import type { Metadata } from "next";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Waterproofing and Repair Software | CRM, Projects and FSM",
  description: "Runory connects lead intake, inspection, proposal, project execution, field evidence, change control, settlement, and after-sales for waterproofing and repair businesses.",
  path: "/solutions/waterproofing",
  keywords: ["waterproofing business software", "repair CRM", "waterproofing FSM", "inspection and quote software", "field project management"],
});

export default function WaterproofingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
