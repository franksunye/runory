import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "HVAC Service Software | Voice Intake, CRM and FSM | Runory",
  description: "Runory connects HVAC calls, equipment records, maintenance plans, quoting, dispatch, field work, and service history in one operating system.",
  alternates: { canonical: "https://runory.vercel.app/solutions/hvac" },
};

export default function HvacPage() {
  const flow = [
    ["Capture the request", "Calls, messages, and web requests capture urgency, equipment, symptoms, location, and customer intent."],
    ["Qualify and plan", "CRM and sales workflows manage service agreements, quotes, approvals, and maintenance opportunities."],
    ["Schedule and dispatch", "Coordinate technician skills, territory, availability, parts readiness, and customer windows."],
    ["Complete and retain", "Field findings, work performed, equipment history, payment, and the next maintenance action stay linked."],
  ];
  const reasons = [
    ["Equipment-aware context", "Customer, site, asset, warranty, visit, and maintenance history remain available throughout the workflow."],
    ["Reactive and recurring work", "Urgent service calls and planned maintenance use the same operating model without duplicate systems."],
    ["Governed Agent operation", "External Agents can create, schedule, update, and follow up through controlled Runory commands."],
  ];
  const roles = ["Customer service", "Comfort advisor", "Dispatcher", "HVAC technician", "Service manager", "Maintenance coordinator"];

  return <main className="min-h-screen bg-[#fbf8f1] text-neutral-950"><MarketingHeader />
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-24 lg:px-10"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">HVAC Operations</p><h1 className="mt-5 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">Turn HVAC demand into a connected service and maintenance operation.</h1><p className="mt-7 max-w-3xl text-lg leading-8 text-neutral-600">Runory connects voice intake, CRM, sales, equipment context, scheduling, field execution, and recurring maintenance in one governed runtime.</p></section>
    <section className="border-y border-black/10 bg-white py-16 sm:py-20"><div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Operating loop</p><div className="mt-8 grid gap-5 md:grid-cols-2">{flow.map(([title, body], i) => <article key={title} className="rounded-2xl border border-black/10 bg-[#fbf8f1] p-7"><span className="text-sm font-semibold text-orange-600">0{i + 1}</span><h2 className="mt-5 text-xl font-semibold">{title}</h2><p className="mt-3 leading-7 text-neutral-600">{body}</p></article>)}</div></div></section>
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-20 lg:px-10"><div className="grid gap-6 lg:grid-cols-3">{reasons.map(([title, body]) => <article key={title} className="rounded-2xl border border-black/10 bg-white p-7"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-3 leading-7 text-neutral-600">{body}</p></article>)}</div></section>
    <section className="bg-neutral-950 py-16 text-white sm:py-20"><div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-2 lg:px-10"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-300">Typical roles</p><h2 className="mt-4 font-serif text-4xl">One operating context from front desk to field technician.</h2></div><div className="grid grid-cols-2 gap-3">{roles.map((role) => <div key={role} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-200">{role}</div>)}</div></div></section>
    <section className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-16 sm:px-6 sm:py-20 md:flex-row md:items-center lg:px-10"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Focused pilot</p><h2 className="mt-4 font-serif text-4xl tracking-[-.035em]">Start with reactive service intake or recurring maintenance.</h2><p className="mt-3 max-w-2xl text-neutral-600">Launch one measurable HVAC workflow, connect the essential records, and validate response time, scheduling visibility, and completion discipline.</p></div><Link href="/pilot" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">Plan a Pilot <ArrowRight size={18} /></Link></section>
    <MarketingFooter /></main>;
}
