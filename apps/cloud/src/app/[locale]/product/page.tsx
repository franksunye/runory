"use client";

import { LocaleLink } from "@/components/LocaleLink";
import { ArrowRight, CheckCircle2, Layers3, MessagesSquare, ShieldCheck, Workflow } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { useI18n } from "@/i18n/locale-provider";
import { marketingCopy } from "@/i18n/marketing-copy";

export default function ProductPage() {
  const { locale } = useI18n();
  const c = marketingCopy[locale].product;
  const zh = locale === "zh";
  const journey = zh
    ? ["全渠道接单", "客户与线索", "跟进与报价", "排期与派工", "现场执行", "收款与售后"]
    : ["Omnichannel intake", "Customer & lead", "Follow-up & quote", "Schedule & dispatch", "Field execution", "Payment & after-sales"];
  const foundations = zh
    ? [["统一业务对象", "客户、服务地址、商机、报价、工单、上门、发票与服务历史共享同一业务上下文。"], ["可适配工作空间", "字段、表单、角色、流程、通知与报表通过配置和受管理扩展适配业务。"], ["面向外部 Agent", "MCP、Skills 与 SDK 将清晰、版本化的业务能力暴露给外部超级 Agent。"], ["受治理执行", "权限、校验、确认、幂等、审计与人工接管保护关键业务动作。"]]
    : [["One business model", "Customers, sites, opportunities, quotes, work orders, visits, invoices, and service history share one operating context."], ["Adaptive workspaces", "Fields, forms, roles, workflows, notifications, and reports adapt through configuration and managed extensions."], ["Built for external Agents", "MCP, Skills, and SDK expose clear, versioned business capabilities to external Super Agents."], ["Governed execution", "Permissions, validation, confirmation, idempotency, audit, and human handoff protect important business actions."]];
  const icons = [Layers3, Workflow, MessagesSquare, ShieldCheck];

  return <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
    <MarketingHeader />
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-24 lg:px-10">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">{c.eyebrow}</p>
      <h1 className="mt-6 max-w-5xl font-serif text-5xl leading-[1.02] tracking-[-0.05em] sm:text-7xl">{c.title}</h1>
      <p className="mt-8 max-w-3xl text-lg leading-8 text-neutral-600">{c.subtitle}</p>
      <div className="mt-10 flex flex-wrap gap-3"><LocaleLink href="/pilot" className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">{c.cta} <ArrowRight size={18}/></LocaleLink><LocaleLink href="/platform" className="inline-flex rounded-full border border-black/15 bg-white px-6 py-3 font-semibold">{zh ? "了解平台架构" : "Explore the Platform"}</LocaleLink></div>
    </section>

    <section className="border-y border-black/10 bg-white py-20"><div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10"><div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{zh ? "端到端产品旅程" : "End-to-end product journey"}</p><h2 className="mt-4 font-serif text-4xl tracking-[-.035em] sm:text-5xl">{zh ? "从第一次客户沟通，到服务完成与持续运营。" : "From the first customer conversation to completed and recurring service."}</h2></div><div className="mt-12 grid gap-3 md:grid-cols-3 lg:grid-cols-6">{journey.map((item,index)=><div key={item} className="rounded-2xl border border-black/10 bg-[#fbf8f1] p-5"><span className="text-xs font-semibold text-orange-600">0{index+1}</span><p className="mt-7 font-semibold">{item}</p></div>)}</div></div></section>

    <section className="py-20 sm:py-24"><div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10"><div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{zh ? "三大核心 Pack" : "Three core packs"}</p><h2 className="mt-4 font-serif text-4xl tracking-[-.035em] sm:text-5xl">{zh ? "不是三个割裂工具，而是一条连续业务链路。" : "Not three disconnected tools, but one continuous operating loop."}</h2></div><div className="mt-12 grid gap-5 md:grid-cols-3">{c.packs.map(([title,body],index)=><article key={title} className="rounded-3xl border border-black/10 bg-white p-7 sm:p-8"><span className="text-sm font-semibold text-orange-600">0{index+1}</span><h3 className="mt-8 text-2xl font-semibold">{title}</h3><p className="mt-4 leading-7 text-neutral-600">{body}</p><div className="mt-7 flex items-center gap-2 text-sm font-medium text-neutral-700"><CheckCircle2 size={17} className="text-orange-600"/>{zh ? "共享数据、状态与审计" : "Shared data, state, and audit"}</div></article>)}</div></div></section>

    <section className="bg-neutral-950 py-20 text-white sm:py-24"><div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10"><div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-300">{zh ? "产品基础" : "Product foundation"}</p><h2 className="mt-4 font-serif text-4xl tracking-[-.035em] sm:text-5xl">{zh ? "轻量、可配置，并且可以被 Agent 安全操作。" : "Lightweight, configurable, and safe for Agents to operate."}</h2></div><div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">{foundations.map(([title,body],i)=>{const Icon=icons[i];return <article key={title} className="rounded-2xl border border-white/10 bg-white/5 p-6"><Icon size={22} className="text-orange-300"/><h3 className="mt-5 text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-neutral-400">{body}</p></article>})}</div></div></section>

    <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6 sm:py-24 lg:px-10"><div className="flex flex-col justify-between gap-8 rounded-[28px] border border-black/10 bg-white p-8 sm:p-12 lg:flex-row lg:items-center"><div><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{zh ? "聚焦试点" : "Focused Pilot"}</p><h2 className="mt-4 max-w-3xl font-serif text-4xl tracking-[-.035em]">{zh ? "从一个真实流程开始，验证完整产品闭环。" : "Start with one real workflow and validate the complete product loop."}</h2><p className="mt-4 max-w-2xl leading-7 text-neutral-600">{zh ? "选择接单、CRM、销售或 FSM 中最重要的一条流程，在有限范围内快速上线。" : "Choose the most important intake, CRM, Sales, or FSM workflow and launch it within a focused scope."}</p></div><LocaleLink href="/pilot" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">{c.cta}<ArrowRight size={18}/></LocaleLink></div></section>
    <MarketingFooter />
  </main>;
}