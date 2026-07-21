import type { Metadata } from "next";
import { AgentRuntimeArticlePage } from "@/components/marketing/agent-runtime-article-page";

export const metadata: Metadata = { title: "Agent Token Efficiency | Runory", description: "How governed business runtimes reduce repeated Agent context, code generation, testing, and repair overhead." };
type PageProps = { params: Promise<{ locale: string }> };

export default async function Page({ params }: PageProps) {
  const { locale } = await params;
  return <AgentRuntimeArticlePage slug="agent-token-efficiency" locale={locale} />;
}
