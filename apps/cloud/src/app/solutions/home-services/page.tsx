"use client";

import Link from "next/link";
import { ArrowRight, Phone, ClipboardList, CalendarDays, Wrench } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export default function HomeServicesScenarioPage() {
  const steps = [
    ["Customer calls", "Voice intake captures intent, details, and urgency."],
    ["Lead created", "Customer information becomes an actionable business record."],
    ["Quote and schedule", "Teams manage inspection, pricing, and appointments."],
    ["Service completed", "Field operations continue through the same workflow."],
  ];

  return <main className="min-h-screen bg-[#fbf8f1] text-neutral-950"><MarketingHeader />
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-24 lg:px-10">
      <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Home Services</p>
      <h1 className="mt-5 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">From customer calls to completed service operations.</h1>
      <p className="mt-7 max-w-2xl text-lg leading-8 text-neutral-600">Runory connects voice intake, CRM, sales, and field service workflows into one operating loop for home service businesses.</p>
    </section>
    <section className="border-y border-black/10 bg-white py-16"><div className="mx-auto grid max-w-7xl gap-5 px-5 sm:px-6 md:grid-cols-2 lg:px-10">{steps.map(([title,body],i)=>{const Icon=[Phone,ClipboardList,CalendarDays,Wrench][i];return <article className="rounded-2xl border border-black/10 bg-[#fbf8f1] p-7" key={title}><Icon size={22} className="text-orange-600"/><h2 className="mt-5 text-xl font-semibold">{title}</h2><p className="mt-3 text-neutral-600">{body}</p></article>})}</div></section>
    <section className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-16 sm:px-6 lg:px-10"><h2 className="font-serif text-4xl">Start with one workflow. Expand into an operating system.</h2><Link href="/pilot" className="inline-flex w-fit items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">Start a Pilot <ArrowRight size={18}/></Link></section>
    <MarketingFooter /></main>;
}
