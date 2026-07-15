import Link from "next/link";
import { ArrowRight, Bot, BriefcaseBusiness, CalendarClock, CheckCircle2, Headphones, Layers3, ShieldCheck, Smartphone, Wrench } from "lucide-react";

const journey = ["Voice & SMS Intake", "CRM Pack", "Sales Pack", "FSM Pack", "Payment & Retention"];

export function RunoryHomeV2() {
  return (
    <>
      <section className="mx-auto grid max-w-7xl gap-14 px-6 pb-24 pt-16 lg:grid-cols-[1.02fr_.98fr] lg:px-10 lg:pt-24">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">Runory</p>
          <h1 className="mt-6 max-w-3xl font-serif text-5xl leading-[1.02] tracking-[-0.045em] text-neutral-950 sm:text-7xl">
            The field service operating system for the Agent era.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-neutral-600">
            CRM, Sales, Voice Intake, and FSM unified in one adaptive operating system for service businesses.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">Start a Pilot <ArrowRight size={18} /></Link>
            <Link href="/product" className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-6 py-3 font-semibold text-neutral-900">Explore the Product</Link>
          </div>
          <p className="mt-5 text-sm text-neutral-500">Mature use cases can often launch in 1–2 weeks.</p>
        </div>

        <div className="rounded-[30px] border border-black/10 bg-white p-4 shadow-[0_30px_90px_rgba(50,35,20,.10)]">
          <div className="rounded-[22px] bg-neutral-950 p-5 text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 text-sm">
              <span className="font-semibold">Today’s Operations</span><span className="text-orange-300">Live workspace</span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {["12 new leads", "8 visits scheduled", "3 quotes pending"].map((item) => <div key={item} className="rounded-xl bg-white/5 p-4 text-sm text-neutral-200">{item}</div>)}
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-white/20 p-8 text-center text-sm text-neutral-400">Product workspace screenshot placeholder</div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-black/10 p-5"><Smartphone size={20} /><p className="mt-3 font-semibold">Mobile field work</p><p className="mt-1 text-sm text-neutral-500">Tasks, forms, evidence, completion.</p></div>
            <div className="rounded-2xl border border-black/10 p-5"><Bot size={20} /><p className="mt-3 font-semibold">External Agent interface</p><p className="mt-1 text-sm text-neutral-500">Configure, operate, schedule, automate.</p></div>
          </div>
        </div>
      </section>

      <section className="border-y border-black/10 bg-white py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">One complete service platform</p>
            <h2 className="mt-4 font-serif text-4xl tracking-[-.035em] text-neutral-950 sm:text-5xl">From the first conversation to completed service.</h2>
          </div>
          <div className="mt-12 grid gap-3 md:grid-cols-5">
            {journey.map((item, index) => <div key={item} className="relative rounded-2xl border border-black/10 bg-[#fbf8f1] p-5"><span className="text-xs font-semibold text-orange-600">0{index + 1}</span><p className="mt-8 font-semibold text-neutral-900">{item}</p></div>)}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              [Headphones, "Omnichannel Intake", "Phone, voice, SMS, web, and manual intake become structured business work."],
              [Layers3, "Three Core Packs", "CRM, Sales, and FSM work together without stitching together multiple systems."],
              [Bot, "External Super Agents", "Use Codex, ChatGPT, Claude, Cursor, Trae, or compatible enterprise Agents."],
              [ShieldCheck, "Governed Execution", "Permissions, validation, confirmation, audit, and rollback where supported."],
            ].map(([Icon, title, body]) => (
              <article key={String(title)} className="rounded-2xl border border-black/10 bg-white p-6">
                <Icon size={22} className="text-orange-600" />
                <h3 className="mt-5 text-lg font-semibold">{title as string}</h3>
                <p className="mt-3 text-sm leading-6 text-neutral-600">{body as string}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-neutral-950 py-24 text-white">
        <div className="mx-auto grid max-w-7xl gap-14 px-6 lg:grid-cols-2 lg:px-10">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-300">Built for the Agent era</p>
            <h2 className="mt-5 font-serif text-4xl tracking-[-.035em] sm:text-5xl">Your Agent understands the work. Runory makes it run safely.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              [BriefcaseBusiness, "Configure", "Adapt fields, forms, roles, workflows, and reports."],
              [Wrench, "Operate", "Create records, assign work, update status, and coordinate teams."],
              [CalendarClock, "Schedule", "Run recurring checks, reminders, and conditional actions."],
              [CheckCircle2, "Control", "Keep every action within business rules and permissions."],
            ].map(([Icon, title, body]) => <div key={String(title)} className="rounded-2xl border border-white/10 bg-white/5 p-5"><Icon size={20} className="text-orange-300" /><h3 className="mt-4 font-semibold">{title as string}</h3><p className="mt-2 text-sm leading-6 text-neutral-400">{body as string}</p></div>)}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-[1fr_auto] lg:px-10">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Focused Pilot</p>
            <h2 className="mt-4 font-serif text-4xl tracking-[-.035em] text-neutral-950 sm:text-5xl">Start small. Go live fast. Expand with confidence.</h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-neutral-600">Begin with one priority workflow and one operating team. Mature use cases can often launch in 1–2 weeks.</p>
          </div>
          <Link href="/login" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-orange-600 px-7 font-semibold text-white">Start a Pilot <ArrowRight size={18} /></Link>
        </div>
      </section>
    </>
  );
}
