"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  Droplets,
  Heater,
  House,
  MessagesSquare,
  ShieldCheck,
  Workflow,
  Wrench,
} from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { useI18n } from "@/i18n/locale-provider";

const industryIcons = [House, Heater, Droplets, Wrench, Building2];

export default function SolutionsPage() {
  const { locale } = useI18n();
  const zh = locale === "zh";

  const copy = zh
    ? {
        eyebrow: "行业解决方案",
        title: "一套受治理的运营系统，适配服务企业真实的工作方式。",
        subtitle:
          "Runory 将全渠道接单、CRM、销售与 FSM 连接为一个业务闭环，并通过行业配置适配不同服务模式，而不是为每个行业重新开发一套系统。",
        proof: ["电话与消息直接进入业务流程", "外部超级 Agent 可安全操作", "一个统一的客户与工单上下文"],
        industriesEyebrow: "行业起点",
        industriesTitle: "从成熟场景开始，再扩展到完整运营系统。",
        explore: "查看解决方案",
        comingSoon: "即将推出",
        industries: [
          {
            title: "家庭服务",
            body: "统一承接客户需求、报价、排期、派工、现场执行、收款与售后跟进。",
            flow: "来电 → 客户 → 商机 → 上门任务 → 完工",
            href: "/solutions/home-services",
          },
          {
            title: "暖通空调",
            body: "支持紧急报修、设备档案、维保计划、周期上门与技师调度。",
            flow: "报修 → 设备 → 服务任务 → 技师 → 服务历史",
            href: "/solutions/hvac",
          },
          {
            title: "防水与维修",
            body: "管理勘查、方案、报价、施工、过程证据、变更、验收与售后。",
            flow: "线索 → 勘查 → 报价 → 项目 → 验收",
            href: "/solutions/waterproofing",
          },
          {
            title: "管道维修",
            body: "将紧急电话转化为明确工单，协调技师，并在全过程持续通知客户。",
            flow: "紧急来电 → 判断 → 派工 → 维修 → 回访",
            href: null,
          },
          {
            title: "安装服务",
            body: "协调长周期项目、里程碑、现场团队、文档、分期收款与最终交付。",
            flow: "商机 → 合同 → 里程碑 → 现场执行 → 交付",
            href: null,
          },
        ],
        differentiationEyebrow: "为什么是 Runory",
        differentiationTitle: "不是普通 FSM，而是面向 Agent 时代的业务运行系统。",
        differentiation: [
          [MessagesSquare, "全渠道接单", "电话、AI 语音、短信、网页与人工录入，统一形成结构化客户、线索和工单。"],
          [Workflow, "一体化业务闭环", "CRM、销售、排期、现场执行、收款与跟进共享同一份业务上下文。"],
          [Bot, "外部超级 Agent", "Codex、ChatGPT、Claude、Cursor、Trae 或企业 Agent 可通过 MCP、Skills 或 SDK 操作。"],
          [ShieldCheck, "受治理执行", "权限、校验、确认、幂等、审计与人工接管，让 Agent 能力进入真实业务。"],
        ],
        scenariosEyebrow: "真实运营场景",
        scenariosTitle: "不同服务类型，遵循同一套连接、可控的运营纪律。",
        scenarios: [
          ["紧急维修", ["客户来电", "识别身份与紧急程度", "创建工单并匹配技师", "完成服务并更新客户"]],
          ["勘查与报价", ["安排上门勘查", "记录现场证据", "生成并审批方案", "签约后进入项目执行"]],
          ["周期服务", ["维保计划到期", "自动创建服务任务", "客户确认时间", "更新设备与服务历史"]],
        ],
        operatingEyebrow: "统一业务模型",
        operatingTitle: "行业不同，但核心运营对象保持一致。",
        operatingBody:
          "客户、服务地址、资产、商机、报价、工单、上门任务、项目、收款和服务历史，运行在同一个受治理的业务模型中。",
        operatingItems: ["客户与服务地址", "商机与报价", "工单与项目", "排期与现场任务", "收款与售后", "审计与运营分析"],
        ctaTitle: "从一个高价值流程开始。",
        ctaBody: "成熟场景通常可在 1–2 周内形成可运行的试点闭环。",
        cta: "规划试点",
      }
    : {
        eyebrow: "Industry Solutions",
        title: "One governed operating system, adapted to how service businesses actually work.",
        subtitle:
          "Runory connects omnichannel intake, CRM, Sales, and FSM into one operating loop, then adapts through industry configuration instead of rebuilding the product for every vertical.",
        proof: ["Conversations become business work", "External Super Agents can operate safely", "One shared customer and work context"],
        industriesEyebrow: "Industry starting points",
        industriesTitle: "Begin with a mature scenario. Expand into a complete operating system.",
        explore: "Explore solution",
        comingSoon: "Coming soon",
        industries: [
          {
            title: "Home Services",
            body: "Unify customer intake, quoting, scheduling, dispatch, field work, payment, and after-service follow-up.",
            flow: "Call → Customer → Opportunity → Visit → Completion",
            href: "/solutions/home-services",
          },
          {
            title: "HVAC",
            body: "Support reactive calls, equipment records, maintenance plans, recurring visits, and technician scheduling.",
            flow: "Request → Asset → Work order → Technician → Service history",
            href: "/solutions/hvac",
          },
          {
            title: "Waterproofing & Repair",
            body: "Manage inspection, proposal, quote, project execution, evidence, change, completion, and after-sales.",
            flow: "Lead → Inspection → Quote → Project → Acceptance",
            href: "/solutions/waterproofing",
          },
          {
            title: "Plumbing",
            body: "Convert urgent calls into identified work, coordinate technicians, and keep customers informed throughout.",
            flow: "Urgent call → Triage → Dispatch → Repair → Follow-up",
            href: null,
          },
          {
            title: "Installation Services",
            body: "Coordinate longer-running jobs, milestones, field teams, documents, staged payments, and handover.",
            flow: "Opportunity → Contract → Milestones → Field work → Handover",
            href: null,
          },
        ],
        differentiationEyebrow: "Why Runory",
        differentiationTitle: "Not another FSM interface. An operating runtime for the Agent era.",
        differentiation: [
          [MessagesSquare, "Omnichannel intake", "Phone, AI voice, SMS, web, and manual entry become structured customers, leads, and work."],
          [Workflow, "One operating loop", "CRM, Sales, scheduling, field execution, payment, and follow-up share the same business context."],
          [Bot, "External Super Agents", "Codex, ChatGPT, Claude, Cursor, Trae, or enterprise Agents can operate through MCP, Skills, or SDK."],
          [ShieldCheck, "Governed execution", "Permissions, validation, confirmation, idempotency, audit, and human handoff bring Agents into real operations."],
        ],
        scenariosEyebrow: "Real operating scenarios",
        scenariosTitle: "Different services. The same connected, controlled operating discipline.",
        scenarios: [
          ["Emergency repair", ["Customer calls", "Identity and urgency captured", "Work created and technician matched", "Service completed and customer updated"]],
          ["Inspection & quote", ["Site visit scheduled", "Evidence recorded", "Proposal generated and approved", "Signed work enters project execution"]],
          ["Recurring service", ["Maintenance plan becomes due", "Service visit created", "Customer confirms timing", "Asset and service history updated"]],
        ],
        operatingEyebrow: "Shared business model",
        operatingTitle: "Industries differ. The core operating objects stay consistent.",
        operatingBody:
          "Customers, service locations, assets, opportunities, quotes, work orders, visits, projects, payments, and service history run in one governed business model.",
        operatingItems: ["Customers & locations", "Opportunities & quotes", "Work orders & projects", "Scheduling & field tasks", "Payments & after-sales", "Audit & operational analytics"],
        ctaTitle: "Start with one high-value workflow.",
        ctaBody: "Mature scenarios can often become a working pilot loop in 1–2 weeks.",
        cta: "Plan a Pilot",
      };

  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-24 lg:px-10">
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{copy.eyebrow}</p>
        <h1 className="mt-5 max-w-5xl font-serif text-5xl leading-[1.02] tracking-[-.045em] sm:text-7xl">{copy.title}</h1>
        <p className="mt-7 max-w-3xl text-lg leading-8 text-neutral-600">{copy.subtitle}</p>
        <div className="mt-9 flex flex-wrap gap-3">
          {copy.proof.map((item) => (
            <span key={item} className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-neutral-700">
              <CheckCircle2 size={16} className="text-orange-600" />
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="border-y border-black/10 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{copy.industriesEyebrow}</p>
          <h2 className="mt-4 max-w-3xl font-serif text-4xl tracking-[-.035em] sm:text-5xl">{copy.industriesTitle}</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {copy.industries.map((item, index) => {
              const Icon = industryIcons[index];
              const content = (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <Icon size={24} className="text-orange-600" />
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.href ? "bg-orange-100 text-orange-700" : "bg-neutral-200 text-neutral-600"}`}>
                      {item.href ? copy.explore : copy.comingSoon}
                    </span>
                  </div>
                  <h3 className="mt-7 text-2xl font-semibold">{item.title}</h3>
                  <p className="mt-3 max-w-xl text-sm leading-7 text-neutral-600">{item.body}</p>
                  <p className="mt-6 border-t border-black/10 pt-5 text-sm font-semibold text-neutral-800">{item.flow}</p>
                  {item.href && (
                    <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-orange-700">
                      {copy.explore} <ArrowRight size={16} className="transition group-hover:translate-x-1" />
                    </span>
                  )}
                </>
              );

              return item.href ? (
                <Link key={item.title} href={item.href} className="group rounded-[24px] border border-black/10 bg-[#fbf8f1] p-6 transition hover:-translate-y-1 hover:border-orange-300 hover:shadow-[0_24px_60px_rgba(50,35,20,.10)] sm:p-7">
                  {content}
                </Link>
              ) : (
                <article key={item.title} className="rounded-[24px] border border-black/10 bg-neutral-50 p-6 sm:p-7">
                  {content}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{copy.differentiationEyebrow}</p>
          <h2 className="mt-4 max-w-4xl font-serif text-4xl tracking-[-.035em] sm:text-5xl">{copy.differentiationTitle}</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {copy.differentiation.map(([Icon, title, body]) => (
              <article key={String(title)} className="rounded-[22px] border border-black/10 bg-white p-6">
                <Icon size={22} className="text-orange-600" />
                <h3 className="mt-6 text-lg font-semibold">{title as string}</h3>
                <p className="mt-3 text-sm leading-7 text-neutral-600">{body as string}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-neutral-950 py-16 text-white sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-300">{copy.scenariosEyebrow}</p>
          <h2 className="mt-4 max-w-3xl font-serif text-4xl tracking-[-.035em] sm:text-5xl">{copy.scenariosTitle}</h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {copy.scenarios.map(([title, steps]) => (
              <article key={String(title)} className="rounded-[24px] border border-white/10 bg-white/5 p-5 sm:p-6">
                <h3 className="text-lg font-semibold">{title as string}</h3>
                <div className="mt-6 space-y-3">
                  {(steps as string[]).map((step, index) => (
                    <div key={step} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-neutral-200">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-orange-400/15 text-xs text-orange-300">{index + 1}</span>
                      {step}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-black/10 bg-white py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[.85fr_1.15fr] lg:px-10">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{copy.operatingEyebrow}</p>
            <h2 className="mt-4 font-serif text-4xl tracking-[-.035em]">{copy.operatingTitle}</h2>
            <p className="mt-5 leading-8 text-neutral-600">{copy.operatingBody}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {copy.operatingItems.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-black/10 bg-[#fbf8f1] p-5 text-sm font-semibold text-neutral-800">
                <CheckCircle2 size={17} className="shrink-0 text-orange-600" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-16 sm:px-6 sm:py-20 md:flex-row md:items-center lg:px-10">
        <div>
          <h2 className="font-serif text-4xl tracking-[-.035em]">{copy.ctaTitle}</h2>
          <p className="mt-3 text-neutral-600">{copy.ctaBody}</p>
        </div>
        <Link href="/pilot" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-neutral-950 px-6 py-3 font-semibold text-white">
          {copy.cta} <ArrowRight size={18} />
        </Link>
      </section>

      <MarketingFooter />
    </main>
  );
}
