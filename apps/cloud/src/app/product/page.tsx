"use client";

import Link from "next/link";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { useI18n } from "@/i18n/locale-provider";
import { marketingCopy } from "@/i18n/marketing-copy";

export default function ProductPage() {
  const { locale } = useI18n();
  const c = marketingCopy[locale].product;
  return <main className="min-h-screen bg-[#fbf8f1] text-neutral-950"><MarketingHeader /><section className="mx-auto max-w-6xl px-6 py-24 lg:px-10"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">{c.eyebrow}</p><h1 className="mt-6 max-w-4xl font-serif text-5xl tracking-[-0.05em] sm:text-7xl">{c.title}</h1><p className="mt-8 max-w-3xl text-lg leading-8 text-neutral-600">{c.subtitle}</p></section><section className="mx-auto grid max-w-6xl gap-5 px-6 pb-24 md:grid-cols-3 lg:px-10">{c.packs.map(([title, body]) => <article key={title} className="rounded-2xl border border-black/10 bg-white p-8"><h2 className="text-2xl font-semibold">{title}</h2><p className="mt-4 leading-7 text-neutral-600">{body}</p></article>)}</section><section className="mx-auto max-w-6xl px-6 pb-24 lg:px-10"><Link href="/pilot" className="inline-flex items-center rounded-full bg-neutral-950 px-6 py-3 text-sm font-semibold text-white">{c.cta}</Link></section><MarketingFooter /></main>;
}
