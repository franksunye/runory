import type { Metadata } from "next";
import { AgentRuntimeArticlePage } from "@/components/marketing/agent-runtime-article-page";

export const metadata: Metadata = { title: "Configuration Before Code Generation | Runory", description: "Why enterprise Agent systems should compose trusted capabilities before generating new application code." };
export default function Page() { return <AgentRuntimeArticlePage slug="configuration-before-code" />; }
