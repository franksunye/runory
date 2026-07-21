"use client";

import { LocaleLink } from "@/components/LocaleLink";
import { ArrowRight } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { useI18n } from "@/i18n/locale-provider";

const content = {
  en: {
    eyebrow: "HVAC Operations",
    title: "Turn HVAC demand into a connected service and maintenance operation.",
    description: "Runory connects voice intake, CRM, sales, equipment context, scheduling, field execution, and recurring maintenance in one governed runtime.",
    loop: "Operating loop",
    flow: [
      ["Capture the request", "Calls, messages, and web requests capture urgency, equipment, symptoms, location, and customer intent."],
      ["Qualify and plan", "CRM and sales workflows manage service agreements, quotes, approvals, and maintenance opportunities."],
      ["Schedule and dispatch", "Coordinate technician skills, territory, availability, parts readiness, and customer windows."],
      ["Complete and retain", "Field findings, work performed, equipment history, payment, and the next maintenance action stay linked."],
    ],
    reasons: [
      ["Equipment-aware context", "Customer, site, asset, warranty, visit, and maintenance history remain available throughout the workflow."],
      ["Reactive and recurring work", "Urgent service calls and planned maintenance use the same operating model without duplicate systems."],
      ["Governed Agent operation", "External Agents can create, schedule, update, and follow up through controlled Runory commands."],
    ],
    rolesLabel: "Typical roles",
    rolesTitle: "One operating context from front desk to field technician.",
    roles: ["Customer service", "Comfort advisor", "Dispatcher", "HVAC technician", "Service manager", "Maintenance coordinator"],
    pilotLabel: "Focused pilot",
    pilotTitle: "Start with reactive service intake or recurring maintenance.",
    pilotBody: "Launch one measurable HVAC workflow, connect the essential records, and validate response time, scheduling visibility, and completion discipline.",
    pilotCta: "Plan a Pilot",
  },
  zh: {
    eyebrow: "暖通空调运营",
    title: "将暖通空调需求转化为贯通的服务与维保运营。",
    description: "Runory 将语音接入、CRM、销售、设备档案、排期、现场执行与周期性维保整合在同一个受治理的运行时中。",
    loop: "运营闭环",
    flow: [
      ["承接服务需求", "从电话、消息与网页请求中识别紧急程度、设备、故障现象、位置与客户意图。"],
      ["识别并制定方案", "通过 CRM 与销售流程管理服务协议、报价、审批与维保商机。"],
      ["排期与派工", "综合技师技能、服务区域、可用时间、备件准备与客户时间窗口。"],
      ["完工与客户留存", "现场发现、服务内容、设备历史、收款与下一次维保动作始终保持关联。"],
    ],
    reasons: [
      ["设备上下文贯通", "客户、站点、设备、保修、上门与维保历史在全流程中持续可用。"],
      ["兼顾应急与周期服务", "紧急报修与计划维保共用同一套运营模型，无需重复系统。"],
      ["受治理的 Agent 操作", "外部 Agent 可通过受控的 Runory 指令创建、排期、更新并持续跟进。"],
    ],
    rolesLabel: "典型角色",
    rolesTitle: "从前台客服到现场技师共享同一运营上下文。",
    roles: ["客户服务", "销售顾问", "调度员", "暖通空调技师", "服务经理", "维保协调员"],
    pilotLabel: "聚焦试点",
    pilotTitle: "从应急服务接入或周期性维保开始。",
    pilotBody: "上线一个可衡量的暖通空调流程，连接必要记录，并验证响应速度、排期可见性与完工纪律。",
    pilotCta: "规划试点",
  },
} as const;

export default function HvacPage() {
  const { locale } = useI18n();
  const copy = content[locale];

  return <main className="min-h-screen bg-[#fbf8f1] text-neutral-950"><MarketingHeader />
    <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 sm:py-24 lg:px-10"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{copy.eyebrow}</p><h1 className="mt-5 max-w-4xl font-serif text-4xl leading-[1.06] tracking-[-.04em] sm:text-7xl sm:leading-[1.02]">{copy.title}</h1><p className="mt-6 max-w-3xl text-base leading-7 text-neutral-600 sm:mt-7 sm:text-lg sm:leading-8">{copy.description}</p></section>
    <section className="border-y border-black/10 bg-white py-14 sm:py-20"><div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{copy.loop}</p><div className="mt-8 grid gap-5 md:grid-cols-2">{copy.flow.map(([title, body], i) => <article key={title} className="flex min-h-[220px] flex-col rounded-2xl border border-black/10 bg-[#fbf8f1] p-6 sm:p-7"><span className="text-sm font-semibold text-orange-600">0{i + 1}</span><h2 className="mt-5 text-xl font-semibold leading-snug">{title}</h2><p className="mt-3 leading-7 text-neutral-600">{body}</p></article>)}</div></div></section>
    <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 sm:py-20 lg:px-10"><div className="grid gap-6 lg:grid-cols-3">{copy.reasons.map(([title, body]) => <article key={title} className="min-h-[210px] rounded-2xl border border-black/10 bg-white p-6 sm:p-7"><h2 className="text-xl font-semibold leading-snug">{title}</h2><p className="mt-3 leading-7 text-neutral-600">{body}</p></article>)}</div></section>
    <section className="bg-neutral-950 py-14 text-white sm:py-20"><div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:px-10"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-300">{copy.rolesLabel}</p><h2 className="mt-4 font-serif text-3xl leading-tight sm:text-4xl">{copy.rolesTitle}</h2></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{copy.roles.map((role) => <div key={role} className="min-h-12 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-neutral-200">{role}</div>)}</div></div></section>
    <section className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-14 sm:px-6 sm:py-20 md:flex-row md:items-center lg:px-10"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{copy.pilotLabel}</p><h2 className="mt-4 max-w-3xl font-serif text-3xl leading-tight tracking-[-.03em] sm:text-4xl">{copy.pilotTitle}</h2><p className="mt-3 max-w-2xl leading-7 text-neutral-600">{copy.pilotBody}</p></div><LocaleLink href="/pilot" className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">{copy.pilotCta} <ArrowRight size={18} /></LocaleLink></section>
    <MarketingFooter /></main>;
}
