import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, CircleHelp, Mail, PhoneCall, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "Pricing | Runory",
  description: "Runory plans start at $449 per month, combining voice intake, CRM, Sales, and FSM for service businesses.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Runory Pricing",
    description: "Clear plans for voice intake, CRM, Sales, and field service operations.",
    type: "website",
  },
};

const plans = [
  {
    name: "Starter",
    price: "$449",
    minutes: "1,000 minutes",
    audience: "Small service teams",
    description: "Turn calls and messages into structured customer records, appointments, and work orders.",
    features: [
      "Voice and messaging intake",
      "CRM, Sales, and FSM baseline",
      "Customer and lead management",
      "Work orders and appointments",
      "SMS follow-up and conversation history",
      "One operating team",
    ],
  },
  {
    name: "Growth",
    price: "$999",
    minutes: "3,000 minutes",
    audience: "Growing service businesses",
    description: "Run the complete service lifecycle with stronger automation, visibility, and operational control.",
    featured: true,
    features: [
      "Everything in Starter",
      "Full intake-to-completion operating loop",
      "Scheduling and dispatch coordination",
      "Quotes, follow-up, and commercial tracking",
      "Operational reporting and analysis",
      "Expanded workflow configuration",
    ],
  },
  {
    name: "Pro",
    price: "$2,499",
    minutes: "8,000 minutes",
    audience: "Multi-team and multi-location operations",
    description: "Support higher call volume, more teams, complex processes, and broader operational governance.",
    features: [
      "Everything in Growth",
      "Multiple teams and locations",
      "Advanced roles and permissions",
      "Complex workflow configuration",
      "Higher-volume voice operations",
      "Priority implementation support",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    minutes: "Custom usage",
    audience: "Complex or regulated deployments",
    description: "A tailored commercial structure for advanced integration, deployment, support, and governance needs.",
    features: [
      "Custom volume and commercial terms",
      "SLA and support model",
      "Advanced integrations",
      "Custom workflows and extensions",
      "Private or supported local deployment",
      "Phased enterprise rollout",
    ],
  },
] as const;

const commercialLayers = [
  {
    icon: Settings2,
    title: "Implementation",
    body: "Initial configuration, onboarding, integration, and launch support are scoped before work begins.",
    note: "Clear one-time scope",
  },
  {
    icon: ShieldCheck,
    title: "Runory Subscription",
    body: "The monthly plan covers the selected Runory capabilities, governed runtime, and operating environment.",
    note: "Predictable platform fee",
  },
  {
    icon: PhoneCall,
    title: "Additional Usage",
    body: "Usage beyond the included minutes and premium third-party services are priced separately where applicable.",
    note: "Transparent usage policy",
  },
];

const faqs = [
  ["What is included in the call minutes?", "Included minutes apply to AI-handled voice usage within the selected plan. Final telephony, number, SMS, provider, and fair-use details are confirmed in the commercial agreement."],
  ["Is implementation included in the monthly price?", "Standard product access is covered by the subscription. Initial setup, migration, integrations, workflow configuration, and launch support are scoped separately based on the required work."],
  ["What happens when included minutes are exceeded?", "Additional usage is billed under the agreed overage policy. The exact rate and provider-cost treatment are confirmed before production launch."],
  ["Can we start with a focused pilot?", "Yes. A pilot normally covers one priority operating loop and one operating team, with success measures agreed before implementation."],
  ["Are telephony and third-party services included?", "Phone numbers, carrier charges, SMS, payment processing, premium AI models, and other third-party services may be billed separately or passed through transparently."],
];

export default function PricingPage() {
  const emailHref = "mailto:support@visutry.com?subject=Runory%20Commercial%20Inquiry&body=Company%3A%0AService%20industry%3A%0APriority%20workflow%3A%0ATeam%20size%3A%0AExpected%20timeline%3A";

  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-20 lg:px-10 lg:py-28">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Pricing</p>
        <h1 className="mt-6 max-w-5xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">
          Clear plans for complete service operations.
        </h1>
        <p className="mt-8 max-w-3xl text-lg leading-8 text-neutral-600">
          Runory starts at $449 per month. Every plan combines voice intake with CRM, Sales, and FSM capabilities, so customer conversations become ongoing business execution—not isolated call records.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={emailHref} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-neutral-950 px-7 font-semibold text-white">
            Discuss Your Plan <Mail size={18} />
          </Link>
          <Link href="/pilot" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-black/15 bg-white px-7 font-semibold">
            Start with a Pilot <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <section className="border-y border-black/10 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`relative flex h-full flex-col rounded-[26px] border p-6 sm:p-7 ${
                  "featured" in plan && plan.featured
                    ? "border-orange-500 bg-neutral-950 text-white shadow-[0_28px_80px_rgba(30,20,10,.16)]"
                    : "border-black/10 bg-[#fbf8f1]"
                }`}
              >
                {"featured" in plan && plan.featured && (
                  <div className="absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-orange-600 px-3 py-1 text-xs font-semibold text-white">
                    <Sparkles size={13} /> Recommended
                  </div>
                )}
                <p className={`text-sm font-semibold ${"featured" in plan && plan.featured ? "text-orange-300" : "text-orange-600"}`}>{plan.name}</p>
                <div className="mt-7 flex items-end gap-2">
                  <span className="font-serif text-5xl tracking-[-.04em]">{plan.price}</span>
                  {plan.price !== "Custom" && <span className={`pb-1 text-sm ${"featured" in plan && plan.featured ? "text-neutral-400" : "text-neutral-500"}`}>/ month</span>}
                </div>
                <p className={`mt-3 text-sm font-semibold ${"featured" in plan && plan.featured ? "text-neutral-200" : "text-neutral-800"}`}>{plan.minutes}</p>
                <p className={`mt-1 text-xs uppercase tracking-[.12em] ${"featured" in plan && plan.featured ? "text-neutral-500" : "text-neutral-500"}`}>{plan.audience}</p>
                <p className={`mt-6 text-sm leading-7 ${"featured" in plan && plan.featured ? "text-neutral-300" : "text-neutral-600"}`}>{plan.description}</p>
                <ul className={`mt-7 space-y-3 border-t pt-6 ${"featured" in plan && plan.featured ? "border-white/10" : "border-black/10"}`}>
                  {plan.features.map((feature) => (
                    <li key={feature} className={`flex gap-2.5 text-sm leading-6 ${"featured" in plan && plan.featured ? "text-neutral-200" : "text-neutral-700"}`}>
                      <Check size={16} className="mt-1 shrink-0 text-orange-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href={emailHref}
                  className={`mt-8 inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold ${
                    "featured" in plan && plan.featured
                      ? "bg-orange-600 text-white"
                      : "border border-black/15 bg-white text-neutral-950"
                  }`}
                >
                  {plan.name === "Enterprise" ? "Contact Sales" : `Choose ${plan.name}`}
                </Link>
              </article>
            ))}
          </div>
          <p className="mt-6 text-sm leading-7 text-neutral-500">
            Prices are monthly starting prices in USD. Final terms may vary by workflow, integrations, deployment model, support level, usage profile, and implementation scope.
          </p>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">How pricing is structured</p>
            <h2 className="mt-4 font-serif text-4xl tracking-[-.035em] sm:text-5xl">Professional pricing without hidden scope.</h2>
            <p className="mt-5 text-lg leading-8 text-neutral-600">Subscription, implementation, and variable provider usage remain clearly separated.</p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {commercialLayers.map(({ icon: Icon, title, body, note }, index) => (
              <article key={title} className="rounded-[24px] border border-black/10 bg-white p-6 sm:p-7">
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

      <section className="bg-neutral-950 py-20 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-300">Focused Pilot</p>
            <h2 className="mt-4 max-w-3xl font-serif text-4xl tracking-[-.035em] sm:text-5xl">Prove one operating loop before expanding.</h2>
            <p className="mt-5 max-w-2xl leading-7 text-neutral-400">A pilot gives both sides a practical basis for confirming workflow fit, implementation scope, production usage, and the right long-term plan.</p>
          </div>
          <Link href="/pilot" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-orange-600 px-7 font-semibold text-white">
            Explore the Pilot <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-4xl px-5 sm:px-6 lg:px-10">
          <div className="flex items-center gap-2 text-orange-600"><CircleHelp size={19} /><span className="text-sm font-semibold uppercase tracking-[.18em]">FAQ</span></div>
          <h2 className="mt-4 font-serif text-4xl tracking-[-.035em]">Pricing questions</h2>
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
