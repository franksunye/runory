import type { Metadata } from "next";
import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Home Services Software | CRM, Voice Intake and FSM",
  description: "Runory connects omnichannel intake, CRM, sales, scheduling, dispatch, field execution, payments, and follow-up for home service businesses.",
  path: "/solutions/home-services",
  keywords: ["home services software", "home service CRM", "home service FSM", "AI voice intake for home services", "field service operating system"],
});

export default function HomeServicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
