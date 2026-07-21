import type { Metadata } from "next";
import { AgentRuntimeArticlePage } from "@/components/marketing/agent-runtime-article-page";

export const metadata: Metadata = { title: "Claude Code vs Runory | Runory", description: "A concrete comparison of open-ended software modification and governed business configuration." };
type PageProps = { params: Promise<{ locale: string }> };

export default async function Page({ params }: PageProps) {
  const { locale } = await params;
  return <AgentRuntimeArticlePage slug="claude-code-vs-runory" locale={locale} />;
}
