"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, GitBranch, Layers3 } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { useI18n } from "@/i18n/locale-provider";

export default function ResourcesPage() {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const articles = zh ? [
    { slug: "external-agents-for-sme-software", category: "战略", title: "为什么外部超级 Agent 将成为 SME 软件的新范式", summary: "超级 Agent 与受治理的业务运行时，将重塑中小企业使用软件的方式。" },
    { slug: "crm-sales-fsm-operating-loop", category: "产品", title: "CRM + 销售 + FSM：服务企业的一体化运营闭环", summary: "客户获取、销售转化与现场服务不应是割裂系统，而应成为持续运行的完整业务循环。" },
    { slug: "fsm-pilot-in-1-2-weeks", category: "实施", title: "如何在 1–2 周内启动 FSM 试点", summary: "通过聚焦流程、标准模块和 Agent 辅助配置，快速验证真实运营价值。" },
    { slug: "agent-native-field-service", category: "战略", title: "什么是真正的 Agent-native 现场服务软件", summary: "为什么 Agent 应成为操作界面，而业务系统仍然是受治理的事实来源。" },
    { slug: "voice-intake-to-work-order", category: "运营", title: "从电话到工单：避免重复录入", summary: "将语音和消息对话转化为 CRM、销售与 FSM 执行的务实运营模型。" },
    { slug: "focused-fsm-pilot", category: "实施", title: "如何规划一个能够快速上线的 FSM 试点", summary: "选择一个可衡量流程、控制集成范围，并在扩展前验证运营价值。" },
  ] : [
    { slug: "external-agents-for-sme-software", category: "Strategy", title: "Why External Agents Are the Future of SME Software", summary: "How Super Agents and governed business runtimes will reshape the way small and medium businesses operate software." },
    { slug: "crm-sales-fsm-operating-loop", category: "Product", title: "CRM + Sales + FSM: One Operating Loop for Service Businesses", summary: "Why customer acquisition, sales execution, and field operations should work as one connected business loop." },
    { slug: "fsm-pilot-in-1-2-weeks", category: "Implementation", title: "How to Launch an FSM Pilot in 1–2 Weeks", summary: "A focused approach to proving business value quickly with reusable modules and Agent-assisted configuration." },
    { slug: "agent-native-field-service", category: "Strategy", title: "What Agent-native field service software actually means", summary: "Why the Agent should be the operating interface while the business system remains the governed source of truth." },
    { slug: "voice-intake-to-work-order", category: "Operations", title: "From phone call to work order without duplicate entry", summary: "A practical operating model for converting voice and messaging conversations into CRM, Sales, and FSM execution." },
    { slug: "focused-fsm-pilot", category: "Implementation", title: "How to scope a field service pilot that can launch quickly", summary: "Choose one measurable workflow, constrain integrations, and prove operational value before expanding." },
  ];
  const links = zh ? [[BookOpen, "文档", "实施指南、架构与运营参考。", "/docs"], [Layers3, "Packs 与模块", "可复用业务能力与目录结构。", "/packs"], [GitBranch, "开源", "Runtime、SDK、工具与仓库版本。", "/open-source"]] : [[BookOpen, "Documentation", "Implementation guides, architecture, and operational references.", "/docs"], [Layers3, "Packs & Modules", "Reusable business capabilities and catalog structure.", "/packs"], [GitBranch, "Open Source", "Runtime, SDK, tooling, and repository releases.", "/open-source"]];
  return <main className="min-h-screen bg-[#fbf8f1] text-neutral-950"><MarketingHeader /><section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-24 lg:px-10"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{zh ? "资源" : "Resources"}</p><h1 className="mt-5 max-w-4xl font-serif text-5xl leading-[1.03] tracking-[-.045em] sm:text-7xl">{zh ? "面向 Agent 时代的运营思考。" : "Operating ideas for the Agent era."}</h1><p className="mt-7 max-w-2xl text-lg leading-8 text-neutral-600">{zh ? "面向服务企业、产品团队与实施伙伴的务实内容，帮助构建连接的 CRM、销售、语音与 FSM 运营。" : "Practical thinking for service businesses, product teams, and implementation partners building connected CRM, Sales, Voice, and FSM operations."}</p></section><section className="border-y border-black/10 bg-white py-16 sm:py-20"><div className="mx-auto grid max-w-7xl gap-5 px-5 sm:px-6 md:grid-cols-2 lg:grid-cols-3 lg:px-10">{articles.map((article) => <Link key={article.slug} href={`/resources/${article.slug}`} className="group rounded-2xl border border-black/10 bg-[#fbf8f1] p-6 transition hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(50,35,20,.08)]"><span className="text-xs font-semibold uppercase tracking-[.15em] text-orange-600">{article.category}</span><h2 className="mt-5 text-xl font-semibold leading-7">{article.title}</h2><p className="mt-3 text-sm leading-6 text-neutral-600">{article.summary}</p><span className="mt-7 inline-flex items-center gap-2 text-sm font-semibold">{zh ? "阅读文章" : "Read article"} <ArrowRight size={16} className="transition group-hover:translate-x-1" /></span></Link>)}</div></section><section className="mx-auto grid max-w-7xl gap-5 px-5 py-16 sm:px-6 sm:py-20 md:grid-cols-3 lg:px-10">{links.map(([Icon, title, body, href]) => <Link key={String(title)} href={href as string} className="rounded-2xl border border-black/10 bg-white p-6"><Icon size={22} className="text-orange-600" /><h2 className="mt-5 text-lg font-semibold">{title as string}</h2><p className="mt-3 text-sm leading-6 text-neutral-600">{body as string}</p></Link>)}</section><MarketingFooter /></main>;
}
