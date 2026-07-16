import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "Home Services Software | Voice, CRM, Sales and FSM | Runory",
  description: "Runory connects customer intake, CRM, sales, scheduling, field execution, payments, and follow-up for home service businesses.",
  alternates: { canonical: "https://runory.vercel.app/solutions/home-services" },
};

export default function HomeServicesScenarioPage() {
  const flow = [
    ["Capture demand", "Phone, SMS, web, and manual requests become structured customer and service records."],
    ["Qualify and sell", "Teams manage opportunities, inspections, quotes, approvals, and follow-up in one context."],
    ["Schedule and dispatch", "Match work with technicians, availability, territory, skills, and customer preferences."],
    ["Execute in the field", "Mobile tasks, forms, evidence, status, completion, payment, and service history stay connected."],
  ];
  const reasons = [
    ["One operating record", "Customer, property, opportunity, visit, work order, payment, and follow-up share the same history."],
    ["Agent-native operation", "External Super Agents can configure and operate workflows through MCP, Skills, or SDK."],
    ["Governed execution", "Permissions, validation, confirmations, audit, idempotency, and human handoff protect critical actions."],
  ];
  const roles = ["Intake team", "Sales or service advisor", "Dispatcher", "Technician", "Operations manager", "Finance and support"];

  return <main className="min-h-screen bg-[#fbf8f1] text-neutral-950"><MarketingHeader />
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-24 lg:px-10">
      <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Home Services</p>
      <h1 className="mt-5 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">From the first customer request to completed service and follow-up.</h1>
      <p className="mt-7 max-w-3xl text-lg leading-8 text-neutral-600">Runory unifies omnichannel intake, CRM, sales, scheduling, field service, payment, and retention in one governed operating system.</p>
    </section>
    <section className="border-y border-black/10 bg-white py-16 sm:py-20"><div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Operating loop</p><div className="mt-8 grid gap-5 md:grid-cols-2">{flow.map(([title, body], i) => <article className="rounded-2xl border border-black/10 bg-[#fbf8f1] p-7" key={title}><span className="text-sm font-semibold text-orange-600">0{i + 1}</span><h2 className="mt-5 text-xl font-semibold">{title}</h2><p className="mt-3 leading-7 text-neutral-600">{body}</p></article>)}</div></div></section>
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-20 lg:px-10"><div className="grid gap-6 lg:grid-cols-3">{reasons.map(([title, body]) => <article key={title} className="rounded-2xl border border-black/10 bg-white p-7"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-3 leading-7 text-neutral-600">{body}</p></article>)}</div></section>
    <section className="bg-neutral-950 py-16 text-white sm:py-20"><div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-2 lg:px-10"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-300">Typical roles</p><h2 className="mt-4 font-serif text-4xl">One workflow across office and field teams.</h2></div><div className="grid grid-cols-2 gap-3">{roles.map((role) => <div key={role} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-200">{role}</div>)}</div></div></section>
    <section className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-16 sm:px-6 sm:py-20 md:flex-row md:items-center lg:px-10"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Focused pilot</p><h2 className="mt-4 font-serif text-4xl tracking-[-.035em]">Start with intake-to-dispatch or quote-to-completion.</h2><p className="mt-3 max-w-2xl text-neutral-600">Define one measurable workflow, one operating team, and the minimum integrations required to prove value.</p></div><Link href="/pilot" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">Plan a Pilot <ArrowRight size={18} /></Link></section>
    <MarketingFooter /></main>;
}
