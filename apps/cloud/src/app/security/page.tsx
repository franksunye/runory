"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, GitBranch, ScrollText, ShieldCheck } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { useI18n } from "@/i18n/locale-provider";

export default function SecurityPage() {
  const { t } = useI18n();
  const sections = [
    { title: t("security.postureTitle"), body: t("security.postureBody") },
    { title: t("security.authTitle"), body: t("security.authBody") },
    { title: t("security.tenantTitle"), body: t("security.tenantBody") },
    { title: t("security.auditTitle"), body: t("security.auditBody") },
    { title: t("security.exportTitle"), body: t("security.exportBody") },
    { title: t("security.agentTitle"), body: t("security.agentBody") },
    { title: t("security.ossTitle"), body: t("security.ossBody") },
    { title: t("security.contactTitle"), body: t("security.contactBody") },
  ];

  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{t("security.eyebrow")}</p>
        <h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">{t("security.title")}</h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-neutral-600">{t("security.subtitle")}</p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/login" className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white"><ShieldCheck size={18} /> {t("security.cta")} <ArrowRight size={16} /></Link>
          <Link href="https://github.com/franksunye/runory" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-6 py-3 font-semibold"><GitBranch size={18} /> {t("oss.viewGithub")}</Link>
        </div>
      </section>

      <section className="border-y border-black/10 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-6 lg:px-10">
          <div className="grid gap-5 md:grid-cols-2">
            {sections.map((section, index) => (
              <article key={section.title} className="rounded-2xl border border-black/10 bg-[#fbf8f1] p-6">
                <span className="text-xs font-semibold text-orange-600">{String(index + 1).padStart(2, "0")}</span>
                <h2 className="mt-6 text-lg font-semibold">{section.title}</h2>
                <p className="mt-3 text-sm leading-7 text-neutral-600">{section.body}</p>
              </article>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link href="/pricing" className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-5 py-2.5 text-sm font-semibold"><ScrollText size={17} /> {t("common.pricing")}</Link>
            <Link href="/open-source" className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-5 py-2.5 text-sm font-semibold"><BookOpen size={17} /> {t("common.openSource")}</Link>
            <Link href="https://github.com/franksunye/runory" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-5 py-2.5 text-sm font-semibold"><GitBranch size={17} /> GitHub</Link>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}
