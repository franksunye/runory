import Link from "next/link";

export default function AgentPage() {
  return (
    <main className="min-h-screen bg-[#faf8f3] text-neutral-950">
      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">Agent Interface</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-[-0.05em] sm:text-7xl">
          Your Super Agent operates Runory. Runory keeps business execution governed.
        </h1>
        <p className="mt-8 max-w-3xl text-lg leading-8 text-neutral-600">
          Runory does not replace Super Agents. It provides the business runtime, data model, permissions, and execution layer that allow external Agents to configure and operate service businesses safely.
        </p>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {[
            ["Configure", "Customize workflows, fields, roles, and business rules through Agent-assisted operations."],
            ["Operate", "Use natural language to manage customers, sales, schedules, and field execution."],
            ["Automate", "Create scheduled and event-driven actions with controlled execution."],
          ].map(([title, body]) => (
            <article key={title} className="rounded-2xl border border-neutral-200 bg-white p-7">
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="mt-3 leading-7 text-neutral-600">{body}</p>
            </article>
          ))}
        </div>

        <div className="mt-16 rounded-3xl border border-neutral-200 bg-white p-10">
          <p className="text-sm uppercase tracking-[0.15em] text-neutral-500">Integration</p>
          <h2 className="mt-4 text-3xl font-semibold">External Super Agents + Runory Runtime</h2>
          <p className="mt-4 max-w-2xl leading-7 text-neutral-600">
            MCP, Skills, and SDK provide the connection layer. Runory provides governed business capabilities.
          </p>
        </div>

        <Link href="/" className="mt-12 inline-flex rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">
          Explore Runory
        </Link>
      </section>
    </main>
  );
}
