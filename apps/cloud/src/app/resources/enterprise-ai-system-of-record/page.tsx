import type { Metadata } from "next";
import { AgentRuntimeArticlePage } from "@/components/marketing/agent-runtime-article-page";

export const metadata: Metadata = { title: "Enterprise AI Still Needs a System of Record | Runory", description: "Why Agents can become the operating interface while business truth remains durable and governed." };
export default function Page() { return <AgentRuntimeArticlePage slug="enterprise-ai-system-of-record" />; }
