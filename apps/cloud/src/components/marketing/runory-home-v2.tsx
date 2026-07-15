import { ArrowRight, Bot, Headphones, Layers3, ShieldCheck, Workflow } from "lucide-react";

const journey = ["Voice & SMS Intake", "CRM Pack", "Sales Pack", "FSM Pack", "Payment & Retention"];

export function RunoryHomeV2() {
  return (
    <>
      <section className="mx-auto grid max-w-7xl gap-14 px-6 pb-24 pt-16 lg:grid-cols-2 lg:px-10 lg:pt-24">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">Runory</p>
          <h1 className="mt-6 max-w-3xl text-5xl font-semibold tracking-[-0.05em] text-neutral-950 sm:text-7xl">
            The field service operating system for the Agent era.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-neutral-600">
            CRM, Sales, and FSM unified into one adaptive platform for service businesses. External Super Agents help teams configure and operate Runory safely.
          </p>
          <button className="mt-10 inline-flex items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">
            Start a Pilot <ArrowRight size={18} />
          </button>
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
          <div className="grid gap-4">
            {journey.map((item) => <div key={item} className="rounded-xl border border-neutral-200 p-4 text-neutral-800">{item}</div>)}
          </div>
        </div>
      </section>
      <section className="bg-neutral-50 py-20">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-4 lg:px-10">
          {[
            [Headphones, "Omnichannel Intake"],
            [Layers3, "Three Core Packs"],
            [Bot, "External Super Agents"],
            [ShieldCheck, "Governed Execution"],
          ].map(([Icon, title]) => (
            <div key={String(title)} className="rounded-2xl border border-neutral-200 bg-white p-6">
              <Icon size={22} />
              <h3 className="mt-4 font-semibold">{title as string}</h3>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
