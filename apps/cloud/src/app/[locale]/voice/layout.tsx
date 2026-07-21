import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata = buildMarketingMetadata({
  title: "AI Voice Intake to CRM and Work Orders",
  description: "Turn phone calls, messages, and web requests into structured customers, leads, work orders, visits, confirmations, and follow-up through governed execution.",
  path: "/voice",
  keywords: ["AI voice intake", "phone to work order", "voice AI for field service", "automated service dispatch"],
});

export default function VoiceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
