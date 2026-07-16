import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata = buildMarketingMetadata({
  title: "Focused FSM Pilot in 1–2 Weeks",
  description: "Launch one measurable CRM, Sales, Voice Intake, or FSM operating loop with representative data, real users, governed execution, and clear success metrics.",
  path: "/pilot",
  keywords: ["FSM pilot", "field service implementation", "AI voice pilot", "service operations proof of concept"],
});

export default function PilotLayout({ children }: { children: React.ReactNode }) {
  return children;
}
