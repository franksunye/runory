import Link from "next/link";
import { ArrowRight, MessageSquareText, PhoneCall, ShieldCheck, Workflow } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

const steps = ["Answer", "Identify", "Capture", "Confirm", "Create Work", "Follow Up"];

export default function VoicePage() {
  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Voice & Messaging</p>
        <h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">Turn every customer conversation into structured business execution.</h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-neutral-600">Runory connects phone, AI voice, SMS, web, and manual intake to CRM, Sales, and FSM workflows—without duplicate entry or disconnected call records.</p>
        <div className="mt-10 flex gap-3"><Link href="/login" className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">Start a Pilot <ArrowRight size={18} /></Link></div>
      </section>

      <section className="border-y border-black/10 bg-white py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid gap-3 md:grid-cols-6">{steps.map((step, index) => <div key={step} className="rounded-2xl border border-black/10 bg-[#fbf8f1] p-5"><span className="text-xs font-semibold text-orange-600">0{index + 1}</span><p className="mt-7 font-semibold">{step}</p></div>)}</div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-10">
          {[
            [PhoneCall, "Commercial-grade intake", "Capture identity, intent, service details, urgency, and preferred schedule."],
            [MessageSquareText, "One conversation history", "Calls, transcripts, messages, confirmations, and follow-ups stay linked to the customer and work."],
            [Workflow, "Real business outcomes", "Create Leads, Customers, Work Orders, Visits, and follow-up tasks through governed commands."],
            [ShieldCheck, "Provider-safe execution", "Idempotency, confirmation, human handoff, audit, and operational visibility."],
          ].map(([Icon, title, body]) => <article key={String(title)} className="rounded-2xl border border-black/10 bg-white p-6"><Icon size={22} className="text-orange-600" /><h2 className="mt-5 text-lg font-semibold">{title as string}</h2><p className="mt-3 text-sm leading-6 text-neutral-600">{body as string}</p></article>)}
        </div>
      </section>
      <MarketingFooter />
    </main>
  );
}
