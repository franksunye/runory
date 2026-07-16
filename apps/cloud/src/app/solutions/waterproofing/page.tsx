import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "Waterproofing and Repair Software | CRM, Sales and FSM | Runory",
  description: "Runory connects intake, inspection, quoting, project execution, evidence, settlement, and after-sales for waterproofing and repair businesses.",
  alternates: { canonical: "https://runory.vercel.app/solutions/waterproofing" },
};

export default function WaterproofingSolutionPage() {
  const flow = [
    ["Lead and hotline intake", "Phone, web, channel, and manual requests become structured leads with customer, site, urgency, and source context."],
    ["Inspection and diagnosis", "Consultants schedule site visits, record findings, capture photos, and structure the proposed repair scope."],
    ["Quote and approval", "Manage pricing, negotiation, approvals, contracts, deposits, and the transition from sales to delivery."],
    ["Project execution", "Coordinate supervisors, craftsmen, milestones, evidence, changes, quality checks, and customer communication."],
    ["Settlement and after-sales", "Track completion, acceptance, settlement, warranties, callbacks, and repair decisions in the same history."],
  ];
  const reasons = [
    ["Sales and delivery stay connected", "Lead, inspection, quote, contract, project, payment, and after-sales remain part of one operating record."],
    ["Evidence-based execution", "Photos, inspection records, change evidence, acceptance, and warranty context remain attached to the work."],
    ["Governed Agent operation", "External Agents can assist with follow-up, scheduling, checks, and updates while permissions and audit remain enforced."],
  ];
  const roles = ["400 hotline", "Service provider", "Clerk", "Consultant", "Site supervisor", "Craftsmen", "Operations and finance", "After-sales"];

  return <main className="min-h-screen bg-[#fbf8f1] text-neutral-950"><MarketingHeader />
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-24 lg:px-10"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Waterproofing & Repair</p><h1 className="mt-5 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">Run the complete journey from customer request to completed repair and after-sales.</h1><p className="mt-7 max-w-3xl text-lg leading-8 text-neutral-600">Runory unifies lead intake, inspection, quoting, project execution, evidence, settlement, warranty, and after-sales in one governed operating system.</p></section>
    <section className="border-y border-black/10 bg-white py-16 sm:py-20"><div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Operating loop</p><div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{flow.map(([title, body], i) => <article key={title} className="rounded-2xl border border-black/10 bg-[#fbf8f1] p-7"><span className="text-sm font-semibold text-orange-600">0{i + 1}</span><h2 className="mt-5 text-xl font-semibold">{title}</h2><p className="mt-3 leading-7 text-neutral-600">{body}</p></article>)}</div></div></section>
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-20 lg:px-10"><div className="grid gap-6 lg:grid-cols-3">{reasons.map(([title, body]) => <article key={title} className="rounded-2xl border border-black/10 bg-white p-7"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-3 leading-7 text-neutral-600">{body}</p></article>)}</div></section>
    <section className="bg-neutral-950 py-16 text-white sm:py-20"><div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-2 lg:px-10"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-300">Typical roles</p><h2 className="mt-4 font-serif text-4xl">One workflow across sales, project delivery, and after-sales.</h2></div><div className="grid grid-cols-2 gap-3">{roles.map((role) => <div key={role} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-neutral-200">{role}</div>)}</div></div></section>
    <section className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-16 sm:px-6 sm:py-20 md:flex-row md:items-center lg:px-10"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Focused pilot</p><h2 className="mt-4 font-serif text-4xl tracking-[-.035em]">Start with lead-to-inspection or inspection-to-quote.</h2><p className="mt-3 max-w-2xl text-neutral-600">Select one measurable operating loop, one team, and the minimum integrations needed to validate conversion, response discipline, and delivery visibility.</p></div><Link href="/pilot" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">Plan a Pilot <ArrowRight size={18} /></Link></section>
    <MarketingFooter /></main>;
}
