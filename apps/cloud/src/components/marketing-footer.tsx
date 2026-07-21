"use client";

import Link from "next/link";
import { LocaleLink } from "@/components/LocaleLink";
import { usePathname } from "next/navigation";
import { ArrowRight, GitBranch } from "lucide-react";
import { SITE_CONFIG } from "@/lib/site";
import { useI18n } from "@/i18n/locale-provider";
import { marketingCopy } from "@/i18n/marketing-copy";

export function MarketingFooter() {
  const gh = SITE_CONFIG.githubUrl;
  const pathname = usePathname();
  const { locale } = useI18n();
  const c = marketingCopy[locale].footer;
  const zh = locale === "zh";
  const groups = [
    { title: c.product, links: [[c.overview, "/product"], [c.voice, "/voice"], [c.agent, "/agent"], [c.platform, "/platform"]] },
    { title: c.solutions, links: [[c.serviceBusinesses, "/solutions"], [c.pricing, "/pricing"], [c.focusedPilot, "/pilot"], [c.security, "/security"], [c.signIn, "/login"]] },
    { title: c.resources, links: [[c.insights, "/resources"], [c.docs, "/docs"], [c.openSource, "/open-source"], ["GitHub", gh]] },
  ];

  const recommendations = pathname.startsWith("/solutions")
    ? [
        [zh ? "了解完整产品" : "Explore the Product", "/product", zh ? "查看 CRM、销售、FSM 与语音接单如何形成统一业务闭环。" : "See how CRM, Sales, FSM, and Voice Intake form one operating loop."],
        [zh ? "规划聚焦试点" : "Plan a Focused Pilot", "/pilot", zh ? "从一个可衡量流程开始，快速验证实际运营价值。" : "Start with one measurable workflow and validate operational value quickly."],
      ]
    : pathname.startsWith("/resources")
      ? [
          [zh ? "查看解决方案" : "Explore Solutions", "/solutions", zh ? "将方法论映射到家庭服务、暖通空调与防水维修场景。" : "Map the operating model to home services, HVAC, and waterproofing scenarios."],
          [zh ? "了解 Agent 接口" : "Explore the Agent Interface", "/agent", zh ? "了解外部超级 Agent 如何安全操作 Runory。" : "See how external Super Agents operate Runory safely."],
        ]
      : [
          [zh ? "行业解决方案" : "Industry Solutions", "/solutions", zh ? "查看 Runory 如何适配不同服务行业的业务闭环。" : "See how Runory adapts to real service-industry operating loops."],
          [zh ? "阅读核心资源" : "Read Core Resources", "/resources", zh ? "深入了解 Agent-native FSM、语音接单与快速试点。" : "Go deeper on Agent-native FSM, voice intake, and focused pilots."],
        ];

  return (
    <footer className="border-t border-black/10 bg-[#fbf8f1]">
      <section className="border-b border-black/10 bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{zh ? "继续了解" : "Explore next"}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {recommendations.map(([title, href, body]) => (
              <LocaleLink key={href} href={href} className="group flex min-h-[156px] flex-col justify-between rounded-2xl border border-black/10 bg-[#fbf8f1] p-6 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-sm sm:p-7">
                <div><h2 className="text-xl font-semibold text-neutral-950">{title}</h2><p className="mt-3 max-w-xl text-sm leading-7 text-neutral-600">{body}</p></div>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-orange-600">{zh ? "继续" : "Explore"}<ArrowRight size={16} className="transition group-hover:translate-x-1" /></span>
              </LocaleLink>
            ))}
          </div>
        </div>
      </section>
      <div className="border-b border-black/10 bg-neutral-950 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 px-5 py-12 sm:px-6 md:flex-row md:items-center lg:px-10">
          <div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-300">{c.pilotEyebrow}</p><h2 className="mt-3 max-w-2xl font-serif text-3xl tracking-[-.03em] sm:text-4xl">{c.pilotTitle}</h2></div>
          <LocaleLink href="/pilot" className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-orange-600 px-7 font-semibold text-white">{c.pilotCta} <ArrowRight size={18} /></LocaleLink>
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.35fr_1fr_1fr_1fr] lg:px-10 lg:py-16">
        <div><LocaleLink href="/" className="flex items-center"><span className="grid size-9 place-items-center rounded-[10px] bg-neutral-950 font-semibold text-white">R</span><span className="ml-3 text-lg font-semibold tracking-tight text-neutral-950">Runory</span></LocaleLink><p className="mt-5 max-w-sm text-sm leading-6 text-neutral-600">{c.description}</p><Link href={gh} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-neutral-700 transition hover:text-orange-600"><GitBranch size={17} /> {c.github}</Link></div>
        {groups.map((group) => <div key={group.title}><h2 className="text-sm font-semibold text-neutral-950">{group.title}</h2><ul className="mt-4 space-y-3">{group.links.map(([label, href]) => { const external = href.startsWith("http"); return <li key={href}><LocaleLink href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="text-sm text-neutral-600 transition hover:text-neutral-950">{label}</LocaleLink></li>; })}</ul></div>)}
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-black/10 px-5 py-6 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10"><p>© 2026 Runory.</p><p>{c.tagline}</p></div>
    </footer>
  );
}
