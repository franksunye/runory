import type { Metadata } from "next";
import { AgentRuntimeArticlePage } from "@/components/marketing/agent-runtime-article-page";

export const metadata: Metadata = { title: "Runory Agent Architecture | Runory", description: "How Runory connects external Agents to governed FSM execution through MCP, Skills, SDKs, commands, and workflows." };
type PageProps = { params: Promise<{ locale: string }> };

export default async function Page({ params }: PageProps) {
  const { locale } = await params;
  return <AgentRuntimeArticlePage slug="runory-agent-architecture" locale={locale} />;
}
