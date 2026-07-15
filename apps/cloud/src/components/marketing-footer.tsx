"use client";

import Link from "next/link";
import { ArrowRight, GitBranch } from "lucide-react";
import { SITE_CONFIG } from "@/lib/site";

export function MarketingFooter() {
  const gh = SITE_CONFIG.githubUrl;
  const groups = [
    { title: "Product", links: [["Overview", "/product"], ["Voice & Messaging", "/voice"], ["Agent Interface", "/agent"], ["Platform", "/platform"]] },
    { title: "Solutions", links: [["Service Businesses", "/solutions"], ["Pricing", "/pricing"], ["Focused Pilot", "/pilot"], ["Security", "/security"], ["Sign in", "/login"]] },
    { title: "Resources", links: [["Insights", "/resources"], ["Documentation", "/docs"], ["Open Source", "/open-source"], ["GitHub", gh]] },
  ];

  return (
    <footer className="border-t border-black/10 bg-[#fbf8f1]">
      <div className="border-b border-black/10 bg-neutral-950 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 px-5 py-12 sm:px-6 md:flex-row md:items-center lg:px-10">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-300">Focused Pilot</p>
            <h2 className="mt-3 max-w-2xl font-serif text-3xl tracking-[-.03em] sm:text-4xl">Turn one priority workflow into a working operating loop.</h2>
          </div>
          <Link href="/pilot" className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-orange-600 px-7 font-semibold text-white">Start a Pilot <ArrowRight size={18} /></Link>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.35fr_1fr_1fr_1fr] lg:px-10 lg:py-16">
        <div>
          <Link href="/" className="flex items-center">
            <span className="grid size-9 place-items-center rounded-[10px] bg-neutral-950 font-semibold text-white">R</span>
            <span className="ml-3 text-lg font-semibold tracking-tight text-neutral-950">Runory</span>
          </Link>
          <p className="mt-5 max-w-sm text-sm leading-6 text-neutral-600">The field service operating system for the Agent era. CRM, Sales, Voice Intake, and FSM in one governed runtime.</p>
          <Link href={gh} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-neutral-700 transition hover:text-orange-600"><GitBranch size={17} /> GitHub repository</Link>
        </div>

        {groups.map((group) => (
          <div key={group.title}>
            <h2 className="text-sm font-semibold text-neutral-950">{group.title}</h2>
            <ul className="mt-4 space-y-3">
              {group.links.map(([label, href]) => {
                const external = href.startsWith("http");
                return <li key={href}><Link href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="text-sm text-neutral-600 transition hover:text-neutral-950">{label}</Link></li>;
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-black/10 px-5 py-6 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
        <p>© 2026 Runory.</p><p>Tell it. Run it.</p>
      </div>
    </footer>
  );
}
