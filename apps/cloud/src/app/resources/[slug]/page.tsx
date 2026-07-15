import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";

const articles = {
  "agent-native-field-service": {
    category: "Strategy",
    title: "What Agent-native field service software actually means",
    description: "Why the Agent should be the operating interface while the business system remains the governed source of truth.",
    sections: [
      ["The Agent is not the system of record", "A capable Agent can understand intent, coordinate steps, and reduce interface friction. But customer records, permissions, workflow state, approvals, and audit still need a deterministic business runtime."],
      ["Separate intelligence from execution", "The Agent decides what should happen. Runory validates whether it may happen, applies business rules, performs the command, and records the result. This separation makes Agent-driven operations practical for real businesses."],
      ["Why this matters for field service", "Field service combines customer communication, quoting, schedules, people, locations, evidence, payment, and after-sales. These workflows benefit from natural-language operation, but they cannot tolerate ambiguous state or uncontrolled writes."],
      ["A useful architecture", "External Super Agent → MCP, Skills, or SDK → governed Runory commands → CRM, Sales, FSM, Voice, and operational records. The Agent remains replaceable; the business truth remains stable."],
    ],
  },
  "voice-intake-to-work-order": {
    category: "Operations",
    title: "From phone call to work order without duplicate entry",
    description: "A practical operating model for converting voice and messaging conversations into CRM, Sales, and FSM execution.",
    sections: [
      ["Treat every conversation as operational input", "A phone call should not end as an isolated recording or transcript. The system should identify the customer, capture intent, structure service details, confirm key facts, and create the correct business record."],
      ["Use a controlled intake sequence", "Answer → identify → capture → confirm → create work → follow up. Each stage should expose clear data requirements and human-handoff rules."],
      ["Connect intake to the full service lifecycle", "A qualified request may create or update a customer, lead, opportunity, work order, visit, and follow-up task. The conversation history should remain attached to the same operational context."],
      ["Design for failure", "Provider timeouts, duplicate callbacks, incomplete identities, and ambiguous requests are normal. Idempotency, replay, visible errors, confirmation, and escalation are core product capabilities—not edge cases."],
    ],
  },
  "focused-fsm-pilot": {
    category: "Implementation",
    title: "How to scope a field service pilot that can launch quickly",
    description: "Choose one measurable workflow, constrain integrations, and prove operational value before expanding.",
    sections: [
      ["Start with one operating loop", "A strong pilot covers one meaningful workflow end to end—for example, intake to scheduled visit, or inspection to quote approval. Avoid a broad transformation program."],
      ["Use a real team and real rules", "The pilot should include actual users, roles, sample data, business rules, and exceptions. A demo can validate interface quality; a pilot must validate operating reality."],
      ["Constrain the first integration scope", "Every external system adds uncertainty. Begin with the minimum integrations required to prove the workflow, then expand after the core operating loop is stable."],
      ["Measure operational outcomes", "Useful measures include response time, missed follow-up, administrative effort, scheduling visibility, quote progression, completion discipline, and data quality."],
    ],
  },
} as const;

type Slug = keyof typeof articles;

export function generateStaticParams() {
  return Object.keys(articles).map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const article = articles[params.slug as Slug];
  if (!article) return {};
  return {
    title: `${article.title} | Runory`,
    description: article.description,
    alternates: { canonical: `/resources/${params.slug}` },
    openGraph: { title: article.title, description: article.description, type: "article" },
  };
}

export default function ResourceArticlePage({ params }: { params: { slug: string } }) {
  const article = articles[params.slug as Slug];
  if (!article) notFound();

  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />
      <article>
        <header className="mx-auto max-w-4xl px-5 py-16 sm:px-6 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{article.category}</p>
          <h1 className="mt-5 font-serif text-5xl leading-[1.04] tracking-[-.04em] sm:text-6xl">{article.title}</h1>
          <p className="mt-7 text-lg leading-8 text-neutral-600">{article.description}</p>
        </header>
        <div className="border-y border-black/10 bg-white">
          <div className="mx-auto max-w-4xl px-5 py-12 sm:px-6 sm:py-16">
            {article.sections.map(([heading, body], index) => (
              <section key={heading} className={index === 0 ? "" : "mt-12 border-t border-black/10 pt-12"}>
                <h2 className="font-serif text-3xl tracking-[-.025em]">{heading}</h2>
                <p className="mt-4 text-base leading-8 text-neutral-700">{body}</p>
              </section>
            ))}
          </div>
        </div>
      </article>
      <MarketingFooter />
    </main>
  );
}
