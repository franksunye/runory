import type { Metadata } from "next";
import { AgentRuntimeArticlePage } from "@/components/marketing/agent-runtime-article-page";

export const metadata: Metadata = { title: "The Productionization Gap in AI-Generated Software | Runory", description: "Why AI-built CRM, CMS, and operations applications still need enterprise architecture and production hardening." };
export default function Page() { return <AgentRuntimeArticlePage slug="ai-software-productionization-gap" />; }
