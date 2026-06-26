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
    <main className="min-h-screen bg-[#f7f8fc]">
      <MarketingHeader />
      <section className="relative overflow-hidden bg-slate-950 px-6 py-24 text-white sm:py-32 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(99,102,241,.32),transparent_35%),radial-gradient(circle_at_85%_90%,rgba(16,185,129,.15),transparent_30%)]" />
        <div className="relative mx-auto max-w-5xl">
          <p className="text-sm font-bold uppercase tracking-[.18em] text-indigo-300">{t("security.eyebrow")}</p>
          <h1 className="mt-6 max-w-4xl text-4xl font-bold tracking-[-.045em] sm:text-6xl">{t("security.title")}</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">{t("security.subtitle")}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/login" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-bold text-slate-950 hover:bg-indigo-50"><ShieldCheck size={18} /> {t("security.cta")} <ArrowRight size={16} /></Link>
            <Link href="https://github.com/franksunye/runory" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-700 px-5 text-sm font-bold text-white hover:bg-slate-900"><GitBranch size={18} /> {t("oss.viewGithub")}</Link>
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-6 lg:px-10">
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {sections.map((section) => (
              <article key={section.title} className="py-8">
                <h2 className="text-lg font-bold text-slate-950">{section.title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">{section.body}</p>
              </article>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link href="/pricing" className="app-button-secondary"><ScrollText size={17} /> {t("common.pricing")}</Link>
            <Link href="/open-source" className="app-button-secondary"><BookOpen size={17} /> {t("common.openSource")}</Link>
            <Link href="https://github.com/franksunye/runory" target="_blank" rel="noreferrer" className="app-button-secondary"><GitBranch size={17} /> GitHub</Link>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}
