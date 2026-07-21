import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { AgentRuntimePositioning } from "@/components/marketing/agent-runtime-positioning";
import { RunoryHomeV2 } from "@/components/marketing/runory-home-v2";

/**
 * Static homepage. No auth check, no client-side state — fully pre-rendered
 * at build time for each locale. The CTA always points to /pilot.
 */
export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />
      <RunoryHomeV2 />
      <AgentRuntimePositioning />
      <MarketingFooter />
    </main>
  );
}
