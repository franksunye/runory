import Link from "next/link";
import { ArrowRight, Boxes, Braces, CloudCog, Database, KeyRound, ShieldCheck } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export default function PlatformPage() {
  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Runory Platform</p>
        <h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">A lightweight business runtime built for governed Agent execution.</h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-neutral-600">External Agents provide intelligence and orchestration. Runory provides business structure, permissions, deterministic commands, state, and audit.</p>
        <div className="mt-10 flex flex-wrap gap-3"><Link href="/docs" className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">Explore Resources <ArrowRight size={18} /></Link><Link href="/agent" className="inline-flex items-center rounded-full border border-black/15 bg-white px-6 py-3 font-semibold">Agent Interface</Link></div>
      </section>

      <section className="border-y border-black/10 bg-white py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid gap-4 md:grid-cols-3">
            {["SaaS Foundation", "Runory Runtime", "Runory Business"].map((layer, index) => <div key={layer} className={`rounded-2xl border p-6 ${index === 1 ? "border-orange-300 bg-orange-50" : "border-black/10 bg-[#fbf8f1]"}`}><span className="text-xs font-semibold text-orange-600">0{index + 1}</span><h2 className="mt-8 text-xl font-semibold">{layer}</h2><p className="mt-3 text-sm leading-6 text-neutral-600">{index === 0 ? "Identity, workspace, tenancy, membership, and cloud operations." : index === 1 ? "Metadata composition, commands, workflows, permissions, extensions, and integrations." : "CRM, Sales, FSM, Voice Intake, payments, and operational business state."}</p></div>)}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-2 lg:grid-cols-3 lg:px-10">
          {[
            [Boxes, "Modules, Packs & Extensions", "Install reusable business capabilities and adapt each workspace without forking Core."],
            [Braces, "Metadata-driven composition", "Objects, fields, forms, views, workflows, permissions, and tools compose into one effective runtime model."],
            [ShieldCheck, "Governed commands", "All writes pass through validation, permission, risk, confirmation, execution, and audit."],
            [KeyRound, "MCP, Skills & SDK", "Expose clear, versioned capabilities to Codex, ChatGPT, Claude, Cursor, Trae, and enterprise Agents."],
            [Database, "Cloud-to-local foundation", "A consistent libSQL/SQLite-oriented structure keeps cloud and local deployment paths aligned."],
            [CloudCog, "Reliable integrations", "Outbox, idempotency, replay, webhooks, provider adapters, and visible failure handling."],
          ].map(([Icon, title, body]) => <article key={String(title)} className="rounded-2xl border border-black/10 bg-white p-6"><Icon size={22} className="text-orange-600" /><h2 className="mt-5 text-lg font-semibold">{title as string}</h2><p className="mt-3 text-sm leading-6 text-neutral-600">{body as string}</p></article>)}
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}
