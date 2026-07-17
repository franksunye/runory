import type { Metadata } from "next";
import { AgentRuntimeArticlePage } from "@/components/marketing/agent-runtime-article-page";

export const metadata: Metadata = { title: "Agent Token Efficiency | Runory", description: "How governed business runtimes reduce repeated Agent context, code generation, testing, and repair overhead." };
export default function Page() { return <AgentRuntimeArticlePage slug="agent-token-efficiency" />; }
