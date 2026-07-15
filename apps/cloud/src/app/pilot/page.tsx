import { CheckCircle2 } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { PilotInquiryForm } from "@/components/marketing/pilot-inquiry-form";

export default function PilotPage() {
  const items = [
    ["Scope", "One priority workflow and one operating team."],
    ["Timeline", "Mature use cases can often launch in 1–2 weeks."],
    ["Inputs", "Business rules, sample data, users, roles, and preferred Agent interface."],
    ["Success", "Measure response time, admin effort, follow-up, scheduling visibility, and completion discipline."],
  ];

  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />
      <section className="mx-auto grid max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[.86fr_1.14fr] lg:px-10 lg:py-24">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Focused Pilot</p>
          <h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">Start small. Go live fast. Prove operational value.</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-neutral-600">Tell us which workflow matters most. We will assess fit, scope the first operating loop, and respond with a practical pilot path.</p>
          <div className="mt-10 space-y-4">
            {["No broad transformation program", "One measurable workflow first", "A working system, not a slide deck"].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm font-medium text-neutral-700"><CheckCircle2 size={18} className="text-orange-600" />{item}</div>
            ))}
          </div>
        </div>
        <PilotInquiryForm />
      </section>

      <section className="border-y border-black/10 bg-white py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-5 px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-10">
          {items.map(([title, body], index) => <article key={title} className="rounded-2xl border border-black/10 bg-[#fbf8f1] p-6"><span className="text-xs font-semibold text-orange-600">0{index + 1}</span><h2 className="mt-8 text-lg font-semibold">{title}</h2><p className="mt-3 text-sm leading-6 text-neutral-600">{body}</p></article>)}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-2 lg:px-10">
        <div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">Good pilot candidates</p><h2 className="mt-4 font-serif text-4xl tracking-[-.035em]">A clear process, an engaged team, and a measurable problem.</h2></div>
        <div className="space-y-4">{["A repeatable CRM, Sales, or FSM workflow", "A team ready to provide rules and sample data", "Limited external integrations in the first scope", "A clear operational metric to improve"].map((item) => <div key={item} className="flex gap-3 border-b border-black/10 pb-4 text-neutral-700"><CheckCircle2 size={19} className="mt-0.5 shrink-0 text-orange-600" />{item}</div>)}</div>
      </section>
      <MarketingFooter />
    </main>
  );
}
