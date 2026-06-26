"use client";

import Link from "next/link";
import { ArrowUpRight, Boxes, Sparkles } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { useI18n } from "@/i18n/locale-provider";
import type { MessageKey } from "@/i18n/messages";
import { SITE_CONFIG } from "@/lib/site";

interface Pack {
  id: string;
  name: MessageKey;
  category: MessageKey;
  description: MessageKey;
  modules: MessageKey;
  recommended?: boolean;
}

export default function PacksPage() {
  const { t } = useI18n();
  const gh = SITE_CONFIG.githubUrl;

  const availableNow: Pack[] = [
    { id: "crm-lite-pack", name: "packs.crmLite.name", category: "packs.crmLite.category", description: "packs.crmLite.description", modules: "packs.crmLite.modules", recommended: true },
    { id: "fsm-pack", name: "packs.fsm.name", category: "packs.fsm.category", description: "packs.fsm.description", modules: "packs.fsm.modules", recommended: true },
  ];
  const available: Pack[] = [
    { id: "after-sales-pack", name: "packs.afterSales.name", category: "packs.afterSales.category", description: "packs.afterSales.description", modules: "packs.afterSales.modules" },
    { id: "customer-service-pack", name: "packs.customerService.name", category: "packs.customerService.category", description: "packs.customerService.description", modules: "packs.customerService.modules" },
    { id: "marketing-capture-pack", name: "packs.marketingCapture.name", category: "packs.marketingCapture.category", description: "packs.marketingCapture.description", modules: "packs.marketingCapture.modules" },
    { id: "sales-quote-pack", name: "packs.salesQuote.name", category: "packs.salesQuote.category", description: "packs.salesQuote.description", modules: "packs.salesQuote.modules" },
  ];
  const exploratory: Pack[] = [
    { id: "ai-visibility-pack", name: "packs.aiVisibility.name", category: "packs.aiVisibility.category", description: "packs.aiVisibility.description", modules: "packs.aiVisibility.modules" },
  ];

  const renderPack = (pack: Pack) => (
    <article key={pack.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_44px_rgba(30,38,61,.045)]">
      <div className="flex items-start justify-between gap-3">
        <div className="grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
          <Boxes size={21} />
        </div>
        {pack.recommended && (
          <span className="app-badge bg-indigo-50 text-indigo-700">
            <Sparkles size={13} /> {t("packs.recommended")}
          </span>
        )}
      </div>
      <h3 className="mt-5 text-lg font-bold text-slate-950">{t(pack.name)}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className="app-badge bg-slate-100 text-slate-700">{t("packs.categoryLabel")}: {t(pack.category)}</span>
      </div>
      <p className="mt-3 text-sm leading-7 text-slate-600">{t(pack.description)}</p>
      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">{t("packs.includesLabel")}</p>
        <p className="mt-1.5 text-sm font-medium text-slate-700">{t(pack.modules)}</p>
      </div>
      <div className="mt-6 flex-1" />
      <Link
        href={`${gh}/tree/main/catalog/packs/${pack.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-700 hover:text-indigo-900"
      >
        {t("packs.viewCatalog")} <ArrowUpRight size={15} />
      </Link>
    </article>
  );

  const sections: { title: string; desc: string; packs: Pack[] }[] = [
    { title: t("packs.sectionAvailableNow"), desc: t("packs.sectionAvailableNowDesc"), packs: availableNow },
    { title: t("packs.sectionAvailable"), desc: t("packs.sectionAvailableDesc"), packs: available },
    { title: t("packs.sectionExploratory"), desc: t("packs.sectionExploratoryDesc"), packs: exploratory },
  ];

  return (
    <main className="min-h-screen bg-[#f7f8fc]">
      <MarketingHeader />
      <section className="relative overflow-hidden px-6 pb-16 pt-20 text-center sm:pb-20 sm:pt-28">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(86,100,245,.13),transparent_40%)]" />
        <div className="relative mx-auto max-w-3xl">
          <p className="app-eyebrow">{t("packs.eyebrow")}</p>
          <h1 className="mt-5 text-4xl font-bold tracking-[-.045em] text-slate-950 sm:text-6xl">{t("packs.title")}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600">{t("packs.subtitle")}</p>
        </div>
      </section>

      {sections.map((section) => (
        <section key={section.title} className="border-t border-slate-200 bg-white px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl lg:px-10">
            <div className="max-w-3xl">
              <h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">{section.desc}</p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {section.packs.map(renderPack)}
            </div>
          </div>
        </section>
      ))}

      <section className="border-t border-slate-200 bg-white px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl lg:px-10">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{t("packs.sectionRoadmap")}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">{t("packs.sectionRoadmapDesc")}</p>
          </div>
          <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <div className="mx-auto grid size-11 place-items-center rounded-xl bg-white text-slate-400 shadow-sm">
              <Boxes size={21} />
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-500">{t("packs.sectionRoadmapDesc")}</p>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
