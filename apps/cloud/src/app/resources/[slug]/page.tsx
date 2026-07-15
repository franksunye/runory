import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { LOCALE_COOKIE } from "@/i18n/config";

const articles = {
  en: {
    "agent-native-field-service": { category: "Strategy", title: "What Agent-native field service software actually means", description: "Why the Agent should be the operating interface while the business system remains the governed source of truth.", sections: [["The Agent is not the system of record", "A capable Agent can understand intent, coordinate steps, and reduce interface friction. But records, permissions, workflow state, approvals, and audit still need a deterministic business runtime."], ["A useful architecture", "External Super Agent → MCP, Skills, or SDK → governed Runory commands → CRM, Sales, FSM, Voice, and operational records."]] },
    "voice-intake-to-work-order": { category: "Operations", title: "From phone call to work order without duplicate entry", description: "A practical operating model for converting conversations into business execution.", sections: [["Treat every conversation as operational input", "A phone call should become structured business context, not only a recording."], ["Connect intake to the service lifecycle", "Conversation, customer, lead, work order, schedule, and follow-up should share one operational context."]] },
    "focused-fsm-pilot": { category: "Implementation", title: "How to scope a field service pilot that can launch quickly", description: "Choose one measurable workflow and prove operational value before expanding.", sections: [["Start with one operating loop", "A strong pilot covers one meaningful workflow end to end."], ["Measure operational outcomes", "Track response time, follow-up, scheduling visibility, and data quality."]] },
    "external-agents-for-sme-software": { category: "Strategy", title: "Why External Agents Are the Future of SME Software", description: "How Super Agents and business runtimes will reshape the way small and medium businesses operate software.", sections: [["Traditional SaaS has reached its limit", "SMEs often combine many applications to operate their business. More software creates more interfaces, configuration, and integration burden."], ["The Agent should become the operating interface", "Users should express intent naturally. The Agent can coordinate work, while a governed business runtime maintains truth, rules, and execution safety."], ["Runory separates intelligence from execution", "External Super Agent → MCP, Skills, or SDK → Runory Runtime → Business Actions. Intelligence can evolve while business operations remain controlled."], ["A new model for SME software", "Runory combines reusable business modules with an Agent-native runtime, reducing software complexity while increasing flexibility."]] }
  },
  zh: {
    "agent-native-field-service": { category: "战略", title: "什么是真正的 Agent-native 现场服务软件", description: "为什么 Agent 应成为操作界面，而业务系统仍然是受治理的事实来源。", sections: [["Agent 不是业务事实系统", "客户记录、权限、流程状态、审批和审计仍需要确定性的业务运行时。"], ["一种实用架构", "外部超级 Agent → MCP、Skills 或 SDK → 受治理的 Runory 指令。"]] },
    "voice-intake-to-work-order": { category: "运营", title: "从电话到工单：避免重复录入", description: "将沟通转化为 CRM、销售与 FSM 执行的运营模型。", sections: [["把每次沟通视为运营输入", "电话应转化为结构化业务上下文。"], ["连接完整服务生命周期", "客户、线索、工单、排期和跟进应保持统一上下文。"]] },
    "focused-fsm-pilot": { category: "实施", title: "如何规划快速上线的 FSM 试点", description: "选择可衡量流程并验证运营价值。", sections: [["从一个运营闭环开始", "先证明核心流程，再扩展范围。"], ["衡量运营结果", "关注响应、跟进、排期和数据质量。"]] },
    "external-agents-for-sme-software": { category: "战略", title: "为什么外部超级 Agent 将成为 SME 软件的新范式", description: "超级 Agent 与业务运行时将改变中小企业使用软件的方式。", sections: [["传统 SaaS 正面临复杂度问题", "企业需要越来越多软件组合完成业务，但系统数量和集成成本持续增加。"], ["Agent 应成为业务操作入口", "用户表达意图，Agent 协调执行，业务运行时负责规则、权限和事实。"], ["Runory 分离智能与执行", "外部超级 Agent → MCP、Skills 或 SDK → Runory Runtime → 业务动作。"], ["SME 软件的新模型", "Runory 将可复用业务模块与 Agent-native Runtime 结合，让软件更灵活、更容易适配。"]] }
  }
} as const;

type Slug = keyof typeof articles.en;
type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() { return Object.keys(articles.en).map((slug) => ({ slug })); }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = (await cookies()).get(LOCALE_COOKIE)?.value === "zh" ? "zh" : "en";
  const article = articles[locale][slug as Slug];
  return article ? { title: article.title, description: article.description } : {};
}

export default async function ResourceArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const locale = (await cookies()).get(LOCALE_COOKIE)?.value === "zh" ? "zh" : "en";
  const article = articles[locale][slug as Slug];
  if (!article) notFound();
  return <main className="min-h-screen bg-[#fbf8f1] text-neutral-950"><MarketingHeader /><article><header className="mx-auto max-w-4xl px-5 py-16"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{article.category}</p><h1 className="mt-5 font-serif text-5xl">{article.title}</h1><p className="mt-7 text-lg text-neutral-600">{article.description}</p></header><div className="mx-auto max-w-4xl px-5 pb-16">{article.sections.map(([heading, body]) => <section key={heading} className="mt-10"><h2 className="font-serif text-3xl">{heading}</h2><p className="mt-4 text-neutral-700">{body}</p></section>)}</div></article><MarketingFooter /></main>;
}
