import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, GitBranch, Layers3 } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "Resources | Runory",
  description: "Practical guides on Agent-native field service operations, voice intake, governed automation, and service-business system design.",
  alternates: { canonical: "/resources" },
};

const articles = [
  { slug: "agent-native-field-service", category: "Strategy", title: "What Agent-native field service software actually means", summary: "Why the Agent should be the operating interface while the business system remains the governed source of truth." },
  { slug: "voice-intake-to-work-order", category: "Operations", title: "From phone call to work order without duplicate entry", summary: "A practical operating model for converting voice and messaging conversations into CRM, Sales, and FSM execution." },
  { slug: "focused-fsm-pilot", category: "Implementation", title: "How to scope a field service pilot that can launch quickly", summary: "Choose one measurable workflow, constrain integrations, and prove operational value before expanding." },
];

export default function ResourcesPage() {
  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-24 lg:px-10">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Resources</p>
        <h1 className="mt-5 max-w-4xl font-serif text-5xl leading-[1.03] tracking-[-.045em] sm:text-7xl">Operating ideas for the Agent era.</h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-neutral-600">Practical thinking for service businesses, product teams, and implementation partners building connected CRM, Sales, Voice, and FSM operations.</p>
      </section>

      <section className="border-y border-black/10 bg-white py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-5 px-5 sm:px-6 md:grid-cols-3 lg:px-10">
          {articles.map((article) => (
            <Link key={article.slug} href={`/resources/${article.slug}`} className="group rounded-2xl border border-black/10 bg-[#fbf8f1] p-6 transition hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(50,35,20,.08)]">
              <span className="text-xs font-semibold uppercase tracking-[.15em] text-orange-600">{article.category}</span>
              <h2 className="mt-5 text-xl font-semibold leading-7">{article.title}</h2>
              <p className="mt-3 text-sm leading-6 text-neutral-600">{article.summary}</p>
              <span className="mt-7 inline-flex items-center gap-2 text-sm font-semibold">Read article <ArrowRight size={16} className="transition group-hover:translate-x-1" /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-16 sm:px-6 sm:py-20 md:grid-cols-3 lg:px-10">
        {[
          [BookOpen, "Documentation", "Implementation guides, architecture, and operational references.", "/docs"],
          [Layers3, "Packs & Modules", "Reusable business capabilities and catalog structure.", "/packs"],
          [GitBranch, "Open Source", "Runtime, SDK, tooling, and repository releases.", "/open-source"],
        ].map(([Icon, title, body, href]) => (
          <Link key={String(title)} href={href as string} className="rounded-2xl border border-black/10 bg-white p-6"><Icon size={22} className="text-orange-600" /><h2 className="mt-5 text-lg font-semibold">{title as string}</h2><p className="mt-3 text-sm leading-6 text-neutral-600">{body as string}</p></Link>
        ))}
      </section>
      <MarketingFooter />
    </main>
  );
}
