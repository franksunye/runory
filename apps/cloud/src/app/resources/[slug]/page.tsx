import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { MarketingFooter } from "@/components/marketing-footer";
import { MarketingHeader } from "@/components/marketing-header";
import { LOCALE_COOKIE } from "@/i18n/config";

type Article = {
  category: string;
  title: string;
  description: string;
  readingTime: string;
  sections: readonly (readonly [string, string])[];
  takeaways: readonly string[];
};

const articles = {
  en: {
    "agent-native-field-service": {
      category: "Strategy",
      title: "What Agent-native field service software actually means",
      description: "Why the Agent should become the operating interface while the business system remains the governed source of truth.",
      readingTime: "9 min read",
      sections: [
        ["The term is often used too loosely", "Many products call themselves Agent-native because they add a chat box, a copilot, or a generative assistant to an existing application. That is useful, but it does not change the underlying operating model. A truly Agent-native system assumes that users may express intent in natural language and that an Agent may coordinate work across multiple business capabilities.\n\nThe system must therefore expose safe, structured business actions rather than forcing the Agent to imitate a human clicking through screens. The difference is architectural, not cosmetic."],
        ["The Agent is not the system of record", "A capable Agent can interpret intent, summarize context, recommend next steps, and reduce interface friction. It should not independently own customer records, permissions, workflow state, approvals, pricing rules, or audit history. Those responsibilities belong to a deterministic business runtime.\n\nThis separation protects the company from prompt ambiguity, model drift, unauthorized actions, and incomplete records. Intelligence can remain flexible while execution remains governed."],
        ["The right architecture separates intelligence from execution", "A practical pattern is: External Super Agent → MCP, Skills, or SDK → governed Runory commands → CRM, Sales, FSM, Voice, and operational records. The Agent decides what should happen; Runory validates whether it may happen and records the result.\n\nEvery command should pass through identity, permission, scope, validation, workflow, and audit controls. This makes Agent-driven work observable and reversible instead of opaque."],
        ["Why field service is a strong fit", "Field service operations contain many repetitive but context-sensitive tasks: qualifying an inquiry, confirming an address, creating a work order, finding availability, assigning a technician, recording inspection results, preparing a quote, and following up after service. These tasks are ideal for Agent assistance because they combine language understanding with structured execution.\n\nThey are also operationally sensitive. A wrong appointment, unauthorized discount, or missing audit trail has a direct business cost. That is why a governed runtime matters."],
        ["Agent-native does not mean screenless", "Users will still need dashboards, lists, forms, maps, calendars, reports, and mobile task views. Visual interfaces remain the best way to review state, compare options, and supervise work. The change is that the interface is no longer the only operating surface.\n\nA manager may ask an Agent to summarize overdue jobs, while a dispatcher edits a schedule visually and a technician completes a checklist on mobile. All three should operate on the same business truth."],
        ["Governance becomes a product capability", "Agent-native software must make permissions, approvals, execution limits, and audit visible. Some commands can execute automatically; others should require review. High-risk actions such as refunds, contract changes, data export, or bulk reassignment may need stronger controls.\n\nThe quality of an Agent-native product is therefore not measured only by model intelligence. It is measured by whether the system can safely turn intent into repeatable business outcomes."],
        ["A useful evaluation framework", "When evaluating an Agent-native FSM, ask five questions: Can an external Agent discover available capabilities? Are actions exposed as structured commands? Does every action respect role and workspace scope? Can sensitive actions require approval? Is the resulting business state auditable?\n\nIf the answer to these questions is yes, the product is moving beyond a copilot and toward a true Agent-native operating system."],
      ],
      takeaways: ["Keep the Agent flexible and the business runtime deterministic.", "Expose structured commands rather than relying on UI automation.", "Treat permissions, approvals, and audit as core product capabilities.", "Support Agent, visual UI, and mobile workflows on one source of truth."],
    },
    "voice-intake-to-work-order": {
      category: "Operations",
      title: "From phone call to work order without duplicate entry",
      description: "A practical operating model for converting voice and messaging conversations into CRM, Sales, and FSM execution.",
      readingTime: "10 min read",
      sections: [
        ["A phone call is operational input", "Most service businesses still treat calls as isolated conversations. Information is heard, written down, re-entered into a CRM, copied into a scheduling tool, and later rewritten into a work order. Each handoff introduces delay and error.\n\nA better model treats every conversation as structured operational input. The call is not only recorded; it becomes usable business context."],
        ["Capture the minimum viable context", "A useful intake flow should identify the caller, service address, problem category, urgency, preferred timing, property or asset details, and any safety constraints. It should also capture uncertainty rather than inventing facts.\n\nThe goal is not to collect every possible field during the first call. It is to collect enough information to create a valid lead or work order and determine the next action."],
        ["Identity resolution comes before automation", "The system should first determine whether the caller matches an existing customer, site, asset, contract, or open case. Duplicate customer creation is one of the most common hidden costs in fragmented service software.\n\nWhen identity is uncertain, the intake should create a reviewable candidate rather than silently merging records. Good automation preserves data quality."],
        ["Turn the conversation into business objects", "The conversation should produce structured entities such as customer, contact, lead, service request, work order, appointment request, and follow-up task. These records should remain linked to the original transcript and call metadata.\n\nThat linkage allows teams to verify what the customer said, understand why a field was populated, and continue the conversation without asking the customer to repeat everything."],
        ["Use confidence and exception routing", "Not every conversation should complete automatically. Low confidence, emergency language, billing disputes, unusual service categories, unavailable schedules, and sensitive customer situations should route to a human.\n\nThe best voice workflow is not one that avoids humans. It is one that automates routine work and makes exceptions obvious, contextual, and easy to resolve."],
        ["Connect intake to the full service lifecycle", "The operational value appears when intake flows directly into qualification, quote, appointment, dispatch, field execution, completion, invoice, and follow-up. Conversation, customer, work order, schedule, and service history should share one context.\n\nThis avoids the common failure mode where the AI receptionist works well but the operations team still has to rebuild the request manually."],
        ["Measure the right outcomes", "Track answered-call rate, abandoned-call rate, qualified-request rate, time to first response, duplicate-entry reduction, booking conversion, exception rate, and downstream data completeness. These metrics show whether voice automation improves operations rather than merely reducing call handling time.\n\nA successful system should make customers repeat less, help teams respond faster, and create cleaner operational records."],
      ],
      takeaways: ["Treat calls and messages as structured operational input.", "Resolve customer identity before creating new records.", "Route uncertainty and sensitive exceptions to humans.", "Measure downstream work-order quality, not only call containment."],
    },
    "focused-fsm-pilot": {
      category: "Implementation",
      title: "How to scope a field service pilot that can launch quickly",
      description: "Choose one measurable workflow, constrain integrations, and prove operational value before expanding.",
      readingTime: "9 min read",
      sections: [
        ["A pilot is not a smaller transformation program", "Many pilots fail because teams attempt to include every role, workflow, integration, report, and exception from the beginning. The result is a slow implementation with unclear success criteria.\n\nA strong pilot proves one operating hypothesis: that a defined workflow can run better with clearer data, ownership, and execution."],
        ["Choose one meaningful operating loop", "Good pilot candidates have visible pain, measurable volume, clear ownership, and limited dependencies. Examples include phone inquiry to scheduled inspection, lead assignment to first response, work order to technician completion, or quote approval to service scheduling.\n\nThe workflow should matter enough to demonstrate value but remain constrained enough to launch."],
        ["Define boundaries explicitly", "Document the starting event, ending event, participating roles, required data, supported exceptions, and systems that remain outside the pilot. This prevents scope from expanding through informal assumptions.\n\nIt is equally important to state what the pilot will not solve. Clear exclusions protect speed and make later expansion deliberate."],
        ["Use a minimum integration strategy", "Start with the integrations required to make the operating loop real. Avoid connecting every adjacent system before the workflow is validated. CSV import, a simple API, or controlled manual synchronization may be acceptable during the pilot if it does not distort the result.\n\nProduction-grade integration can follow once the business value and data model are confirmed."],
        ["Design measurable success criteria", "Select a small set of operational metrics such as response time, scheduling lead time, completion visibility, data completeness, duplicate entry, follow-up compliance, or conversion rate. Record a baseline before launch.\n\nSuccess should be based on observable operating improvement, not only whether users logged in or whether the software technically worked."],
        ["Assign operational ownership", "A pilot needs one business owner, one implementation owner, and named users for each participating role. Decisions about process, fields, permissions, and exceptions must have clear owners.\n\nWithout ownership, configuration discussions become unresolved policy debates and implementation stalls."],
        ["Plan the expansion path before launch", "Identify what happens if the pilot succeeds: more teams, more workflows, deeper integrations, additional reports, or new channels such as voice and messaging. This keeps the pilot connected to a production roadmap.\n\nThe pilot should end with a decision package: measured results, remaining gaps, recommended production scope, and a rollout sequence."],
      ],
      takeaways: ["Pilot one operating loop, not the whole business.", "Write scope boundaries and exclusions before configuration begins.", "Measure operational outcomes against a baseline.", "End with a clear production decision and rollout path."],
    },
    "external-agents-for-sme-software": {
      category: "Strategy",
      title: "Why External Agents Are the Future of SME Software",
      description: "How Super Agents and governed business runtimes will reshape the way small and medium businesses operate software.",
      readingTime: "11 min read",
      sections: [
        ["Traditional SaaS has created a complexity tax", "Small and medium businesses often combine CRM, accounting, scheduling, messaging, support, files, forms, and industry-specific applications. Each product may be useful, but together they create more interfaces, configuration, training, and integration work than many teams can sustain.\n\nThe problem is no longer access to software. The problem is operating too much software."],
        ["The next interface is intent", "Super Agents such as ChatGPT, Claude, Codex, and future personal work agents can become a consistent interface across many systems. Instead of learning every application, users can express an outcome: follow up on unquoted inspections, schedule the urgent jobs, or summarize stalled opportunities.\n\nThis lowers the interaction burden, but it does not remove the need for reliable business systems."],
        ["External Agents should not own business truth", "A general-purpose Agent should not become the permanent database for customers, work orders, invoices, permissions, or approvals. It may change models, vendors, sessions, or devices. Business truth must remain in a durable system with explicit rules and audit.\n\nThe Agent should coordinate; the runtime should execute and remember."],
        ["A new software division of labor", "The emerging model has three layers: the Super Agent understands intent and orchestrates work; the business runtime exposes governed capabilities; reusable modules provide domain behavior such as CRM, sales, FSM, finance, or inventory.\n\nThis division allows intelligence to improve rapidly without forcing the business to rebuild its operational foundation each time."],
        ["Why this matters more for SMEs", "Large enterprises can fund integration teams, administrators, and custom platforms. SMEs need similar flexibility without similar overhead. External Agents can reduce training and coordination costs, while a modular runtime can reduce the need for many disconnected applications.\n\nThe value proposition is not simply AI automation. It is lower software complexity with stronger operational consistency."],
        ["Runory's role in this model", "Runory is designed as the governed execution layer for service businesses. External Agents connect through MCP, Skills, or SDK paths, discover available capabilities, and issue structured commands. Runory applies identity, permission, workflow, and audit controls before updating business state.\n\nThis lets customers choose their preferred Agent while keeping their operating system stable."],
        ["What the market may look like", "In the future, many users may start their workday inside a Super Agent rather than inside a specific SaaS homepage. Software vendors will compete on the quality of their data model, business capabilities, execution safety, interoperability, and ecosystem.\n\nThe winning products will not hide behind proprietary interfaces. They will become dependable operating infrastructure for Agents and humans."],
      ],
      takeaways: ["Super Agents can become the common interface across business software.", "Business truth must remain in a durable governed runtime.", "SMEs benefit most when flexibility increases without adding system complexity.", "Open Agent interfaces can become a primary software distribution channel."],
    },
    "crm-sales-fsm-operating-loop": {
      category: "Product",
      title: "CRM + Sales + FSM: One Operating Loop for Service Businesses",
      description: "Why customer acquisition, sales execution, and field operations should work as one connected business loop.",
      readingTime: "10 min read",
      sections: [
        ["Fragmented systems fragment accountability", "Many service businesses keep customer data in a CRM, opportunities in spreadsheets, schedules in calendars, work orders in an FSM tool, and communication in phone or messaging platforms. Each team sees only part of the customer journey.\n\nWhen information crosses system boundaries through manual entry, responsibility becomes unclear and operational context is lost."],
        ["The real lifecycle is continuous", "A service business does not stop at lead capture. A request becomes a qualified opportunity, an inspection, a quote, an appointment, a field visit, a completed job, an invoice, and a future relationship. Each stage depends on information created earlier.\n\nThe software model should reflect this continuity rather than dividing it into disconnected departments."],
        ["CRM creates reusable customer context", "CRM should hold more than contact details. It should connect people, locations, assets, communication history, service preferences, source channels, tags, and previous work. This context improves qualification and prevents customers from repeating themselves.\n\nA shared customer record is the foundation of the operating loop."],
        ["Sales converts intent into a committed scope", "Sales capabilities manage qualification, inspection findings, solution design, pricing, quote versions, approvals, objections, and follow-up. In service businesses, sales is often operational: the promised scope, timing, and price directly shape delivery.\n\nThose commitments should flow into the work order without re-entry or interpretation."],
        ["FSM turns the promise into delivery", "FSM coordinates scheduling, dispatch, technician assignment, mobile tasks, checklists, photos, materials, changes, completion, and after-sales work. Field teams need the customer and sales context relevant to execution, not a disconnected ticket.\n\nWhen delivery changes, the updated facts should flow back to customer and commercial records."],
        ["Voice and messaging belong inside the loop", "Calls, SMS, web chat, and messaging apps are not separate channels around the business. They are where customers express intent, confirm appointments, raise objections, report changes, and request support.\n\nConversation records should connect to the same customer, opportunity, work order, and follow-up context."],
        ["A unified loop improves management", "With one operating context, leaders can see conversion by source, response time, quote aging, scheduling delays, completion quality, repeat service, and revenue outcomes without reconciling multiple datasets. Agents can also reason across the lifecycle instead of operating one application at a time.\n\nThe result is not simply fewer integrations. It is clearer ownership and faster business execution."],
      ],
      takeaways: ["Model the full customer-to-service lifecycle as one operating loop.", "Carry customer and sales context into field execution.", "Link every conversation to the relevant business records.", "Use shared data to improve both operations and management insight."],
    },
    "fsm-pilot-in-1-2-weeks": {
      category: "Implementation",
      title: "How to Launch an FSM Pilot in 1–2 Weeks",
      description: "A practical execution playbook using reusable modules, focused configuration, and Agent-assisted implementation.",
      readingTime: "10 min read",
      sections: [
        ["What a 1–2 week pilot can realistically achieve", "A rapid pilot can configure one workflow, a small number of roles, the required forms and fields, a limited dataset, and the dashboards needed to supervise the process. It can also include one narrow integration or intake channel when dependencies are ready.\n\nIt should not promise complete enterprise transformation, historical migration of every record, or every exception path."],
        ["Days 1–2: confirm the operating design", "Map the current workflow, identify the pilot boundary, define roles, agree required fields, list decisions and exceptions, and capture baseline metrics. Keep the workshop focused on how work should run during the pilot.\n\nThe main deliverable is an approved operating blueprint, not a long requirements document."],
        ["Days 3–5: configure the workspace", "Create the workspace, users, roles, permissions, status model, forms, task rules, notifications, and selected modules. Import only the data required for the pilot. Configure default views for managers and frontline users.\n\nReusable capabilities and Agent-assisted setup reduce the amount of custom development needed at this stage."],
        ["Days 5–7: validate with real scenarios", "Test normal cases, incomplete information, reassignment, cancellation, rescheduling, failed contact, and completion. Use realistic records and involve actual users. Correct process ambiguity before adding more functionality.\n\nThe goal is to verify the operating loop, permissions, and data quality end to end."],
        ["Days 7–10: train and launch", "Provide role-based training using the real workflow. Keep training task-oriented: receive a lead, contact the customer, schedule work, complete a visit, and review exceptions. Launch with a small controlled team and daily support.\n\nA clear issue channel and named decision owner are essential during the first days."],
        ["Week 2: stabilize and measure", "Review adoption, response times, missing fields, status bottlenecks, user feedback, and exception volume. Make small configuration changes while protecting the agreed pilot scope.\n\nCompare the results against the baseline and document where the system materially improved visibility or execution."],
        ["Close with a production recommendation", "At the end, classify findings into configuration improvements, process decisions, integration work, data migration, and future modules. Recommend whether to expand, revise, or stop.\n\nA good pilot produces evidence and a production plan—not an indefinite prototype."],
      ],
      takeaways: ["Use an approved operating blueprint as the starting point.", "Configure reusable modules before considering custom development.", "Test exceptions with real users before launch.", "Finish with measured results and a production recommendation."],
    },
  },
  zh: {
    "agent-native-field-service": {
      category: "战略",
      title: "什么是真正的 Agent-native 现场服务软件",
      description: "为什么 Agent 应成为业务操作入口，而业务系统仍然必须是受治理的事实来源。",
      readingTime: "约 9 分钟",
      sections: [
        ["这个概念经常被过度使用", "很多产品只是在原有系统中增加聊天框、Copilot 或生成式助手，就将自己称为 Agent-native。这些能力有价值，但没有改变软件的底层运行方式。真正的 Agent-native 系统，从一开始就假设用户可以通过自然语言表达业务意图，也假设外部 Agent 可以跨多个业务能力协调工作。\n\n因此，系统需要向 Agent 暴露安全、结构化的业务动作，而不是让 Agent 模仿人类在页面上点击。差异首先是架构差异，而不是界面差异。"],
        ["Agent 不能成为业务事实系统", "Agent 可以理解意图、总结上下文、提出建议并降低操作门槛，但不应该独立持有客户记录、权限、流程状态、审批结果、价格规则和审计历史。这些职责必须由确定性的业务运行时承担。\n\n这样的分工可以避免提示词歧义、模型漂移、越权执行和业务记录不完整。智能可以保持灵活，执行必须保持受控。"],
        ["正确架构需要分离智能与执行", "一种实用架构是：外部超级 Agent → MCP、Skills 或 SDK → 受治理的 Runory 指令 → CRM、销售、FSM、语音和业务记录。Agent 决定应该做什么，Runory 判断是否允许执行，并记录最终结果。\n\n每个指令都应经过身份、权限、范围、校验、流程和审计控制。这样，Agent 驱动的业务动作才是可观察、可追踪、可恢复的。"],
        ["为什么现场服务特别适合", "现场服务包含大量重复但又依赖上下文的工作：识别客户需求、确认地址、创建工单、寻找时间、分配人员、记录勘查、形成报价、跟进服务。这些任务既需要语言理解，也需要结构化执行，非常适合 Agent 协助。\n\n同时，这些动作具有明显的运营风险。错误预约、未经授权的折扣、缺失的审计记录，都会产生直接损失，因此必须有受治理的 Runtime。"],
        ["Agent-native 不等于没有界面", "用户仍然需要 Dashboard、列表、表单、地图、日历、报表和移动端任务页。视觉界面仍然适合审核状态、比较选项和监督执行。变化在于，图形界面不再是唯一入口。\n\n管理者可以让 Agent 总结逾期工单，调度员可以在日历中调整排期，现场人员可以在移动端完成检查表；三者都应操作同一份业务事实。"],
        ["治理能力本身就是产品能力", "Agent-native 软件必须明确呈现权限、审批、执行边界和审计。一些低风险指令可以自动执行，高风险动作则需要人工确认，例如退款、合同变更、批量改派、数据导出。\n\n因此，Agent-native 产品的质量不能只看模型是否聪明，还要看它是否能安全地把意图转化为稳定、可重复的业务结果。"],
        ["一套实用的判断标准", "评估一个 Agent-native FSM 时，可以问五个问题：外部 Agent 能否发现系统能力？动作是否以结构化指令暴露？每个动作是否遵守角色和 Workspace 范围？敏感动作是否支持审批？最终业务状态是否可以审计？\n\n如果这五个问题都能得到明确回答，产品才真正超越 Copilot，走向 Agent-native 业务操作系统。"],
      ],
      takeaways: ["Agent 保持灵活，业务 Runtime 保持确定性。", "暴露结构化业务指令，而不是依赖页面自动化。", "将权限、审批与审计作为核心产品能力。", "Agent、Web 与移动端共同使用同一业务事实。"],
    },
    "voice-intake-to-work-order": {
      category: "运营",
      title: "从电话到工单：避免重复录入",
      description: "将电话与消息沟通直接转化为 CRM、销售和 FSM 执行的运营模型。",
      readingTime: "约 10 分钟",
      sections: [
        ["电话本身就是业务输入", "很多服务企业仍然把电话当作孤立对话：客服听取信息、写在纸上、录入 CRM、复制到排期工具，最后再重新填写工单。每一次转手都会增加延迟和错误。\n\n更好的方式是把每次沟通都视为结构化运营输入。电话不仅被录音，还应转化为可以直接使用的业务上下文。"],
        ["采集最小但足够的上下文", "一次有效接入通常需要识别客户、服务地址、问题类别、紧急程度、期望时间、房屋或设备信息以及安全限制。同时，系统必须保留不确定性，而不是自动编造字段。\n\n首通电话的目标不是收集所有信息，而是获取足以创建有效线索或工单、并判断下一步动作的数据。"],
        ["自动化之前先解决身份识别", "系统应首先判断来电者是否对应现有客户、地址、设备、合同或未关闭案件。重复客户数据是碎片化系统中最常见、也最隐蔽的成本之一。\n\n当身份不确定时，应创建待审核候选，而不是自动合并。好的自动化必须保护数据质量。"],
        ["把对话转化为业务对象", "一次沟通应生成客户、联系人、线索、服务请求、工单、预约需求和跟进任务等结构化对象，并与原始录音、转写文本和通话元数据保持关联。\n\n这样，后续团队既能知道客户说了什么，也能理解字段为什么这样填写，客户无需反复重复信息。"],
        ["通过置信度与异常路由控制风险", "并不是所有对话都应自动完成。低置信度、紧急情况、账单争议、非常规服务、排期冲突和敏感客户场景，都应转给人工。\n\n最好的语音系统不是完全排除人工，而是自动处理常规事务，并让异常问题变得清晰、带上下文、容易处理。"],
        ["连接完整服务生命周期", "真正的运营价值来自电话接入与资格判断、报价、预约、调度、现场执行、完工、结算和回访的直接连接。对话、客户、工单、排期和服务历史应共享同一上下文。\n\n否则，即使 AI 接线表现很好，运营团队仍然要手工重建工单，价值就被削弱了。"],
        ["衡量真正有价值的结果", "建议跟踪接听率、放弃率、有效需求率、首次响应时间、重复录入减少量、预约转化率、异常转人工率和下游数据完整度。\n\n成功的系统应该让客户少重复、让团队更快响应，并形成更干净、更可靠的业务记录。"],
      ],
      takeaways: ["将电话和消息视为结构化业务输入。", "创建新记录前先完成客户身份识别。", "将低置信度与敏感异常转交人工。", "衡量下游工单质量，而不只是通话自动完成率。"],
    },
    "focused-fsm-pilot": {
      category: "实施",
      title: "如何规划一个能够快速上线的 FSM 试点",
      description: "选择一个可衡量流程、控制集成范围，并在扩展前验证运营价值。",
      readingTime: "约 9 分钟",
      sections: [
        ["试点不是缩小版全面改造", "很多试点失败，是因为团队一开始就希望覆盖所有角色、流程、集成、报表和异常。结果是实施速度很慢，成功标准也不清晰。\n\n一个好的试点只需要验证一个运营假设：某个明确流程是否能够通过更清晰的数据、责任和执行方式得到改善。"],
        ["选择一个有价值的业务闭环", "合适的试点流程通常具备明显痛点、稳定业务量、明确负责人和有限依赖。例如电话接入到预约勘查、线索分配到首次响应、工单创建到现场完工、报价确认到服务排期。\n\n这个流程必须足够重要，能够证明价值，也必须足够受控，能够快速上线。"],
        ["明确写出范围边界", "需要定义起点事件、终点事件、参与角色、必需数据、支持的异常和暂不接入的系统。这样可以避免范围通过口头假设不断扩大。\n\n同样重要的是明确试点不解决什么。清晰的排除项能够保护速度，也让后续扩展成为有计划的决策。"],
        ["采用最小集成策略", "试点只接入让业务闭环真实运行所必需的系统。不要在流程尚未验证前就连接所有周边平台。只要不影响结果，CSV 导入、简单 API 或受控人工同步在试点期都可以接受。\n\n当业务价值和数据模型得到验证后，再建设生产级集成。"],
        ["设计可衡量的成功标准", "选择少量运营指标，例如响应时间、排期周期、完工可见性、字段完整度、重复录入、跟进合规率或转化率，并在上线前记录基线。\n\n成功应基于可观察的运营改善，而不是用户是否登录、软件是否能够运行。"],
        ["明确业务责任人", "试点至少需要一名业务负责人、一名实施负责人，以及每个参与角色的真实用户。流程、字段、权限和异常规则必须有明确决策人。\n\n如果没有责任归属，配置讨论很容易变成无法结束的制度争论。"],
        ["上线前就规划扩展路径", "应提前定义试点成功后的下一步：扩展团队、增加流程、深化集成、补充报表，或引入语音和消息渠道。这样，试点才与正式生产路线相连接。\n\n试点结束时应形成一份决策包：量化结果、剩余问题、生产范围建议和推广顺序。"],
      ],
      takeaways: ["只试点一个完整业务闭环，而不是整个企业。", "配置开始前写清范围、边界与排除项。", "以运营基线和结果衡量成功。", "结束时形成明确的生产化决策与推广路线。"],
    },
    "external-agents-for-sme-software": {
      category: "战略",
      title: "为什么外部超级 Agent 将成为 SME 软件的新范式",
      description: "超级 Agent 与受治理业务 Runtime 将改变中小企业使用软件的方式。",
      readingTime: "约 11 分钟",
      sections: [
        ["传统 SaaS 已经形成复杂度税", "中小企业通常需要组合 CRM、财务、排期、消息、客服、文件、表单和行业软件。每个产品单独看都有价值，但组合后会产生大量界面、配置、培训和集成工作。\n\n今天的问题已经不是缺少软件，而是企业需要操作过多软件。"],
        ["下一代入口是业务意图", "ChatGPT、Claude、Codex 以及未来的个人工作 Agent，可以成为多个系统之间的一致入口。用户不必学习每个软件，而是直接表达结果：跟进尚未报价的勘查、安排紧急工单、汇总停滞商机。\n\n这会显著降低交互成本，但不会消除对可靠业务系统的需要。"],
        ["外部 Agent 不能持有企业事实", "通用 Agent 不应成为客户、工单、发票、权限和审批的永久数据库。它可能更换模型、平台、会话或设备。企业事实必须保存在有规则、有审计、可长期运行的系统中。\n\nAgent 负责协调，Runtime 负责执行和记忆。"],
        ["软件将形成新的分工", "未来的软件模型可以分为三层：超级 Agent 理解意图并协调工作；业务 Runtime 暴露受治理能力；可复用模块提供 CRM、销售、FSM、财务或库存等领域行为。\n\n这种分工允许智能快速升级，而企业不需要随着每次模型变化重建运营底座。"],
        ["为什么中小企业更需要这种模式", "大型企业可以投入集成团队、管理员和定制平台，中小企业却需要以更低成本获得类似灵活性。外部 Agent 可以降低培训和协调成本，模块化 Runtime 可以减少多个割裂系统。\n\n核心价值不只是 AI 自动化，而是以更低软件复杂度获得更强运营一致性。"],
        ["Runory 在其中的角色", "Runory 作为服务企业的受治理执行层，允许外部 Agent 通过 MCP、Skills 或 SDK 发现能力并发出结构化指令。Runory 在修改业务状态前执行身份、权限、流程和审计控制。\n\n客户可以自由选择偏好的 Agent，同时保持业务操作系统稳定。"],
        ["未来市场可能如何变化", "未来很多用户可能从超级 Agent 开始一天的工作，而不是进入某个 SaaS 首页。软件厂商将围绕数据模型、业务能力、执行安全、互操作性和生态竞争。\n\n真正有价值的产品，不会把能力封闭在专有界面后，而会成为人类和 Agent 都能依赖的业务基础设施。"],
      ],
      takeaways: ["超级 Agent 可以成为跨软件的统一业务入口。", "企业事实必须保存在受治理的业务 Runtime 中。", "中小企业最需要在不增加复杂度的情况下获得灵活性。", "开放 Agent 接口可能成为重要的软件分发渠道。"],
    },
    "crm-sales-fsm-operating-loop": {
      category: "产品",
      title: "CRM + 销售 + FSM：服务企业的一体化运营闭环",
      description: "为什么客户获取、销售转化和现场服务应该成为一个连接的业务循环。",
      readingTime: "约 10 分钟",
      sections: [
        ["割裂系统会造成责任割裂", "很多服务企业把客户放在 CRM，把商机放在表格，把排期放在日历，把工单放在 FSM，把沟通放在电话和消息平台。每个团队只能看到客户旅程的一部分。\n\n信息依靠人工跨系统流转时，责任会变得模糊，业务上下文也会丢失。"],
        ["真实业务生命周期是连续的", "服务企业并不会在线索创建后结束。需求会进入资格判断、勘查、报价、预约、上门、完工、结算和长期客户关系。每个阶段都依赖前面形成的信息。\n\n软件模型应反映这种连续性，而不是按部门把业务切碎。"],
        ["CRM 提供可复用客户上下文", "CRM 不应只保存联系方式，还应关联人员、地址、设备、沟通记录、服务偏好、来源渠道、标签和历史服务。完整上下文能改善资格判断，也能减少客户重复说明。\n\n统一客户记录是一体化运营闭环的基础。"],
        ["销售把意图转化为承诺", "销售能力需要管理资格判断、勘查结果、方案设计、价格、报价版本、审批、异议和跟进。在服务企业中，销售承诺会直接影响交付范围、时间与成本。\n\n这些承诺应直接进入工单，而不是再次录入和解释。"],
        ["FSM 把承诺转化为交付", "FSM 负责排期、调度、人员分配、移动任务、检查表、照片、材料、变更、完工和售后。现场人员需要与执行相关的客户和销售上下文，而不是一张孤立工单。\n\n当现场发生变化时，新的事实也应回流到客户和商业记录。"],
        ["语音与消息属于闭环内部", "电话、短信、Web 对话和消息应用不是业务外部的独立渠道。客户会在这些渠道中表达意图、确认预约、提出异议、报告变化和请求售后。\n\n每次沟通都应关联同一个客户、商机、工单和跟进上下文。"],
        ["统一闭环提升管理质量", "当企业拥有统一上下文，管理者可以直接查看渠道转化、响应时间、报价停滞、排期延迟、完工质量、复购和收入结果，而无需对齐多个数据源。Agent 也可以跨完整生命周期推理，而不是一次只操作一个软件。\n\n最终收益不仅是减少集成，而是让责任更清晰、业务执行更快。"],
      ],
      takeaways: ["将客户到服务交付建模为一个连续运营闭环。", "把客户与销售上下文带入现场执行。", "让所有沟通记录关联相应业务对象。", "使用统一数据改善运营与管理判断。"],
    },
    "fsm-pilot-in-1-2-weeks": {
      category: "实施",
      title: "如何在 1–2 周内启动 FSM 试点",
      description: "使用可复用模块、聚焦配置与 Agent 辅助实施，快速验证业务价值。",
      readingTime: "约 10 分钟",
      sections: [
        ["1–2 周试点能够合理完成什么", "快速试点可以配置一个业务流程、少量角色、必要表单和字段、有限数据，以及监督流程所需的 Dashboard。如果依赖已经准备好，也可以接入一个有限的渠道或系统。\n\n它不应承诺全面企业改造、所有历史数据迁移或覆盖全部异常场景。"],
        ["第 1–2 天：确认运营设计", "梳理当前流程、确定试点边界、定义角色、确认必填字段、列出决策和异常，并记录基线指标。讨论重点应是试点期间业务如何运行。\n\n核心交付物是一份被确认的运营蓝图，而不是一份冗长需求文档。"],
        ["第 3–5 天：配置 Workspace", "创建 Workspace、用户、角色、权限、状态、表单、任务规则、通知和所选模块。只导入试点必需的数据，并为管理者和一线用户配置默认视图。\n\n可复用模块和 Agent 辅助配置可以显著减少这一阶段的定制开发。"],
        ["第 5–7 天：使用真实场景验证", "需要测试正常流程、信息不完整、改派、取消、重新预约、联系失败和完工等场景，并让真实用户参与。增加功能之前，应先解决流程本身的歧义。\n\n目标是验证完整闭环、权限和数据质量。"],
        ["第 7–10 天：培训并上线", "培训应基于真实任务：接收线索、联系客户、安排服务、完成现场工作、查看异常。先用一个受控小团队上线，并在最初几天提供每日支持。\n\n明确的问题反馈渠道和决策负责人非常重要。"],
        ["第 2 周：稳定与衡量", "检查使用情况、响应时间、缺失字段、状态瓶颈、用户反馈和异常数量。在不破坏试点范围的前提下进行小幅配置调整。\n\n将结果与基线比较，记录系统在哪些方面真正改善了可见性和执行效率。"],
        ["以生产化建议结束", "试点结束时，应将发现分为配置优化、流程决策、集成工作、数据迁移和未来模块，并提出扩展、修订或停止的建议。\n\n好的试点最终产生的是证据和生产计划，而不是一个长期存在的原型。"],
      ],
      takeaways: ["以确认后的运营蓝图启动实施。", "优先配置可复用模块，再考虑定制开发。", "上线前由真实用户验证异常场景。", "以量化结果和生产化建议结束试点。"],
    },
  },
} satisfies Record<"en" | "zh", Record<string, Article>>;

