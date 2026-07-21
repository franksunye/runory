import type { Metadata } from "next";
import { AgentRuntimeArticlePage } from "@/components/marketing/agent-runtime-article-page";

export const metadata: Metadata = { title: "The Productionization Gap in AI-Generated Software | Runory", description: "Why AI-built CRM, CMS, and operations applications still need enterprise architecture and production hardening." };
type PageProps = { params: Promise<{ locale: string }> };

export default async function Page({ params }: PageProps) {
  const { locale } = await params;
  return <AgentRuntimeArticlePage slug="ai-software-productionization-gap" locale={locale} />;
}
