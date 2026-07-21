import type { Metadata } from "next";
import { AgentRuntimeArticlePage } from "@/components/marketing/agent-runtime-article-page";

export const metadata: Metadata = { title: "From Vibe Coding to Governed Business Systems | Runory", description: "Why AI-generated applications need a governed business runtime before enterprises can depend on them." };
type PageProps = { params: Promise<{ locale: string }> };

export default async function Page({ params }: PageProps) {
  const { locale } = await params;
  return <AgentRuntimeArticlePage slug="vibe-coding-to-governed-business-systems" locale={locale} />;
}
