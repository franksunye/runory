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
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{t("oss.eyebrow")}</p>
        <h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">{t("oss.title")}</h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-neutral-600">{t("oss.subtitle")}</p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="https://github.com/franksunye/runory" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white"><GitBranch size={18} /> {t("oss.viewGithub")}</Link>
          <Link href="https://github.com/franksunye/runory/tree/main/docs" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-6 py-3 font-semibold text-neutral-900"><BookOpen size={18} /> {t("oss.readArchitecture")}</Link>
        </div>
      </section>

      <section className="border-y border-black/10 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{t("oss.what")}</p><h2 className="mt-4 font-serif text-4xl tracking-[-.035em] sm:text-5xl">{t("oss.whatTitle")}</h2></div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {layers.map(([Icon, title, description]) => <article key={title as string} className="rounded-2xl border border-black/10 bg-[#fbf8f1] p-7"><Icon size={22} className="text-orange-600" /><h3 className="mt-6 text-lg font-semibold">{title as string}</h3><p className="mt-3 text-sm leading-7 text-neutral-600">{description as string}</p></article>)}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-2 lg:px-10">
          <div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{t("oss.model")}</p><h2 className="mt-4 font-serif text-4xl tracking-[-.035em]">{t("oss.modelTitle")}</h2><p className="mt-5 leading-7 text-neutral-600">{t("oss.modelBody")}</p><Link href="/pricing" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-orange-600">{t("common.pricing")} <ArrowRight size={16} /></Link></div>
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-7"><div className="flex items-center gap-2 font-semibold text-neutral-950"><Scale size={19} className="text-orange-600" /> {t("oss.license")}</div><p className="mt-4 text-sm leading-7 text-neutral-700">{t("oss.licenseBody")}</p><p className="mt-3 text-sm leading-7 text-neutral-700">{t("oss.licenseNext")}</p></div>
        </div>
      </section>

      <section className="bg-neutral-950 py-20 text-white sm:py-24"><div className="mx-auto max-w-3xl px-6 text-center"><GitBranch size={30} className="mx-auto text-orange-300" /><h2 className="mt-5 font-serif text-4xl tracking-[-.035em]">{t("oss.finalTitle")}</h2><p className="mt-4 leading-7 text-neutral-400">{t("oss.finalBody")}</p><Link href="https://github.com/franksunye/runory" target="_blank" rel="noreferrer" className="mt-8 inline-flex items-center gap-2 rounded-full bg-orange-600 px-6 py-3 font-semibold text-white">{t("oss.openGithub")} <ArrowRight size={16} /></Link></div></section>
      <MarketingFooter />
    </main>
  );
}
