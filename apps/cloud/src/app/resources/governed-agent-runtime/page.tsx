import type { Metadata } from "next";
import { AgentRuntimeArticlePage } from "@/components/marketing/agent-runtime-article-page";

export const metadata: Metadata = { title: "Governed Agent Runtime | Runory", description: "Why enterprise AI Agents need identity, permissions, contracts, transactions, audit, approval, and recovery." };
export default function Page() { return <AgentRuntimeArticlePage slug="governed-agent-runtime" />; }
