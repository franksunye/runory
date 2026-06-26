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
    <main className="min-h-screen bg-[#f7f8fc]">
      <MarketingHeader />
      <section className="relative overflow-hidden px-6 pb-16 pt-20 text-center sm:pb-20 sm:pt-28">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(86,100,245,.13),transparent_40%)]" />
        <div className="relative mx-auto max-w-3xl">
          <p className="app-eyebrow">{t("pricing.eyebrow")}</p>
          <h1 className="mt-5 text-4xl font-bold tracking-[-.045em] text-slate-950 sm:text-6xl">{t("pricing.title")}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600">{t("pricing.subtitle")}</p>
        </div>
      </section>

      <section className="px-6 pb-24 lg:px-10">
        <article className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(30,38,61,.08)]">
          <div className="grid lg:grid-cols-[.72fr_1.28fr]">
            <div className="bg-slate-950 p-8 text-white sm:p-10">
              <div className="flex items-center gap-2 text-sm font-bold text-indigo-300"><Cloud size={18} /> CLOUD EARLY ACCESS</div>
              <div className="mt-8"><span className="text-5xl font-bold">¥0</span><span className="text-slate-400"> {t("pricing.month")}</span></div>
              <p className="mt-4 text-sm leading-6 text-slate-400">{t("pricing.audience")}</p>
              <Link href="/login" className="mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-slate-950 hover:bg-indigo-50">{t("common.startFree")} <ArrowRight size={16} /></Link>
              <p className="mt-3 text-center text-xs text-slate-500">{t("pricing.noCard")}</p>
            </div>
            <div className="p-8 sm:p-10">
              <h2 className="text-lg font-bold text-slate-950">{t("pricing.included")}</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {included.map((item) => <div key={item} className="flex items-start gap-2.5 text-sm text-slate-700"><Check size={17} className="mt-0.5 shrink-0 text-emerald-600" />{item}</div>)}
              </div>
              <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                {t("pricing.boundary")}
              </div>
            </div>
          </div>
        </article>

        <div className="mx-auto mt-6 flex max-w-4xl items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-900">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-bold">{t("pricing.noPaymentTitle")}</p>
            <p className="mt-1">{t("pricing.noPaymentBody")}</p>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-4xl px-6 lg:px-10">
          <p className="app-eyebrow">{t("freeBoundaries.title")}</p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">{t("freeBoundaries.title")}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">{t("freeBoundaries.subtitle")}</p>
          <div className="mt-8 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">{t("freeBoundaries.boundary")}</th>
                  <th className="px-4 py-2.5 font-semibold">{t("freeBoundaries.value")}</th>
                  <th className="px-4 py-2.5 font-semibold">{t("freeBoundaries.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {boundaries.map((row) => (
                  <tr key={row.label}>
                    <td className="px-4 py-2.5 font-medium text-slate-700">{row.label}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.value}</td>
                    <td className="px-4 py-2.5">
                      <span className={`app-badge ${row.enforced ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {row.enforced ? t("freeBoundaries.enforced") : t("freeBoundaries.notEnforced")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-400">{t("freeBoundaries.note")}</p>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-4xl px-6 lg:px-10">
          <div className="flex items-center gap-2 text-indigo-600"><CircleHelp size={19} /><span className="app-eyebrow">FAQ</span></div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">{t("pricing.faqTitle")}</h2>
          <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
            {faqs.map(([question, answer]) => <article key={question} className="py-6"><h3 className="font-bold text-slate-950">{question}</h3><p className="mt-2 text-sm leading-7 text-slate-600">{answer}</p></article>)}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link href="/login" className="app-button-primary">{t("pricing.start")} <ArrowRight size={16} /></Link>
            <Link href="https://github.com/franksunye/runory" target="_blank" rel="noreferrer" className="app-button-secondary"><GitBranch size={17} /> {t("pricing.source")}</Link>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}
