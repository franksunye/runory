import Link from "next/link";

export default function WaterproofingSolutionPage() {
  return (
    <main className="min-h-screen bg-[#fbf8f1] px-6 py-24 text-neutral-900">
      <section className="mx-auto max-w-6xl">
        <p className="mb-6 text-sm uppercase tracking-[0.2em] text-neutral-500">Waterproofing & Repair</p>
        <h1 className="max-w-4xl text-5xl font-serif leading-tight">Runory connects every step from customer request to completed repair.</h1>
        <p className="mt-8 max-w-3xl text-lg text-neutral-600">Manage inspection, quotation, project execution, evidence, changes, completion, and after-sales in one operating system.</p>
        <div className="mt-12 grid gap-4 md:grid-cols-6">
          {['Lead','400 Hotline','Inspection','Quote','Execution','After-sales'].map((item) => <div key={item} className="rounded-2xl border border-neutral-200 bg-white p-5">{item}</div>)}
        </div>
        <Link className="mt-12 inline-block rounded-full bg-black px-8 py-4 text-white" href="/pilot">Start a Pilot</Link>
      </section>
    </main>
  );
}
