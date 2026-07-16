import Link from "next/link";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export default function HvacPage() {
  const flow = [
    ["Customer request", "Calls, messages, and online requests enter one operating context."],
    ["Voice intake", "AI captures customer needs, urgency, equipment details, and intent."],
    ["Sales & scheduling", "Teams manage quotes, appointments, and technician capacity."],
    ["Service completion", "Field work, history, and follow-up remain connected."],
  ];

  return <main className="min-h-screen bg-[#fbf8f1] text-neutral-950"><MarketingHeader />
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-24 lg:px-10">
      <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">HVAC OPERATIONS</p>
      <h1 className="mt-5 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">Turn HVAC demand into a connected service operation.</h1>
      <p className="mt-7 max-w-3xl text-lg leading-8 text-neutral-600">Runory connects voice intake, CRM, sales follow-up, scheduling, and field execution into one operating loop for HVAC businesses.</p>
    </section>
    <section className="border-y border-black/10 bg-white py-16"><div className="mx-auto grid max-w-7xl gap-5 px-5 md:grid-cols-2 lg:px-10">{flow.map(([title,body],i)=><article key={title} className="rounded-2xl border border-black/10 bg-[#fbf8f1] p-7"><span className="text-orange-600">0{i+1}</span><h2 className="mt-5 text-xl font-semibold">{title}</h2><p className="mt-3 text-neutral-600">{body}</p></article>)}</div></section>
    <section className="mx-auto max-w-7xl px-5 py-16 lg:px-10"><div className="rounded-3xl bg-neutral-950 p-8 text-white sm:p-12"><h2 className="max-w-3xl font-serif text-4xl">From AI-assisted intake to governed field execution.</h2><p className="mt-4 max-w-2xl text-white/70">Super Agents can configure and operate workflows through Runory while business teams keep control and visibility.</p></div></section>
    <section className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-16 lg:px-10"><h2 className="font-serif text-4xl">Start with one HVAC workflow.</h2><Link className="rounded-full bg-neutral-950 px-6 py-3 text-white" href="/pilot">Start a Pilot</Link></section>
    <MarketingFooter /></main>;
}