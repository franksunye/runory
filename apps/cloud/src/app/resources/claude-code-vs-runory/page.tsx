import type { Metadata } from "next";
import { AgentRuntimeArticlePage } from "@/components/marketing/agent-runtime-article-page";

export const metadata: Metadata = { title: "Claude Code vs Runory | Runory", description: "A concrete comparison of open-ended software modification and governed business configuration." };
export default function Page() { return <AgentRuntimeArticlePage slug="claude-code-vs-runory" />; }
