"use client";

import Link from "next/link";
import { ArrowRight, MessageSquareText, PhoneCall, ShieldCheck, Workflow } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { useI18n } from "@/i18n/locale-provider";
import { marketingCopy } from "@/i18n/marketing-copy";

export default function VoicePage() {
  const { locale } = useI18n();
  const c = marketingCopy[locale].voice;
  const icons = [PhoneCall, MessageSquareText, Workflow, ShieldCheck];
  return <main className="min-h-screen bg-[#fbf8f1] text-neutral-950"><MarketingHeader /><section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{c.eyebrow}</p><h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">{c.title}</h1><p className="mt-8 max-w-2xl text-lg leading-8 text-neutral-600">{c.subtitle}</p><div className="mt-10 flex gap-3"><Link href="/pilot" className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">{c.cta} <ArrowRight size={18} /></Link></div></section><section className="border-y border-black/10 bg-white py-20"><div className="mx-auto max-w-7xl px-6 lg:px-10"><div className="grid gap-3 md:grid-cols-6">{c.steps.map((step, index) => <div key={step} className="rounded-2xl border border-black/10 bg-[#fbf8f1] p-5"><span className="text-xs font-semibold text-orange-600">0{index + 1}</span><p className="mt-7 font-semibold">{step}</p></div>)}</div></div></section><section className="py-24"><div className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-10">{c.cards.map(([title, body], i) => { const Icon = icons[i]; return <article key={title} className="rounded-2xl border border-black/10 bg-white p-6"><Icon size={22} className="text-orange-600" /><h2 className="mt-5 text-lg font-semibold">{title}</h2><p className="mt-3 text-sm leading-6 text-neutral-600">{body}</p></article>; })}</div></section><MarketingFooter /></main>;
}
