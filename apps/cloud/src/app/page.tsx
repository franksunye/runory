"use client";

import { useEffect, useState } from "react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { AgentRuntimePositioning } from "@/components/marketing/agent-runtime-positioning";
import { RunoryHomeV2 } from "@/components/marketing/runory-home-v2";
import { apiFetch } from "@/lib/api-fetch";

export default function LandingPage() {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    apiFetch<{ success: boolean; data?: { authenticated: boolean } }>("/api/auth/me", { cache: "no-store" })
      .then((result) => setAuthenticated(result.success && result.data?.authenticated === true))
      .catch(() => setAuthenticated(false));
  }, []);

  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader authenticated={authenticated} />
      <RunoryHomeV2 />
      <AgentRuntimePositioning />
      <MarketingFooter />
    </main>
  );
}
