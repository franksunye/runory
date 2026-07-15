import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { LOCALE_COOKIE } from "@/i18n/config";

const articles = {
  en: {
    "agent-native-field-service": { category: "Strategy", title: "What Agent-native field service software actually means", description: "Why the Agent should be the operating interface while the business system remains the governed source of truth.", sections: [["The Agent is not the system of record", "A capable Agent can understand intent, coordinate steps, and reduce interface friction. But customer records, permissions, workflow state, approvals, and audit still need a deterministic business runtime."], ["Separate intelligence from execution", "The Agent decides what should happen. Runory validates whether it may happen, applies business rules, performs the command, and records the result. This separation makes Agent-driven operations practical for real businesses."], ["Why this matters for field service", "Field service combines customer communication, quoting, schedules, people, locations, evidence, payment, and after-sales. These workflows benefit from natural-language operation, but they cannot tolerate ambiguous state or uncontrolled writes."], ["A useful architecture", "External Super Agent → MCP, Skills, or SDK → governed Runory commands → CRM, Sales, FSM, Voice, and operational records. The Agent remains replaceable; the business truth remains stable."]] },
    "voice-intake-to-work-order": { category: "Operations", title: "From phone call to work order without duplicate entry", description: "A practical operating model for converting voice and messaging conversations into CRM, Sales, and FSM execution.", sections: [["Treat every conversation as operational input", "A phone call should not end as an isolated recording or transcript. The system should identify the customer, capture intent, structure service details, confirm key facts, and create the correct business record."], ["Use a controlled intake sequence", "Answer → identify → capture → confirm → create work → follow up. Each stage should expose clear data requirements and human-handoff rules."], ["Connect intake to the full service lifecycle", "A qualified request may create or update a customer, lead, opportunity, work order, visit, and follow-up task. The conversation history should remain attached to the same operational context."], ["Design for failure", "Provider timeouts, duplicate callbacks, incomplete identities, and ambiguous requests are normal. Idempotency, replay, visible errors, confirmation, and escalation are core product capabilities—not edge cases."]] },
    "focused-fsm-pilot": { category: "Implementation", title: "How to scope a field service pilot that can launch quickly", description: "Choose one measurable workflow, constrain integrations, and prove operational value before expanding.", sections: [["Start with one operating loop", "A strong pilot covers one meaningful workflow end to end—for example, intake to scheduled visit, or inspection to quote approval. Avoid a broad transformation program."], ["Use a real team and real rules", "The pilot should include actual users, roles, sample data, business rules, and exceptions. A demo can validate interface quality; a pilot must validate operating reality."], ["Constrain the first integration scope", "Every external system adds uncertainty. Begin with the minimum integrations required to prove the workflow, then expand after the core operating loop is stable."], ["Measure operational outcomes", "Useful measures include response time, missed follow-up, administrative effort, scheduling visibility, quote progression, completion discipline, and data quality."]] }
  },
  zh: {
    "agent-native-field-service": { category: "战略", title: "什么是真正的 Agent-native 现场服务软件", description: "为什么 Agent 应成为操作界面，而业务系统仍然是受治理的事实来源。", sections: [["Agent 不是业务事实系统", "高能力 Agent 可以理解意图、协调步骤并降低界面摩擦，但客户记录、权限、流程状态、审批与审计仍然需要确定性的业务运行时。"], ["将智能与执行分离", "Agent 判断应该发生什么，Runory 校验是否允许、应用业务规则、执行指令并记录结果。这种分离让 Agent 驱动的运营能够真正用于企业。"], ["为什么现场服务尤其需要这一点", "现场服务同时涉及客户沟通、报价、排期、人员、地点、证据、收款和售后。自然语言能够提升效率，但业务状态不能含糊，写操作也不能失控。"], ["一种实用架构", "外部超级 Agent → MCP、Skills 或 SDK → 受治理的 Runory 指令 → CRM、销售、FSM、语音与运营记录。Agent 可以替换，业务事实保持稳定。"]] },
    "voice-intake-to-work-order": { category: "运营", title: "从电话到工单：避免重复录入", description: "将语音与消息对话转化为 CRM、销售与 FSM 执行的务实运营模型。", sections: [["把每次沟通视为运营输入", "电话不应只留下孤立录音或转写。系统应识别客户、采集需求、结构化服务信息、确认关键事实并创建正确的业务记录。"], ["采用受控接单流程", "接听 → 识别 → 采集 → 确认 → 创建工单 → 跟进。每个阶段都应明确数据要求与人工接管规则。"], ["连接完整服务生命周期", "合格需求可能创建或更新客户、线索、商机、工单、上门任务与跟进事项。所有会话历史都应保留在同一业务上下文中。"], ["为失败而设计", "服务商超时、重复回调、身份不完整与需求含糊都是常态。幂等、重放、可见错误、确认和升级不是边缘能力，而是核心产品能力。"]] },
    "focused-fsm-pilot": { category: "实施", title: "如何规划一个能够快速上线的 FSM 试点", description: "选择一个可衡量流程、控制集成范围，并在扩展前验证运营价值。", sections: [["从一个运营闭环开始", "高质量试点应覆盖一个有意义的端到端流程，例如从接单到已排期上门，或从勘查到报价审批。避免一开始就做宽泛转型。"], ["使用真实团队与真实规则", "试点应包含真实用户、角色、样例数据、业务规则和异常。演示可以验证界面，试点必须验证真实运营。"], ["控制首期集成范围", "每个外部系统都会增加不确定性。先接入证明流程所必需的最少系统，在核心闭环稳定后再扩展。"], ["衡量运营结果", "有效指标包括响应时间、漏跟进、管理工作量、排期可见性、报价推进、完工规范和数据质量。"]] }
  }
} as const;

type Slug = keyof typeof articles.en;
type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() { return Object.keys(articles.en).map((slug) => ({ slug })); }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = (await cookies()).get(LOCALE_COOKIE)?.value === "zh" ? "zh" : "en";
  const article = articles[locale][slug as Slug];
  if (!article) return {};
  return { title: article.title, description: article.description, alternates: { canonical: `/resources/${slug}` }, openGraph: { title: article.title, description: article.description, type: "article" } };
}

export default async function ResourceArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const locale = (await cookies()).get(LOCALE_COOKIE)?.value === "zh" ? "zh" : "en";
  const article = articles[locale][slug as Slug];
  if (!article) notFound();
  return <main className="min-h-screen bg-[#fbf8f1] text-neutral-950"><MarketingHeader /><article><header className="mx-auto max-w-4xl px-5 py-16 sm:px-6 sm:py-24"><p className="text-sm font-semibold uppercase tracking-[.18em] text-orange-600">{article.category}</p><h1 className="mt-5 font-serif text-5xl leading-[1.04] tracking-[-.04em] sm:text-6xl">{article.title}</h1><p className="mt-7 text-lg leading-8 text-neutral-600">{article.description}</p></header><div className="border-y border-black/10 bg-white"><div className="mx-auto max-w-4xl px-5 py-12 sm:px-6 sm:py-16">{article.sections.map(([heading, body], index) => <section key={heading} className={index === 0 ? "" : "mt-12 border-t border-black/10 pt-12"}><h2 className="font-serif text-3xl tracking-[-.025em]">{heading}</h2><p className="mt-4 text-base leading-8 text-neutral-700">{body}</p></section>)}</div></div></article><MarketingFooter /></main>;
}
