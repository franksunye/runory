import Link from "next/link";
import { ArrowRight, Building2, Droplets, Heater, House, Wrench } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export default function SolutionsPage() {
  const solutions = [
    [House, "Home Services", "Unify intake, customer records, quoting, dispatch, field work, payment, and follow-up."],
    [Heater, "HVAC", "Support reactive calls, maintenance plans, assets, recurring visits, and technician scheduling."],
    [Wrench, "Plumbing", "Turn urgent calls into identified work, coordinate technicians, and keep customers informed."],
    [Droplets, "Waterproofing & Repair", "Manage inspection, proposal, project execution, evidence, change, completion, and after-sales."],
    [Building2, "Installation Services", "Coordinate longer-running jobs, milestones, field teams, documents, payments, and handover."],
  ];

  const scenes = [
    ["Emergency repair", ["Customer calls", "Urgency captured", "Nearest technician", "Work completed"]],
    ["Inspection & quote", ["Site visit", "Evidence recorded", "Proposal approved", "Project scheduled"]],
    ["Recurring service", ["Plan due", "Visit created", "Customer confirmed", "Asset history updated"]],
  ];

  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />
      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-24 lg:px-10">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Solutions</p>
        <h1 className="mt-5 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">One operating system, adapted to how your service business actually works.</h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-neutral-600">Start with CRM, Sales, FSM, and Omnichannel Intake. Add industry configuration without rebuilding the product.</p>
      </section>

      <section className="border-y border-black/10 bg-white py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 sm:px-6 md:grid-cols-2 lg:px-10">
          {solutions.map(([Icon, title, body]) => <article key={String(title)} className="rounded-2xl border border-black/10 bg-[#fbf8f1] p-6 sm:p-7"><Icon size={23} className="text-orange-600" /><h2 className="mt-6 text-xl font-semibold">{title as string}</h2><p className="mt-3 max-w-xl text-sm leading-6 text-neutral-600">{body as string}</p></article>)}
        </div>
      </section>

      <section className="bg-neutral-950 py-16 text-white sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-300">Real operating scenarios</p>
          <h2 className="mt-4 max-w-3xl font-serif text-4xl tracking-[-.035em] sm:text-5xl">Different services. The same connected operating discipline.</h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {scenes.map(([title, steps]) => (
              <article key={title as string} className="rounded-[24px] border border-white/10 bg-white/5 p-5 sm:p-6">
                <h3 className="text-lg font-semibold">{title as string}</h3>
                <div className="mt-6 space-y-3">
                  {(steps as string[]).map((step, index) => <div key={step} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-neutral-200"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-orange-400/15 text-xs text-orange-300">{index + 1}</span>{step}</div>)}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-16 sm:px-6 sm:py-20 md:flex-row md:items-center lg:px-10"><div><h2 className="font-serif text-4xl tracking-[-.035em]">Start with one focused workflow.</h2><p className="mt-3 text-neutral-600">Mature use cases can often launch in 1–2 weeks.</p></div><Link href="/pilot" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">Plan a Pilot <ArrowRight size={18} /></Link></section>
      <MarketingFooter />
    </main>
  );
}
