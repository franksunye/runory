import Link from "next/link";
import { ArrowRight, Check, CircleHelp, Mail, PhoneCall, Settings2, ShieldCheck } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

const commercialLayers = [
  {
    icon: Settings2,
    title: "Focused Pilot",
    body: "A defined workflow, initial configuration, onboarding, and launch support for one operating team.",
    note: "Scoped before work begins",
  },
  {
    icon: ShieldCheck,
    title: "Runory Subscription",
    body: "Ongoing access to the selected CRM, Sales, FSM, platform, governance, and operational capabilities.",
    note: "Based on scope and deployment",
  },
  {
    icon: PhoneCall,
    title: "Usage & Providers",
    body: "Voice, SMS, telephony, payment, model, and other third-party usage are priced separately where applicable.",
    note: "Passed through transparently",
  },
];

const included = [
  "Workspace and user setup",
  "Selected CRM, Sales, and FSM capabilities",
  "Roles, permissions, forms, and workflow configuration",
  "Agent interface through supported MCP, Skills, or SDK paths",
  "Governed commands, audit, and operational visibility",
  "Implementation guidance for the agreed pilot scope",
];

const faqs = [
  ["Why is there no public per-user price yet?", "Runory is currently sold through focused pilots. Scope varies materially by workflow, deployment model, integrations, voice usage, and required configuration, so publishing a single number would be misleading."],
  ["Is Runory priced per user?", "Not necessarily. Commercial terms may combine a platform subscription, selected capability scope, usage-based services, and implementation work. The goal is to keep pricing aligned with operational value rather than UI seats alone."],
  ["Are telephony and AI provider costs included?", "Third-party provider costs such as phone numbers, call minutes, SMS, payment processing, and model usage are identified separately and passed through transparently unless otherwise agreed."],
  ["What happens after the pilot?", "After the pilot, both sides review operational results and define the production scope, subscription, integrations, support level, and rollout plan."],
];

export default function PricingPage() {
  const emailHref = "mailto:support@visutry.com?subject=Runory%20Commercial%20Inquiry&body=Company%3A%0AService%20industry%3A%0APriority%20workflow%3A%0ATeam%20size%3A%0AExpected%20timeline%3A";

  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-20 lg:px-10 lg:py-28">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Commercial Model</p>
        <h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">
          Start with a focused pilot. Price the real operating scope.
        </h1>
        <p className="mt-8 max-w-3xl text-lg leading-8 text-neutral-600">
          Runory is not currently offered as a generic self-serve plan. We first define the workflow, deployment, integrations, and operating outcomes, then provide a clear commercial proposal.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={emailHref} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-neutral-950 px-7 font-semibold text-white">
            Request Commercial Terms <Mail size={18} />
          </Link>
          <Link href="/pilot" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-black/15 bg-white px-7 font-semibold">
            Explore the Pilot <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <section className="border-y border-black/10 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">How pricing is structured</p>
            <h2 className="mt-4 font-serif text-4xl tracking-[-.035em] sm:text-5xl">Three clear commercial layers.</h2>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {commercialLayers.map(({ icon: Icon, title, body, note }, index) => (
              <article key={title} className="rounded-[24px] border border-black/10 bg-[#fbf8f1] p-6 sm:p-7">
                <div className="flex items-center justify-between">
                  <Icon size={22} className="text-orange-600" />
                  <span className="text-xs font-semibold text-orange-600">0{index + 1}</span>
                </div>
                <h3 className="mt-8 text-xl font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-neutral-600">{body}</p>
                <p className="mt-6 border-t border-black/10 pt-4 text-xs font-semibold uppercase tracking-[.12em] text-neutral-500">{note}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-6 lg:grid-cols-[.82fr_1.18fr] lg:px-10">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Typical pilot scope</p>
            <h2 className="mt-4 font-serif text-4xl tracking-[-.035em]">Enough to prove value, constrained enough to launch.</h2>
            <p className="mt-5 leading-7 text-neutral-600">The first proposal is based on one priority operating loop rather than a broad transformation program.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {included.map((item) => (
              <div key={item} className="flex gap-3 rounded-2xl border border-black/10 bg-white p-5 text-sm leading-6 text-neutral-700">
                <Check size={17} className="mt-0.5 shrink-0 text-orange-600" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-neutral-950 py-20 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-300">No hidden architecture tax</p>
            <h2 className="mt-4 max-w-3xl font-serif text-4xl tracking-[-.035em] sm:text-5xl">Implementation, subscription, and provider usage stay visibly separate.</h2>
            <p className="mt-5 max-w-2xl leading-7 text-neutral-400">This keeps the commercial model understandable and prevents temporary website mechanics or third-party usage from distorting the Runory product architecture.</p>
          </div>
          <Link href={emailHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-orange-600 px-7 font-semibold text-white">
            Email Runory <Mail size={18} />
          </Link>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-4xl px-5 sm:px-6 lg:px-10">
          <div className="flex items-center gap-2 text-orange-600"><CircleHelp size={19} /><span className="text-sm font-semibold uppercase tracking-[.18em]">FAQ</span></div>
          <h2 className="mt-4 font-serif text-4xl tracking-[-.035em]">Commercial questions</h2>
          <div className="mt-10 divide-y divide-black/10 border-y border-black/10">
            {faqs.map(([question, answer]) => (
              <article key={question} className="py-6">
                <h3 className="font-semibold">{question}</h3>
                <p className="mt-2 text-sm leading-7 text-neutral-600">{answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
