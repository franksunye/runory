"use client";

import { CheckCircle2, Mail } from "lucide-react";
import Link from "next/link";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { useI18n } from "@/i18n/locale-provider";
import { marketingCopy } from "@/i18n/marketing-copy";

export default function PilotPage() {
  const { locale } = useI18n();
  const c = marketingCopy[locale].pilot;
  const emailHref = "mailto:support@visutry.com";
  return <main className="min-h-screen bg-[#fbf8f1] text-neutral-950"><MarketingHeader /><section className="mx-auto grid max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[.86fr_1.14fr] lg:px-10 lg:py-24"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{c.eyebrow}</p><h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">{c.title}</h1><p className="mt-7 max-w-2xl text-lg leading-8 text-neutral-600">{c.subtitle}</p><div className="mt-10 space-y-4">{c.bullets.map((item) => <div key={item} className="flex items-center gap-3 text-sm font-medium text-neutral-700"><CheckCircle2 size={18} className="text-orange-600" />{item}</div>)}</div></div><div className="rounded-[28px] border border-black/10 bg-white p-8 shadow-[0_24px_70px_rgba(50,35,20,.08)] sm:p-10"><Mail className="text-orange-600" size={30} /><h2 className="mt-5 font-serif text-3xl tracking-[-.03em]">support@visutry.com</h2><p className="mt-3 max-w-lg leading-7 text-neutral-600">{c.subtitle}</p><Link href={emailHref} className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-neutral-950 px-7 font-semibold text-white">{c.email} <Mail size={18} /></Link></div></section><section className="border-y border-black/10 bg-white py-16 sm:py-20"><div className="mx-auto grid max-w-7xl gap-5 px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-10">{c.cards.map(([title, body], index) => <article key={title} className="rounded-2xl border border-black/10 bg-[#fbf8f1] p-6"><span className="text-xs font-semibold text-orange-600">0{index + 1}</span><h2 className="mt-8 text-lg font-semibold">{title}</h2><p className="mt-3 text-sm leading-6 text-neutral-600">{body}</p></article>)}</div></section><section className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-2 lg:px-10"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{c.candidatesEyebrow}</p><h2 className="mt-4 font-serif text-4xl tracking-[-.035em]">{c.candidatesTitle}</h2></div><div className="space-y-4">{c.candidates.map((item) => <div key={item} className="flex gap-3 border-b border-black/10 pb-4 text-neutral-700"><CheckCircle2 size={19} className="mt-0.5 shrink-0 text-orange-600" />{item}</div>)}</div></section><MarketingFooter /></main>;
}
