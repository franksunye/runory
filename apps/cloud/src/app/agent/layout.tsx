import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata = buildMarketingMetadata({
  title: "External Super Agent Interface for Service Operations",
  description: "Connect Codex, ChatGPT, Claude, Cursor, Trae, and enterprise Agents to governed CRM, Sales, scheduling, and FSM capabilities through Runory.",
  path: "/agent",
  keywords: ["external AI agents", "MCP agent interface", "agent-native business software", "governed AI automation"],
});

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
