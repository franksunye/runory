import { buildMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata = buildMarketingMetadata({
  title: "Governed Business Runtime for External AI Agents",
  description: "See how Runory provides business structure, permissions, deterministic commands, audit, extensions, and cloud-to-local deployment for external AI Agents.",
  path: "/platform",
  keywords: ["AI agent runtime", "governed agent execution", "MCP business software", "cloud to local software"],
});

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return children;
}
