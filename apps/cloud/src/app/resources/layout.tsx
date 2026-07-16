import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata = buildMarketingMetadata({
  title: "Runory Resources on Agent-native CRM, Voice and FSM",
  description: "Read practical guides on external Super Agents, voice intake, CRM and FSM operating loops, Agent-native field service software, and focused pilot delivery.",
  path: "/resources",
  keywords: ["agent-native FSM", "voice intake guide", "CRM sales FSM", "field service resources"],
});

export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
