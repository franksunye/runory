"use client";

import Link from "next/link";
import { ArrowRight, Check, CircleHelp, Cloud, GitBranch, ShieldCheck } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { useI18n } from "@/i18n/locale-provider";

export default function PricingPage() {
  const { t } = useI18n();
  const included = [t("home.free.email"), t("home.free.org"), t("home.free.crm"), t("home.free.install"), "Workspace Extension", t("home.free.audit"), "Catalog & Release Control Plane", t("home.free.upgrades")];
  const faqs = [[t("pricing.q1"), t("pricing.a1")], [t("pricing.q2"), t("pricing.a2")], [t("pricing.q3"), t("pricing.a3")], [t("pricing.q4"), t("pricing.a4")]];
  const boundaries = [
    { label: t("freeBoundaries.workspaceLimit"), value: t("freeBoundaries.workspaceValue"), enforced: true },
    { label: t("freeBoundaries.memberLimit"), value: t("freeBoundaries.memberValue"), enforced: false },
    { label: t("freeBoundaries.packAvailability"), value: t("freeBoundaries.packValue"), enforced: true },
    { label: t("freeBoundaries.operationLimit"), value: t("freeBoundaries.operationValue"), enforced: false },
    { label: t("freeBoundaries.apiAccess"), value: t("freeBoundaries.apiValue"), enforced: true },
    { label: t("freeBoundaries.storage"), value: t("freeBoundaries.storageValue"), enforced: false },
    { label: t("freeBoundaries.support"), value: t("freeBoundaries.supportValue"), enforced: false },
  ];

  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{t("pricing.eyebrow")}</p>
        <h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">{t("pricing.title")}</h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-neutral-600">{t("pricing.subtitle")}</p>
      </section>

      <section className="px-6 pb-24 lg:px-10">
        <article className="mx-auto max-w-4xl overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_30px_90px_rgba(50,35,20,.08)]">
          <div className="grid lg:grid-cols-[.72fr_1.28fr]">
            <div className="bg-neutral-950 p-8 text-white sm:p-10">
              <div className="flex items-center gap-2 text-sm font-semibold text-orange-300"><Cloud size={18} /> CLOUD EARLY ACCESS</div>
              <div className="mt-8"><span className="font-serif text-6xl">¥0</span><span className="text-neutral-400"> {t("pricing.month")}</span></div>
              <p className="mt-4 text-sm leading-6 text-neutral-400">{t("pricing.audience")}</p>
              <Link href="/login" className="mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-orange-600 px-5 text-sm font-semibold text-white">{t("common.startFree")} <ArrowRight size={16} /></Link>
              <p className="mt-3 text-center text-xs text-neutral-500">{t("pricing.noCard")}</p>
            </div>
            <div className="p-8 sm:p-10">
              <h2 className="text-lg font-semibold">{t("pricing.included")}</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">{included.map((item) => <div key={item} className="flex items-start gap-2.5 text-sm text-neutral-700"><Check size={17} className="mt-0.5 shrink-0 text-orange-600" />{item}</div>)}</div>
              <div className="mt-8 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm leading-6 text-neutral-700">{t("pricing.boundary")}</div>
            </div>
          </div>
        </article>
        <div className="mx-auto mt-6 flex max-w-4xl items-start gap-3 rounded-2xl border border-black/10 bg-white p-5 text-sm leading-6 text-neutral-700"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-orange-600" /><div><p className="font-semibold text-neutral-950">{t("pricing.noPaymentTitle")}</p><p className="mt-1">{t("pricing.noPaymentBody")}</p></div></div>
      </section>

      <section className="border-y border-black/10 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-4xl px-6 lg:px-10">
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{t("freeBoundaries.title")}</p>
          <h2 className="mt-4 font-serif text-4xl tracking-[-.035em]">{t("freeBoundaries.title")}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-600">{t("freeBoundaries.subtitle")}</p>
          <div className="mt-8 overflow-hidden rounded-2xl border border-black/10"><table className="w-full text-sm"><thead><tr className="border-b border-black/10 bg-[#fbf8f1] text-left text-xs text-neutral-500"><th className="px-4 py-3 font-semibold">{t("freeBoundaries.boundary")}</th><th className="px-4 py-3 font-semibold">{t("freeBoundaries.value")}</th><th className="px-4 py-3 font-semibold">{t("freeBoundaries.status")}</th></tr></thead><tbody className="divide-y divide-black/5">{boundaries.map((row) => <tr key={row.label}><td className="px-4 py-3 font-medium text-neutral-800">{row.label}</td><td className="px-4 py-3 text-neutral-600">{row.value}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.enforced ? "bg-orange-50 text-orange-700" : "bg-neutral-100 text-neutral-600"}`}>{row.enforced ? t("freeBoundaries.enforced") : t("freeBoundaries.notEnforced")}</span></td></tr>)}</tbody></table></div>
          <p className="mt-3 text-xs text-neutral-400">{t("freeBoundaries.note")}</p>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-4xl px-6 lg:px-10">
          <div className="flex items-center gap-2 text-orange-600"><CircleHelp size={19} /><span className="text-sm font-semibold uppercase tracking-[.18em]">FAQ</span></div>
          <h2 className="mt-4 font-serif text-4xl tracking-[-.035em]">{t("pricing.faqTitle")}</h2>
          <div className="mt-10 divide-y divide-black/10 border-y border-black/10">{faqs.map(([question, answer]) => <article key={question} className="py-6"><h3 className="font-semibold">{question}</h3><p className="mt-2 text-sm leading-7 text-neutral-600">{answer}</p></article>)}</div>
          <div className="mt-10 flex flex-wrap items-center gap-4"><Link href="/login" className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">{t("pricing.start")} <ArrowRight size={16} /></Link><Link href="https://github.com/franksunye/runory" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-6 py-3 font-semibold"><GitBranch size={17} /> {t("pricing.source")}</Link></div>
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}
