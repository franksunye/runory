import Link from "next/link";

const packs = [
  { title: "CRM Pack", body: "Capture leads, manage customers, sites, contacts, and service history." },
  { title: "Sales Pack", body: "Move opportunities from qualification to quote, approval, and payment." },
  { title: "FSM Pack", body: "Schedule, dispatch, execute, and complete field service operations." },
];

export default function ProductPage() {
  return (
    <main className="min-h-screen bg-[#faf8f3] text-neutral-950">
      <section className="mx-auto max-w-6xl px-6 py-24">
        <p className="text-sm uppercase tracking-[0.18em] text-orange-600">Runory Product</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-[-0.05em] sm:text-7xl">
          One operating system for modern service businesses.
        </h1>
        <p className="mt-8 max-w-3xl text-lg leading-8 text-neutral-600">
          Runory combines omnichannel intake, CRM, Sales, and FSM into one adaptive platform designed to work with external Super Agents.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-6 pb-24 md:grid-cols-3">
        {packs.map((pack) => (
          <article key={pack.title} className="rounded-2xl border border-neutral-200 bg-white p-8">
            <h2 className="text-2xl font-semibold">{pack.title}</h2>
            <p className="mt-4 leading-7 text-neutral-600">{pack.body}</p>
          </article>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Link href="/" className="text-sm font-semibold text-orange-600">Back to Runory →</Link>
      </section>
    </main>
  );
}
