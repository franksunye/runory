"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { useI18n } from "@/i18n/locale-provider";

const content = {
  en: {
    eyebrow: "Home Services",
    title: "From the first customer request to completed service and follow-up.",
    description: "Runory unifies omnichannel intake, CRM, sales, scheduling, field service, payment, and retention in one governed operating system.",
    loop: "Operating loop",
    flow: [
      ["Capture demand", "Phone, SMS, web, and manual requests become structured customer and service records."],
      ["Qualify and sell", "Teams manage opportunities, inspections, quotes, approvals, and follow-up in one context."],
      ["Schedule and dispatch", "Match work with technicians, availability, territory, skills, and customer preferences."],
      ["Execute in the field", "Mobile tasks, forms, evidence, status, completion, payment, and service history stay connected."],
    ],
    reasons: [
      ["One operating record", "Customer, property, opportunity, visit, work order, payment, and follow-up share the same history."],
      ["Agent-native operation", "External Super Agents can configure and operate workflows through MCP, Skills, or SDK."],
      ["Governed execution", "Permissions, validation, confirmations, audit, idempotency, and human handoff protect critical actions."],
    ],
    rolesLabel: "Typical roles",
    rolesTitle: "One workflow across office and field teams.",
    roles: ["Intake team", "Sales or service advisor", "Dispatcher", "Technician", "Operations manager", "Finance and support"],
    pilotLabel: "Focused pilot",
    pilotTitle: "Start with intake-to-dispatch or quote-to-completion.",
    pilotBody: "Define one measurable workflow, one operating team, and the minimum integrations required to prove value.",
    pilotCta: "Plan a Pilot",
  },
  zh: {
    eyebrow: "家庭服务",
    title: "从首次客户需求，到服务完成与持续跟进。",
    description: "Runory 将多渠道接入、CRM、销售、排期、现场服务、收款与客户留存整合在一个受治理的业务操作系统中。",
    loop: "运营闭环",
    flow: [
      ["承接客户需求", "电话、短信、网页与人工录入的需求，统一转化为结构化客户与服务记录。"],
      ["识别并推进商机", "团队在同一上下文中管理商机、勘查、报价、审批与持续跟进。"],
      ["排期与派工", "结合技师时间、区域、技能与客户偏好完成任务匹配。"],
      ["现场执行", "移动任务、表单、现场凭证、进度、完工、收款与服务历史保持贯通。"],
    ],
    reasons: [
      ["统一业务记录", "客户、房产、商机、上门、工单、收款与跟进共享同一份完整历史。"],
      ["Agent 原生操作", "外部超级 Agent 可通过 MCP、Skills 或 SDK 配置并操作业务流程。"],
      ["受治理的执行", "权限、校验、确认、审计、幂等与人工接管共同保护关键业务动作。"],
    ],
    rolesLabel: "典型角色",
    rolesTitle: "一套流程贯通办公室与现场团队。",
    roles: ["接单客服", "销售或服务顾问", "调度员", "现场技师", "运营经理", "财务与支持团队"],
    pilotLabel: "聚焦试点",
    pilotTitle: "从“接单到派工”或“报价到完工”开始。",
    pilotBody: "选择一个可衡量的流程、一支实际运营团队，以及验证价值所需的最少集成。",
    pilotCta: "规划试点",
  },
} as const;

export default function HomeServicesScenarioPage() {
  const { locale } = useI18n();
  const copy = content[locale];

  return <main className="min-h-screen bg-[#fbf8f1] text-neutral-950"><MarketingHeader />
    <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 sm:py-24 lg:px-10">
      <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{copy.eyebrow}</p>
      <h1 className="mt-5 max-w-4xl font-serif text-4xl leading-[1.06] tracking-[-.04em] sm:text-7xl sm:leading-[1.02]">{copy.title}</h1>
      <p className="mt-6 max-w-3xl text-base leading-7 text-neutral-600 sm:mt-7 sm:text-lg sm:leading-8">{copy.description}</p>
    </section>
    <section className="border-y border-black/10 bg-white py-14 sm:py-20"><div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{copy.loop}</p><div className="mt-8 grid gap-5 md:grid-cols-2">{copy.flow.map(([title, body], i) => <article className="flex min-h-[220px] flex-col rounded-2xl border border-black/10 bg-[#fbf8f1] p-6 sm:p-7" key={title}><span className="text-sm font-semibold text-orange-600">0{i + 1}</span><h2 className="mt-5 text-xl font-semibold leading-snug">{title}</h2><p className="mt-3 leading-7 text-neutral-600">{body}</p></article>)}</div></div></section>
    <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 sm:py-20 lg:px-10"><div className="grid gap-6 lg:grid-cols-3">{copy.reasons.map(([title, body]) => <article key={title} className="min-h-[210px] rounded-2xl border border-black/10 bg-white p-6 sm:p-7"><h2 className="text-xl font-semibold leading-snug">{title}</h2><p className="mt-3 leading-7 text-neutral-600">{body}</p></article>)}</div></section>
    <section className="bg-neutral-950 py-14 text-white sm:py-20"><div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:px-10"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-300">{copy.rolesLabel}</p><h2 className="mt-4 font-serif text-3xl leading-tight sm:text-4xl">{copy.rolesTitle}</h2></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{copy.roles.map((role) => <div key={role} className="min-h-12 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-neutral-200">{role}</div>)}</div></div></section>
    <section className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-14 sm:px-6 sm:py-20 md:flex-row md:items-center lg:px-10"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{copy.pilotLabel}</p><h2 className="mt-4 max-w-3xl font-serif text-3xl leading-tight tracking-[-.03em] sm:text-4xl">{copy.pilotTitle}</h2><p className="mt-3 max-w-2xl leading-7 text-neutral-600">{copy.pilotBody}</p></div><Link href="/pilot" className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">{copy.pilotCta} <ArrowRight size={18} /></Link></section>
    <MarketingFooter /></main>;
}
