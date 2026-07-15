"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { SITE_CONFIG } from "@/lib/site";

interface DocEntry {
  title: MessageKey;
  desc: MessageKey;
  path: string;
}

export default function DocsPage() {
  const { t } = useI18n();
  const gh = SITE_CONFIG.githubUrl;
  const blob = (path: string) => `${gh}/blob/main/${path}`;

  const sections: { heading: MessageKey; entries: DocEntry[] }[] = [
    { heading: "docs.sectionGettingStarted", entries: [{ title: "docs.gettingStarted.title", desc: "docs.gettingStarted.desc", path: blob("docs/getting-started.md") }] },
    { heading: "docs.sectionConcepts", entries: [
      { title: "docs.concepts.title", desc: "docs.concepts.desc", path: blob("docs/concepts.md") },
      { title: "docs.architectureOverview.title", desc: "docs.architectureOverview.desc", path: blob("docs/architecture/overview.md") },
      { title: "docs.i18n.title", desc: "docs.i18n.desc", path: blob("docs/architecture/internationalization.md") },
      { title: "docs.moduleArchitecture.title", desc: "docs.moduleArchitecture.desc", path: blob("docs/architecture/module-architecture.md") },
    ] },
    { heading: "docs.sectionGuides", entries: [
      { title: "docs.workspaceGuide.title", desc: "docs.workspaceGuide.desc", path: blob("docs/workspace-guide.md") },
      { title: "docs.packsModules.title", desc: "docs.packsModules.desc", path: blob("docs/packs-and-modules.md") },
      { title: "docs.agentOperations.title", desc: "docs.agentOperations.desc", path: blob("docs/agent-operations.md") },
      { title: "docs.mcpSkill.title", desc: "docs.mcpSkill.desc", path: blob("docs/mcp-skill-usage.md") },
      { title: "docs.sdkModule.title", desc: "docs.sdkModule.desc", path: blob("docs/sdk-module-development.md") },
    ] },
    { heading: "docs.sectionReference", entries: [
      { title: "docs.admin.title", desc: "docs.admin.desc", path: blob("docs/admin-governance.md") },
      { title: "docs.troubleshooting.title", desc: "docs.troubleshooting.desc", path: blob("docs/troubleshooting.md") },
      { title: "docs.releaseNotes.title", desc: "docs.releaseNotes.desc", path: blob("docs/release-notes.md") },
    ] },
  ];

  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{t("docs.eyebrow")}</p>
        <h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">{t("docs.title")}</h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-neutral-600">{t("docs.subtitle")}</p>
      </section>

      {sections.map((section, index) => (
        <section key={section.heading} className={`border-t border-black/10 px-6 py-16 sm:py-20 ${index % 2 === 0 ? "bg-white" : "bg-[#fbf8f1]"}`}>
          <div className="mx-auto max-w-7xl lg:px-10">
            <h2 className="font-serif text-3xl tracking-[-.03em] text-neutral-950">{t(section.heading)}</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {section.entries.map((entry) => (
                <Link key={entry.path} href={entry.path} target="_blank" rel="noopener noreferrer" className="group flex flex-col rounded-2xl border border-black/10 bg-white p-6 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-[0_18px_44px_rgba(50,35,20,.06)]">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-neutral-950">{t(entry.title)}</h3>
                    <ArrowUpRight size={18} className="shrink-0 text-neutral-400 transition group-hover:text-orange-600" />
                  </div>
                  <p className="mt-3 text-sm leading-7 text-neutral-600">{t(entry.desc)}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ))}
      <MarketingFooter />
    </main>
  );
}
