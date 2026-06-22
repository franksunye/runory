"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Boxes, Code2, GitBranch, GitFork, Scale } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { useI18n } from "@/i18n/locale-provider";

export default function OpenSourcePage() {
  const { t } = useI18n();
  const layers = [[Code2, "Portable Runtime", t("oss.runtime")], [Boxes, "Module / Pack / Template", t("oss.capabilities")], [GitFork, "SDK & Tooling", t("oss.sdk")]];
  return (
    <main className="min-h-screen bg-[#f7f8fc]">
      <MarketingHeader />
      <section className="relative overflow-hidden bg-slate-950 px-6 py-24 text-white sm:py-32 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(99,102,241,.35),transparent_35%),radial-gradient(circle_at_85%_90%,rgba(16,185,129,.15),transparent_30%)]" />
        <div className="relative mx-auto max-w-5xl">
          <p className="text-sm font-bold uppercase tracking-[.18em] text-indigo-300">{t("oss.eyebrow")}</p>
          <h1 className="mt-6 max-w-4xl text-4xl font-bold tracking-[-.045em] sm:text-7xl">{t("oss.title")}</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">{t("oss.subtitle")}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="https://github.com/franksunye/runory" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-bold text-slate-950 hover:bg-indigo-50"><GitBranch size={18} /> {t("oss.viewGithub")}</Link>
            <Link href="https://github.com/franksunye/runory/tree/main/docs" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-700 px-5 text-sm font-bold text-white hover:bg-slate-900"><BookOpen size={18} /> {t("oss.readArchitecture")}</Link>
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="max-w-3xl"><p className="app-eyebrow">{t("oss.what")}</p><h2 className="mt-4 text-3xl font-bold tracking-[-.035em] text-slate-950 sm:text-5xl">{t("oss.whatTitle")}</h2></div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {layers.map(([Icon, title, description]) => <article key={title as string} className="rounded-2xl border border-slate-200 bg-white p-7"><div className="grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Icon size={21} /></div><h3 className="mt-6 text-lg font-bold text-slate-950">{title as string}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{description as string}</p></article>)}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-2 lg:px-10">
          <div><p className="app-eyebrow">{t("oss.model")}</p><h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">{t("oss.modelTitle")}</h2><p className="mt-5 leading-7 text-slate-600">{t("oss.modelBody")}</p><Link href="/pricing" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-indigo-700">{t("common.pricing")} <ArrowRight size={16} /></Link></div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-7">
            <div className="flex items-center gap-2 font-bold text-amber-950"><Scale size={19} /> {t("oss.license")}</div>
            <p className="mt-4 text-sm leading-7 text-amber-900">{t("oss.licenseBody")}</p>
            <p className="mt-3 text-sm leading-7 text-amber-900">{t("oss.licenseNext")}</p>
          </div>
        </div>
      </section>

      <section className="py-20 text-center sm:py-24">
        <div className="mx-auto max-w-3xl px-6"><GitBranch size={30} className="mx-auto text-slate-900" /><h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-950">{t("oss.finalTitle")}</h2><p className="mt-4 leading-7 text-slate-600">{t("oss.finalBody")}</p><Link href="https://github.com/franksunye/runory" target="_blank" rel="noreferrer" className="app-button-primary mt-8">{t("oss.openGithub")} <ArrowRight size={16} /></Link></div>
      </section>
      <MarketingFooter />
    </main>
  );
}
