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
    {
      heading: "docs.sectionGettingStarted",
      entries: [
        { title: "docs.gettingStarted.title", desc: "docs.gettingStarted.desc", path: blob("docs/getting-started.md") },
      ],
    },
    {
      heading: "docs.sectionConcepts",
      entries: [
        { title: "docs.concepts.title", desc: "docs.concepts.desc", path: blob("docs/concepts.md") },
        { title: "docs.architectureOverview.title", desc: "docs.architectureOverview.desc", path: blob("docs/architecture/overview.md") },
        { title: "docs.i18n.title", desc: "docs.i18n.desc", path: blob("docs/architecture/internationalization.md") },
        { title: "docs.moduleArchitecture.title", desc: "docs.moduleArchitecture.desc", path: blob("docs/architecture/module-architecture.md") },
      ],
    },
    {
      heading: "docs.sectionGuides",
      entries: [
        { title: "docs.workspaceGuide.title", desc: "docs.workspaceGuide.desc", path: blob("docs/workspace-guide.md") },
        { title: "docs.packsModules.title", desc: "docs.packsModules.desc", path: blob("docs/packs-and-modules.md") },
        { title: "docs.agentOperations.title", desc: "docs.agentOperations.desc", path: blob("docs/agent-operations.md") },
        { title: "docs.mcpSkill.title", desc: "docs.mcpSkill.desc", path: blob("docs/mcp-skill-usage.md") },
        { title: "docs.sdkModule.title", desc: "docs.sdkModule.desc", path: blob("docs/sdk-module-development.md") },
      ],
    },
    {
      heading: "docs.sectionReference",
      entries: [
        { title: "docs.admin.title", desc: "docs.admin.desc", path: blob("docs/admin-governance.md") },
        { title: "docs.troubleshooting.title", desc: "docs.troubleshooting.desc", path: blob("docs/troubleshooting.md") },
        { title: "docs.releaseNotes.title", desc: "docs.releaseNotes.desc", path: blob("docs/release-notes.md") },
      ],
    },
  ];

  return (
    <main className="min-h-screen bg-[#f7f8fc]">
      <MarketingHeader />
      <section className="relative overflow-hidden px-6 pb-16 pt-20 text-center sm:pb-20 sm:pt-28">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(86,100,245,.13),transparent_40%)]" />
        <div className="relative mx-auto max-w-3xl">
          <p className="app-eyebrow">{t("docs.eyebrow")}</p>
          <h1 className="mt-5 text-4xl font-bold tracking-[-.045em] text-slate-950 sm:text-6xl">{t("docs.title")}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600">{t("docs.subtitle")}</p>
        </div>
      </section>

      {sections.map((section) => (
        <section key={section.heading} className="border-t border-slate-200 bg-white px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl lg:px-10">
            <h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{t(section.heading)}</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {section.entries.map((entry) => (
                <Link
                  key={entry.path}
                  href={entry.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-indigo-200 hover:shadow-[0_18px_44px_rgba(30,38,61,.045)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-bold text-slate-950">{t(entry.title)}</h3>
                    <ArrowUpRight size={18} className="shrink-0 text-slate-400 transition group-hover:text-indigo-600" />
                  </div>
                  <p className="mt-2.5 text-sm leading-7 text-slate-600">{t(entry.desc)}</p>
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