type Slug = keyof typeof articles.en;
type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return Object.keys(articles.en).map((slug) => ({ slug }));
}

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

  return (
    <main className="min-h-screen bg-[#fbf8f1] text-neutral-950">
      <MarketingHeader />
      <article>
        <header className="mx-auto max-w-4xl px-5 py-16 sm:py-24">
          <div className="flex flex-wrap items-center gap-3 text-sm font-semibold uppercase tracking-[.15em] text-orange-600">
            <span>{article.category}</span><span className="text-neutral-300">/</span><span className="text-neutral-500">{article.readingTime}</span>
          </div>
          <h1 className="mt-5 font-serif text-5xl leading-[1.04] tracking-[-.04em] sm:text-6xl">{article.title}</h1>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-neutral-600">{article.description}</p>
        </header>

        <div className="border-y border-black/10 bg-white">
          <div className="mx-auto max-w-4xl px-5 py-14 sm:py-20">
            {article.sections.map(([heading, body], index) => (
              <section key={heading} className={index === 0 ? "" : "mt-14 border-t border-black/10 pt-14"}>
                <p className="text-xs font-semibold uppercase tracking-[.16em] text-orange-600">0{index + 1}</p>
                <h2 className="mt-3 font-serif text-3xl tracking-[-.025em] sm:text-4xl">{heading}</h2>
                <div className="mt-5 space-y-5">
                  {body.split("\n\n").map((paragraph) => <p key={paragraph} className="text-base leading-8 text-neutral-700">{paragraph}</p>)}
                </div>
              </section>
            ))}
          </div>
        </div>

        <section className="mx-auto max-w-4xl px-5 py-16 sm:py-20">
          <div className="rounded-[24px] bg-neutral-950 p-7 text-white sm:p-10">
            <p className="text-sm font-semibold uppercase tracking-[.16em] text-orange-300">{locale === "zh" ? "关键结论" : "Practical takeaways"}</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {article.takeaways.map((item) => <div key={item} className="flex gap-3 text-sm leading-6 text-neutral-200"><Check size={17} className="mt-0.5 shrink-0 text-orange-400" />{item}</div>)}
            </div>
          </div>
        </section>
      </article>
      <MarketingFooter />
    </main>
  );
}
