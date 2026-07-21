"use client";

import Link from "next/link";
import { LocaleLink } from "@/components/LocaleLink";
import { ArrowRight, ArrowUpRight, Boxes, PhoneCall, Sparkles } from "lucide-react";
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
  const { t, locale } = useI18n();
  const zh = locale === "zh";
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
  const exploratory: Pack[] = [{ id: "ai-visibility-pack", name: "packs.aiVisibility.name", category: "packs.aiVisibility.category", description: "packs.aiVisibility.description", modules: "packs.aiVisibility.modules" }];

  const renderPack = (pack: Pack) => (
    <article key={pack.id} className="flex flex-col rounded-2xl border border-black/10 bg-white p-6 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-[0_18px_44px_rgba(50,35,20,.06)]">
      <div className="flex items-start justify-between gap-3"><Boxes size={22} className="text-orange-600" />{pack.recommended && <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700"><Sparkles size={13} /> {t("packs.recommended")}</span>}</div>
      <h3 className="mt-5 text-lg font-semibold">{t(pack.name)}</h3>
      <div className="mt-2"><span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">{t("packs.categoryLabel")}: {t(pack.category)}</span></div>
      <p className="mt-3 text-sm leading-7 text-neutral-600">{t(pack.description)}</p>
      <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-[.16em] text-neutral-400">{t("packs.includesLabel")}</p><p className="mt-1.5 text-sm font-medium text-neutral-700">{t(pack.modules)}</p></div>
      <div className="mt-6 flex-1" />
      <Link href={`${gh}/tree/main/catalog/packs/${pack.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600">{t("packs.viewCatalog")} <ArrowUpRight size={15} /></Link>
    </article>
  );

  const sections = [
    { title: t("packs.sectionAvailableNow"), desc: t("packs.sectionAvailableNowDesc"), packs: availableNow },
    { title: t("packs.sectionAvailable"), desc: t("packs.sectionAvailableDesc"), packs: available },
    { title: t("packs.sectionExploratory"), desc: t("packs.sectionExploratoryDesc"), packs: exploratory },
  ];

  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{t("packs.eyebrow")}</p>
        <h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">{t("packs.title")}</h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-neutral-600">{t("packs.subtitle")}</p>
      </section>

      <section className="border-y border-black/10 bg-neutral-950 py-16 text-white sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-[.82fr_1.18fr] lg:items-center lg:px-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300"><span className="size-2 rounded-full bg-emerald-400" />{zh ? "已在生产环境打通" : "Live production integration"}</div>
            <p className="mt-6 text-sm font-semibold uppercase tracking-[.18em] text-orange-300">{zh ? "新增 Pack" : "New Pack"}</p>
            <h2 className="mt-4 font-serif text-4xl leading-tight tracking-[-.035em] sm:text-5xl">Voice Intake POC Pack</h2>
            <p className="mt-5 max-w-xl leading-7 text-neutral-300">{zh ? "基于 Field Service Management Pack 叠加的可选 Retell 语音接单能力，将真实电话直接转化为客户、工单、预约与 Follow-up。" : "An optional Retell voice-intake slice layered on the Field Service Management Pack, turning real calls directly into customers, work orders, appointments, and follow-up."}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <LocaleLink href="/voice" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 font-semibold text-neutral-950">{zh ? "查看语音接单架构" : "Explore Voice Intake"}<ArrowRight size={18} /></LocaleLink>
              <Link href={`${gh}/tree/main/catalog/packs/voice-intake-poc-pack`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/15 px-6 font-semibold text-white">{zh ? "查看 Pack 定义" : "View Pack Definition"}<ArrowUpRight size={16} /></Link>
            </div>
          </div>

          <article className="rounded-[28px] border border-white/10 bg-white/5 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="grid size-12 place-items-center rounded-2xl bg-orange-400/10 text-orange-300"><PhoneCall size={24} /></div>
              <span className="rounded-full bg-orange-400/10 px-3 py-1.5 text-xs font-semibold text-orange-200">field_service</span>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/10 p-5"><p className="text-xs font-semibold uppercase tracking-[.16em] text-neutral-500">{zh ? "版本" : "Version"}</p><p className="mt-2 text-xl font-semibold">v0.1.0</p></div>
              <div className="rounded-2xl border border-white/10 bg-black/10 p-5"><p className="text-xs font-semibold uppercase tracking-[.16em] text-neutral-500">{zh ? "依赖" : "Layered on"}</p><p className="mt-2 text-xl font-semibold">FSM Pack</p></div>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-5"><p className="text-xs font-semibold uppercase tracking-[.16em] text-neutral-500">{zh ? "生产链路" : "Production path"}</p><p className="mt-3 text-sm leading-7 text-neutral-300">Twilio → Retell AI → Runory → Work Order / Appointment / Follow-up</p></div>
          </article>
        </div>
      </section>

      {sections.map((section, index) => <section key={section.title} className={`border-t border-black/10 px-6 py-16 sm:py-20 ${index % 2 === 0 ? "bg-white" : "bg-[#fbf8f1]"}`}><div className="mx-auto max-w-7xl lg:px-10"><div className="max-w-3xl"><h2 className="font-serif text-3xl tracking-[-.03em] sm:text-4xl">{section.title}</h2><p className="mt-3 text-sm leading-7 text-neutral-600">{section.desc}</p></div><div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{section.packs.map(renderPack)}</div></div></section>)}

      <section className="border-t border-black/10 bg-white px-6 py-16 sm:py-20"><div className="mx-auto max-w-7xl lg:px-10"><div className="max-w-3xl"><h2 className="font-serif text-3xl tracking-[-.03em] sm:text-4xl">{t("packs.sectionRoadmap")}</h2><p className="mt-3 text-sm leading-7 text-neutral-600">{t("packs.sectionRoadmapDesc")}</p></div><div className="mt-10 rounded-2xl border border-dashed border-black/20 bg-[#fbf8f1] p-8 text-center"><Boxes size={22} className="mx-auto text-orange-600" /><p className="mt-4 text-sm leading-7 text-neutral-500">{t("packs.sectionRoadmapDesc")}</p></div></div></section>
      <MarketingFooter />
    </main>
  );
}
