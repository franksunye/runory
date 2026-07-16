"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { useI18n } from "@/i18n/locale-provider";

const content = {
  en: {
    eyebrow: "Waterproofing & Repair",
    title: "Run the complete journey from customer request to completed repair and after-sales.",
    description: "Runory unifies lead intake, inspection, quoting, project execution, evidence, settlement, warranty, and after-sales in one governed operating system.",
    loop: "Operating loop",
    flow: [
      ["Lead and hotline intake", "Phone, web, channel, and manual requests become structured leads with customer, site, urgency, and source context."],
      ["Inspection and diagnosis", "Consultants schedule site visits, record findings, capture photos, and structure the proposed repair scope."],
      ["Quote and approval", "Manage pricing, negotiation, approvals, contracts, deposits, and the transition from sales to delivery."],
      ["Project execution", "Coordinate supervisors, craftsmen, milestones, evidence, changes, quality checks, and customer communication."],
      ["Settlement and after-sales", "Track completion, acceptance, settlement, warranties, callbacks, and repair decisions in the same history."],
    ],
    reasons: [
      ["Sales and delivery stay connected", "Lead, inspection, quote, contract, project, payment, and after-sales remain part of one operating record."],
      ["Evidence-based execution", "Photos, inspection records, change evidence, acceptance, and warranty context remain attached to the work."],
      ["Governed Agent operation", "External Agents can assist with follow-up, scheduling, checks, and updates while permissions and audit remain enforced."],
    ],
    rolesLabel: "Typical roles",
    rolesTitle: "One workflow across sales, project delivery, and after-sales.",
    roles: ["400 hotline", "Service provider", "Clerk", "Consultant", "Site supervisor", "Craftsmen", "Operations and finance", "After-sales"],
    pilotLabel: "Focused pilot",
    pilotTitle: "Start with lead-to-inspection or inspection-to-quote.",
    pilotBody: "Select one measurable operating loop, one team, and the minimum integrations needed to validate conversion, response discipline, and delivery visibility.",
    pilotCta: "Plan a Pilot",
  },
  zh: {
    eyebrow: "防水维修",
    title: "贯通从客户报修到维修完工与售后的完整业务旅程。",
    description: "Runory 将线索接入、上门勘查、报价、项目执行、现场凭证、结算、质保与售后整合在一个受治理的业务操作系统中。",
    loop: "运营闭环",
    flow: [
      ["线索与热线接入", "电话、网页、渠道与人工录入的需求，转化为包含客户、地址、紧急程度与来源的结构化线索。"],
      ["勘查与诊断", "顾问安排上门，记录问题、采集照片，并形成结构化维修范围。"],
      ["报价与确认", "管理定价、议价、审批、合同、首付款，以及从销售到交付的流转。"],
      ["项目执行", "协调项目经理、工队、里程碑、现场凭证、变更、质检与客户沟通。"],
      ["结算与售后", "在同一业务历史中管理完工、验收、结算、质保、回访与返修判断。"],
    ],
    reasons: [
      ["销售与交付持续贯通", "线索、勘查、报价、合同、项目、收款与售后始终属于同一运营记录。"],
      ["基于现场凭证执行", "照片、勘查记录、变更凭证、验收与质保信息始终附着在项目上。"],
      ["受治理的 Agent 操作", "外部 Agent 可协助跟进、排期、检查与更新，同时严格执行权限与审计。"],
    ],
    rolesLabel: "典型角色",
    rolesTitle: "一套流程贯通销售、项目交付与售后。",
    roles: ["400 热线", "服务商", "文员", "顾问", "项目经理", "工队", "运营与财务", "售后团队"],
    pilotLabel: "聚焦试点",
    pilotTitle: "从“线索到勘查”或“勘查到报价”开始。",
    pilotBody: "选择一个可衡量的运营闭环、一支实际团队，以及验证转化、响应纪律与交付可见性所需的最少集成。",
    pilotCta: "规划试点",
  },
} as const;

export default function WaterproofingSolutionPage() {
  const { locale } = useI18n();
  const copy = content[locale];

  return <main className="min-h-screen bg-[#fbf8f1] text-neutral-950"><MarketingHeader />
    <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 sm:py-24 lg:px-10"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{copy.eyebrow}</p><h1 className="mt-5 max-w-4xl font-serif text-4xl leading-[1.06] tracking-[-.04em] sm:text-7xl sm:leading-[1.02]">{copy.title}</h1><p className="mt-6 max-w-3xl text-base leading-7 text-neutral-600 sm:mt-7 sm:text-lg sm:leading-8">{copy.description}</p></section>
    <section className="border-y border-black/10 bg-white py-14 sm:py-20"><div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{copy.loop}</p><div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{copy.flow.map(([title, body], i) => <article key={title} className="flex min-h-[232px] flex-col rounded-2xl border border-black/10 bg-[#fbf8f1] p-6 sm:p-7"><span className="text-sm font-semibold text-orange-600">0{i + 1}</span><h2 className="mt-5 text-xl font-semibold leading-snug">{title}</h2><p className="mt-3 leading-7 text-neutral-600">{body}</p></article>)}</div></div></section>
    <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 sm:py-20 lg:px-10"><div className="grid gap-6 lg:grid-cols-3">{copy.reasons.map(([title, body]) => <article key={title} className="min-h-[210px] rounded-2xl border border-black/10 bg-white p-6 sm:p-7"><h2 className="text-xl font-semibold leading-snug">{title}</h2><p className="mt-3 leading-7 text-neutral-600">{body}</p></article>)}</div></section>
    <section className="bg-neutral-950 py-14 text-white sm:py-20"><div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:px-10"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-300">{copy.rolesLabel}</p><h2 className="mt-4 font-serif text-3xl leading-tight sm:text-4xl">{copy.rolesTitle}</h2></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{copy.roles.map((role) => <div key={role} className="min-h-12 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-neutral-200">{role}</div>)}</div></div></section>
    <section className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-14 sm:px-6 sm:py-20 md:flex-row md:items-center lg:px-10"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{copy.pilotLabel}</p><h2 className="mt-4 max-w-3xl font-serif text-3xl leading-tight tracking-[-.03em] sm:text-4xl">{copy.pilotTitle}</h2><p className="mt-3 max-w-2xl leading-7 text-neutral-600">{copy.pilotBody}</p></div><Link href="/pilot" className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">{copy.pilotCta} <ArrowRight size={18} /></Link></section>
    <MarketingFooter /></main>;
}
