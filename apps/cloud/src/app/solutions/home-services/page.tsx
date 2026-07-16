"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export default function HomeServicesScenarioPage() {
  const flow = [
    ["Voice intake", "Capture customer intent, urgency, location, and service needs."],
    ["CRM & sales", "Convert conversations into opportunities, quotes, and follow-up tasks."],
    ["Scheduling", "Coordinate inspections, technicians, and appointments."],
    ["Field execution", "Track service delivery, history, and customer outcomes."],
  ];

  return <main className="min-h-screen bg-[#fbf8f1] text-neutral-950"><MarketingHeader />
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-24 lg:px-10">
      <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">HOME SERVICES</p>
      <h1 className="mt-5 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">From customer calls to completed service operations.</h1>
      <p className="mt-7 max-w-3xl text-lg leading-8 text-neutral-600">Runory connects voice intake, CRM, sales, and field service workflows into one operating loop for home service businesses.</p>
    </section>
    <section className="border-y border-black/10 bg-white py-16"><div className="mx-auto grid max-w-7xl gap-5 px-5 md:grid-cols-2 lg:px-10">{flow.map(([title,body],i)=><article className="rounded-2xl border border-black/10 bg-[#fbf8f1] p-7" key={title}><span className="text-orange-600">0{i+1}</span><h2 className="mt-5 text-xl font-semibold">{title}</h2><p className="mt-3 text-neutral-600">{body}</p></article>)}</div></section>
    <section className="mx-auto max-w-7xl px-5 py-16 lg:px-10"><div className="rounded-3xl bg-neutral-950 p-8 text-white sm:p-12"><h2 className="font-serif text-4xl">One operating context for your entire service business.</h2><p className="mt-4 max-w-2xl text-white/70">External Super Agents can configure and operate Runory workflows through MCP and Skills while teams maintain governance and control.</p></div></section>
    <section className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-16 sm:px-6 lg:px-10"><h2 className="font-serif text-4xl">Start with one workflow. Expand into an operating system.</h2><Link href="/pilot" className="inline-flex w-fit items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">Start a Pilot <ArrowRight size={18}/></Link></section>
    <MarketingFooter /></main>;
}
