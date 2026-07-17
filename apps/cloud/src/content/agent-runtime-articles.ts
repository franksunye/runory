export type AgentRuntimeArticle = {
  slug: string;
  category: string;
  title: string;
  description: string;
  readingTime: string;
  publishedAt: string;
  theme: "runtime" | "efficiency" | "architecture";
  featured?: boolean;
  sections: readonly (readonly [string, string])[];
  takeaways: readonly string[];
  relatedSlugs: readonly string[];
};

const en: Record<string, AgentRuntimeArticle> = {
  "vibe-coding-to-governed-business-systems": {
    slug: "vibe-coding-to-governed-business-systems",
    category: "Category",
    title: "From Vibe Coding to Governed Business Systems",
    description: "AI can generate applications quickly. Enterprises still need a stable runtime that makes those applications operable, governable, and upgradeable.",
    readingTime: "10 min read",
    publishedAt: "2026-07-17",
    theme: "runtime",
    featured: true,
    sections: [
      ["Vibe coding has changed the starting point", "AI coding tools can now turn a prompt into a working interface, database schema, and basic workflow in hours. This is a major improvement in software creation. It lowers the cost of exploration and allows business users to test ideas before a conventional project begins.\n\nBut a generated application is only the beginning of an enterprise system."],
      ["The productionization gap", "Production software must preserve identity, permissions, business state, audit history, transactions, integrations, migration safety, and failure recovery. These requirements are not optional engineering polish. They are the operating guarantees that allow a company to depend on the system every day.\n\nWithout a reusable runtime, every generated CRM, CMS, or operations app must rebuild these foundations."],
      ["Why rescue projects are appearing", "As AI-generated applications reach real users, experienced architects are increasingly asked to take over, restructure, harden, and finish them. The prototype may demonstrate the workflow, but production readiness often requires changes to data ownership, authorization, domain logic, deployment, observability, and upgrade paths."],
      ["The missing layer", "The more scalable model is not to generate an entirely new enterprise application for every request. It is to connect capable Agents to a governed business runtime that already owns objects, commands, workflows, permissions, events, audit, and extensions.\n\nThe Agent interprets intent. The runtime validates and executes."],
      ["Runory's position", "Runory is designed for this layer. External Agents work through MCP, Skills, and SDK interfaces. Standard needs are handled through business commands and declarative configuration. Customer-specific requirements are isolated in managed extensions rather than forks of the core product."],
    ],
    takeaways: ["Vibe coding is excellent for discovery and prototyping.", "Enterprise operation requires guarantees that prompts alone cannot provide.", "A governed runtime turns open-ended Agent intelligence into reliable business execution.", "Vibe coding creates applications. Runory makes them operational."],
    relatedSlugs: ["ai-software-productionization-gap", "governed-agent-runtime", "runory-agent-architecture"],
  },
  "agent-token-efficiency": {
    slug: "agent-token-efficiency",
    category: "Agent Efficiency",
    title: "Why Business Runtimes Can Reduce Agent Execution Overhead by 10×",
    description: "Agents become dramatically more efficient when they call stable business capabilities instead of repeatedly reconstructing application context and code.",
    readingTime: "11 min read",
    publishedAt: "2026-07-17",
    theme: "efficiency",
    sections: [
      ["The cost is larger than model pricing", "Agent cost includes repository reading, schema discovery, tool definitions, planning, generated code, test output, retries, and repair loops. A single business change may require the Agent to repeatedly load context that the company already knows."],
      ["Software reconstruction is expensive", "When an Agent customizes a standalone application, it must infer architecture, locate the correct files, understand domain relationships, modify code, run tests, and recover from errors. The same business request may consume tens of thousands of tokens before any production state changes."],
      ["Business capabilities compress context", "A runtime can expose compact, typed capabilities such as create_work_order, update_quote, schedule_visit, approve_discount, or install_workflow. The Agent no longer needs the full repository to perform routine work. It discovers the relevant command, supplies structured input, and receives a bounded result."],
      ["Where order-of-magnitude gains come from", "The largest gains appear when a repository-wide engineering task becomes a governed configuration or command task. Fewer files are read, fewer alternatives are explored, fewer tests are generated, and fewer repair loops occur. For supported operations, Runory targets order-of-magnitude reductions in context and execution overhead."],
      ["What should be measured", "A credible benchmark should compare token usage, Agent turns, elapsed time, files changed, retries, failure rate, and audit completeness for the same business outcome. Runory should publish measured results rather than treating 10× as a universal promise."],
    ],
    takeaways: ["Token efficiency is primarily an architecture problem, not a prompt trick.", "Stable commands replace repeated repository reconstruction.", "Structured outputs reduce context growth and retry loops.", "Runory should validate 10× claims with reproducible benchmarks."],
    relatedSlugs: ["configuration-before-code", "claude-code-vs-runory", "runory-agent-architecture"],
  },
  "governed-agent-runtime": {
    slug: "governed-agent-runtime",
    category: "Enterprise AI",
    title: "AI Agents Need More Than Intelligence — They Need a Governed Runtime",
    description: "Enterprise Agents need identity, permissions, contracts, transactions, audit, approval, and recovery before they can safely operate real businesses.",
    readingTime: "10 min read",
    publishedAt: "2026-07-17",
    theme: "runtime",
    sections: [
      ["Intelligence is probabilistic", "Agents are strong at interpreting language, combining context, planning work, and adapting to exceptions. Those strengths are valuable precisely because they are flexible. But enterprise state changes cannot depend on unconstrained interpretation alone."],
      ["Execution must be deterministic", "Creating an invoice, changing a contract, assigning a technician, issuing a refund, or moving a work order into completion must follow explicit rules. The result must respect permissions, invariants, transaction boundaries, and the current authoritative state."],
      ["Governance belongs in the runtime", "Prompt instructions and UI warnings are not sufficient controls. Identity, scope, approval requirements, command contracts, idempotency, audit, and rollback must be enforced in the execution path itself. A policy is only reliable when the Agent cannot bypass it."],
      ["Bounded autonomy", "Not every action needs human approval. Low-risk queries and routine updates may execute automatically. Medium-risk changes can require preview and confirmation. High-risk actions may require stronger authorization or manual review. The runtime should make these boundaries explicit and observable."],
      ["A stable division of responsibility", "The Agent should understand, plan, explain, and orchestrate. Runory should validate, authorize, execute, record, and recover. This separation allows companies to adopt better Agents over time without rebuilding their operational foundation."],
    ],
    takeaways: ["Flexible intelligence and deterministic execution should be separate layers.", "Governance must be enforced in the runtime, not only described in prompts.", "Enterprise autonomy should be risk-based and observable.", "Business truth remains in Runory even when the Agent changes."],
    relatedSlugs: ["enterprise-ai-system-of-record", "runory-agent-architecture", "vibe-coding-to-governed-business-systems"],
  },
  "runory-agent-architecture": {
    slug: "runory-agent-architecture",
    category: "Architecture",
    title: "How Runory Turns External Agents into Reliable Business Operators",
    description: "A practical architecture for connecting ChatGPT, Claude, Codex, and enterprise Agents to governed FSM execution.",
    readingTime: "12 min read",
    publishedAt: "2026-07-17",
    theme: "architecture",
    sections: [
      ["External-Agent-first", "Runory does not attempt to replace general-purpose Agents. It gives them a stable business environment. Users can work through the Agent they prefer while Runory preserves the same data, permissions, commands, workflows, and audit model."],
      ["A structured access plane", "MCP, Skills, and SDK interfaces expose discoverable capabilities rather than raw database access. Each capability has a defined purpose, input contract, permission requirement, risk level, and expected outcome."],
      ["Command-owned business change", "Every governed write enters through a named command. The command contract declares the intended state transition, validations, atomic effects, events, idempotency policy, and postconditions. Workflows orchestrate commands but do not bypass domain rules."],
      ["Configuration and managed extensions", "Standard adaptation should use metadata: fields, views, workflows, rules, roles, dashboards, and templates. When configuration is insufficient, a managed workspace extension adds bounded customer logic without modifying official modules."],
      ["One authoritative operating model", "Human users, mobile teams, voice intake, automation, and external Agents all operate on the same business state. This prevents the Agent layer from becoming a second, inconsistent system of record."],
      ["The resulting flow", "Business intent flows to an external Agent, then through MCP, Skills, or SDK, into Runory commands and workflows. Runory performs authorization, validation, execution, audit, events, and recovery before the new state appears in operational UI."],
    ],
    takeaways: ["External Agents are intelligence channels, not owners of business state.", "Named commands provide a stable execution contract.", "Configuration and managed extensions reduce custom code forks.", "All operating surfaces share one governed runtime."],
    relatedSlugs: ["governed-agent-runtime", "configuration-before-code", "claude-code-vs-runory"],
  },
  "claude-code-vs-runory": {
    slug: "claude-code-vs-runory",
    category: "Comparison",
    title: "Building a Workflow with Claude Code vs Configuring It with Runory",
    description: "A concrete comparison of open-ended software modification and governed business configuration.",
    readingTime: "9 min read",
    publishedAt: "2026-07-17",
    theme: "efficiency",
    sections: [
      ["The business request", "Consider a simple rule: after a quote is submitted, remind the owner if the customer has not responded within 24 hours, then escalate to the manager after 48 hours."],
      ["The standalone coding path", "Claude Code may need to inspect the repository, identify quote and user models, understand notification services, add scheduling logic, change persistence, write tests, run the build, fix errors, and deploy. The result can work, but the Agent must reconstruct many project-specific decisions."],
      ["The Runory path", "With Runory, the Agent discovers quote events, elapsed-time conditions, notification commands, manager relationships, and workflow extension points. It proposes a declarative workflow, shows a diff, requests confirmation when required, validates the definition, and activates it."],
      ["The deeper difference", "The comparison is not code versus no code. It is open-ended regeneration versus bounded composition. Runory already owns the execution guarantees: permission, scheduling, retries, audit, rollback, and authoritative state."],
      ["When code is still appropriate", "A new external algorithm, unusual integration, or genuinely novel business capability may require engineering. Runory treats that as a managed extension or core product decision rather than the default response to every customization request."],
    ],
    takeaways: ["The same business outcome can require radically different context and execution paths.", "Runory converts routine engineering work into governed composition.", "Code remains available for novel capabilities, but not as the default adaptation mechanism.", "The comparison should be benchmarked with real token and reliability data."],
    relatedSlugs: ["agent-token-efficiency", "configuration-before-code", "vibe-coding-to-governed-business-systems"],
  },
  "enterprise-ai-system-of-record": {
    slug: "enterprise-ai-system-of-record",
    category: "Enterprise AI",
    title: "Why Enterprise AI Still Needs a System of Record",
    description: "Agents can become the operating interface, but customer, financial, operational, and compliance truth must remain durable and governed.",
    readingTime: "9 min read",
    publishedAt: "2026-07-17",
    theme: "runtime",
    sections: [
      ["The interface is changing", "Employees may increasingly begin work in a Super Agent rather than opening every SaaS application. They will ask for outcomes, summaries, exceptions, and next actions in natural language."],
      ["The source of truth cannot become a conversation", "Agent sessions, models, providers, and context windows change. A conversation is not an appropriate permanent owner for customer identity, contract status, work orders, invoices, permissions, approvals, or audit history."],
      ["Business truth needs explicit ownership", "Authoritative objects must have stable identifiers, schemas, relationships, lifecycle rules, and transaction boundaries. Every change needs an attributable actor, timestamp, source, and result."],
      ["Agents should operate the record, not replace it", "An Agent can find, explain, summarize, and change business records through governed commands. The system of record remains responsible for validation, persistence, events, access control, and recovery."],
      ["Why this creates strategic durability", "Companies can switch Agents, models, or channels while keeping their operating history and rules intact. The Agent layer can evolve quickly because the business foundation remains stable."],
    ],
    takeaways: ["Natural language may become the interface, but not the database.", "Durable business truth requires explicit models and governance.", "Agents should act through the system of record.", "A stable runtime protects the business from model and vendor change."],
    relatedSlugs: ["governed-agent-runtime", "runory-agent-architecture", "external-agents-for-sme-software"],
  },
  "configuration-before-code": {
    slug: "configuration-before-code",
    category: "Engineering",
    title: "Configuration Before Code Generation",
    description: "Why enterprise Agent systems should compose trusted capabilities before generating new application code.",
    readingTime: "8 min read",
    publishedAt: "2026-07-17",
    theme: "efficiency",
    sections: [
      ["Generation should not be the first tool", "AI makes code generation easy, which can encourage teams to solve every variation with more code. In enterprise systems, this quickly creates inconsistent models, duplicated logic, upgrade conflicts, and unclear ownership."],
      ["Use the lowest sufficient execution level", "A reliable Agent should first attempt a business command, then declarative configuration, then a managed extension. Core engineering is reserved for reusable product capability or changes to platform guarantees."],
      ["Metadata is operational leverage", "Objects, fields, views, forms, workflows, roles, dashboards, and templates can be changed safely when they are represented as validated definitions. The Agent works with a small semantic model instead of a large repository."],
      ["Extensions protect the product boundary", "Customer-specific behavior sometimes exceeds configuration. A managed extension provides versioning, namespace ownership, validation, compatibility checks, audit, and rollback without forking official modules."],
      ["A durable engineering principle", "Compose before generating. Configure before coding. Extend before forking. This order reduces token usage, implementation risk, technical debt, and long-term upgrade cost."],
    ],
    takeaways: ["Easy generation does not remove architecture discipline.", "Agents should use the lowest sufficient adaptation level.", "Metadata creates both efficiency and upgrade safety.", "Managed extensions are preferable to customer-specific core forks."],
    relatedSlugs: ["agent-token-efficiency", "claude-code-vs-runory", "runory-agent-architecture"],
  },
  "ai-software-productionization-gap": {
    slug: "ai-software-productionization-gap",
    category: "Market",
    title: "The Productionization Gap in AI-Generated Software",
    description: "Why AI-built CRM, CMS, and operations applications increasingly need senior engineers before enterprises can depend on them.",
    readingTime: "10 min read",
    publishedAt: "2026-07-17",
    theme: "runtime",
    sections: [
      ["The prototype is arriving earlier", "Business teams can now produce a convincing application before hiring an engineering team. This changes the buying and delivery process: the project often starts with a working artifact rather than a written specification."],
      ["The difficult work moves downstream", "Architecture, data ownership, security, authorization, observability, testing, deployment, migration, integration, and operational support still need to be resolved. Faster generation does not make these responsibilities disappear."],
      ["A new services category is forming", "Senior developers and architects are increasingly asked to rescue, harden, refactor, and productionize AI-generated applications. This is evidence that the market values the speed of vibe coding but has reached its operational boundary."],
      ["Why repeated rescue is inefficient", "Each project reconstructs the same enterprise foundations: users, organizations, roles, permissions, workflows, audit, notifications, integration reliability, and upgrade behavior. The customer pays for productionization again and again."],
      ["The platform opportunity", "A governed business runtime turns repeated project work into reusable infrastructure. AI can still shape the experience and customer-specific workflow, but it does so on top of stable operational guarantees."],
    ],
    takeaways: ["AI generation moves the prototype earlier but does not remove production engineering.", "Rescue and hardening work signals a real market boundary.", "Repeated productionization is a reusable-platform opportunity.", "Runory addresses the layer between generated applications and dependable operations."],
    relatedSlugs: ["vibe-coding-to-governed-business-systems", "governed-agent-runtime", "configuration-before-code"],
  },
};

const zh: Record<string, AgentRuntimeArticle> = {
  "vibe-coding-to-governed-business-systems": { ...en["vibe-coding-to-governed-business-systems"], category: "品类定义", title: "从 Vibe Coding 到可信的企业业务系统", description: "AI 可以快速生成应用，但企业仍需要稳定的运行时，让应用可运营、可治理、可升级。", readingTime: "阅读约 10 分钟", sections: [["Vibe Coding 改变了软件项目的起点", "AI 编程工具已经可以在数小时内，根据提示词生成界面、数据结构和基础流程。它显著降低了探索成本，让业务人员能够在传统项目启动前验证想法。\n\n但是，生成一个应用只是企业系统的起点。"],["从原型到生产之间仍有鸿沟", "生产系统必须长期保证身份、权限、业务状态、审计、事务、集成、迁移安全和失败恢复。这些不是额外的工程美化，而是企业每天依赖系统运行所需的基本保证。\n\n如果没有可复用的运行时，每一个 AI 生成的 CRM、CMS 或运营系统都必须重新建设这些基础。"],["为什么开始出现大量接管与救援项目", "当 AI 生成的应用进入真实使用，高级架构师和开发人员开始被要求接手、重构、加固并完成交付。原型可能已经展示了流程，但生产可用性通常仍需要重新处理数据所有权、授权、领域逻辑、部署、可观测性和升级路径。"],["缺失的是企业运行层", "更可扩展的方式，不是为每个需求重新生成一套企业软件，而是让强大的 Agent 连接到一个已经拥有对象、指令、流程、权限、事件、审计和扩展机制的受治理运行时。\n\nAgent 理解意图，运行时负责验证与执行。"],["Runory 所处的位置", "Runory 正是为这一层设计。外部 Agent 通过 MCP、Skills 和 SDK 工作；标准需求通过业务指令和声明式配置实现；客户特有需求通过受管理扩展隔离，而不是分叉核心产品。"]], takeaways: ["Vibe Coding 非常适合探索和原型。","企业运营需要提示词无法单独提供的系统保证。","受治理运行时把开放式 Agent 智能转化为可靠业务执行。","Vibe Coding 创建应用，Runory 让业务真正运行。"] },
  "agent-token-efficiency": { ...en["agent-token-efficiency"], category: "Agent 效率", title: "为什么业务运行时可以将 Agent 执行开销降低 10 倍", description: "当 Agent 调用稳定业务能力，而不是反复重建应用上下文和代码时，执行效率会出现数量级提升。", readingTime: "阅读约 11 分钟", sections: [["成本不只是模型单价", "Agent 成本包括读取代码仓库、理解数据结构、加载工具定义、规划、生成代码、测试输出、失败重试和修复循环。一个业务变化可能要求 Agent 反复加载企业已经知道的上下文。"],["重新理解软件非常昂贵", "当 Agent 定制一个独立应用时，它需要推断架构、定位文件、理解领域关系、修改代码、运行测试并修复错误。真正的生产状态尚未改变，Token 就可能已经消耗数万。"],["业务能力可以压缩上下文", "运行时可以暴露紧凑、类型明确的能力，例如创建工单、更新报价、安排上门、审批折扣或安装流程。Agent 不再需要读取整个仓库，只需发现相关指令、提交结构化输入并接收受约束结果。"],["数量级提升从哪里产生", "当一个跨仓库的软件工程任务变成受治理的配置或指令任务，需要读取的文件更少、探索的路径更少、测试和修复循环更少。对于已支持的业务操作，Runory 的目标是将上下文与执行开销降低一个数量级。"],["应该如何证明", "可信的 Benchmark 应比较同一业务结果下的 Token、Agent 轮次、耗时、修改文件数、重试、失败率和审计完整性。Runory 应发布真实测量结果，而不是把 10 倍作为所有场景的绝对承诺。"]], takeaways: ["Token 效率首先是架构问题，而不是提示词技巧。","稳定指令可以替代反复理解代码仓库。","结构化结果能够减少上下文膨胀和重试。","10 倍需要通过可复现 Benchmark 验证。"] },
  "governed-agent-runtime": { ...en["governed-agent-runtime"], category: "企业 AI", title: "企业 AI Agent 需要的不只是智能，还需要可信运行时", description: "Agent 在操作真实企业前，需要身份、权限、契约、事务、审计、审批与恢复机制。", readingTime: "阅读约 10 分钟", sections: [["智能是概率性的", "Agent 擅长理解语言、组合上下文、规划工作和处理例外。它的价值正来自这种灵活性，但企业状态变更不能只依赖开放式解释。"],["执行必须是确定性的", "创建发票、修改合同、分配人员、退款或完成工单，都必须遵循明确规则，并尊重权限、业务不变量、事务边界和当前权威状态。"],["治理必须进入运行路径", "提示词约束和界面提醒不是真正的控制。身份、范围、审批要求、指令契约、幂等、审计与回滚必须由执行路径强制落实，Agent 无法绕过。"],["受约束的自治", "并非所有操作都需要人工确认。低风险查询和常规更新可以自动执行；中风险变化需要预览和确认；高风险操作需要更强授权或人工审核。运行时应让这些边界清晰且可观察。"],["稳定的职责分工", "Agent 负责理解、规划、解释与编排；Runory 负责验证、授权、执行、记录与恢复。企业可以持续采用更好的 Agent，而无需重建运营基础。"]], takeaways: ["灵活智能与确定执行应是两个不同层次。","治理必须由运行时执行，而不是只写在提示词中。","企业自治应按风险分级并保持可观察。","即使 Agent 改变，业务事实仍然保存在 Runory。"] },
  "runory-agent-architecture": { ...en["runory-agent-architecture"], category: "架构", title: "Runory 如何让外部 Agent 成为可靠的业务操作员", description: "连接 ChatGPT、Claude、Codex 与企业 Agent，并实现受治理 FSM 执行的实际架构。", readingTime: "阅读约 12 分钟", sections: [["External-Agent-first", "Runory 不试图替代通用 Agent，而是为它们提供稳定业务环境。用户可以选择自己偏好的 Agent，同时 Runory 保持一致的数据、权限、指令、流程和审计模型。"],["结构化接入层", "MCP、Skills 和 SDK 暴露可发现的业务能力，而不是数据库访问。每项能力都有明确用途、输入契约、权限要求、风险级别和预期结果。"],["业务变化由指令拥有", "所有受治理写操作都通过命名指令进入。指令契约声明状态变化、校验、原子效果、事件、幂等策略和后置条件；流程可以编排指令，但不能绕过领域规则。"],["配置与受管理扩展", "标准适配使用元数据：字段、视图、流程、规则、角色、Dashboard 和模板。当配置不足时，Workspace Extension 在不修改官方模块的情况下增加受约束客户逻辑。"],["一个权威运营模型", "人工用户、移动团队、语音接单、自动化和外部 Agent 都操作同一业务状态，避免 Agent 层成为第二套不一致的事实来源。"],["完整执行路径", "业务意图进入外部 Agent，再通过 MCP、Skills 或 SDK 进入 Runory 指令和流程。Runory 完成授权、校验、执行、审计、事件和恢复，然后新状态呈现在运营界面中。"]], takeaways: ["外部 Agent 是智能入口，不是业务状态所有者。","命名指令提供稳定执行契约。","配置和受管理扩展减少客户代码分叉。","所有操作界面共享同一受治理运行时。"] },
  "claude-code-vs-runory": { ...en["claude-code-vs-runory"], category: "对比", title: "使用 Claude Code 开发流程，与使用 Runory 配置流程", description: "开放式软件修改与受治理业务配置的一次具体对比。", readingTime: "阅读约 9 分钟", sections: [["业务需求", "一个简单规则：报价提交后，如果客户 24 小时没有回应，提醒负责人；48 小时后升级给经理。"],["独立编码路径", "Claude Code 可能需要读取仓库、定位报价和用户模型、理解通知服务、增加调度逻辑、修改持久化、编写测试、运行构建、修复错误并部署。结果可以正确，但 Agent 必须重新理解大量项目决策。"],["Runory 路径", "在 Runory 中，Agent 发现报价事件、超时条件、通知指令、经理关系和流程扩展点；生成声明式流程，展示 Diff，在必要时请求确认，校验后直接激活。"],["更深层的区别", "这不是有代码与无代码的区别，而是开放式再生成与受约束组合的区别。Runory 已经负责权限、调度、重试、审计、回滚和权威状态。"],["什么时候仍然需要代码", "新的外部算法、特殊集成或真正全新的业务能力仍可能需要工程实现。Runory 将其作为受管理扩展或核心产品决策，而不是每次定制的默认路径。"]], takeaways: ["同一业务结果可以有完全不同的上下文和执行路径。","Runory 将常规工程任务转化为受治理组合。","代码仍用于新能力，但不应成为默认适配机制。","应通过真实 Token 与可靠性数据进行比较。"] },
  "enterprise-ai-system-of-record": { ...en["enterprise-ai-system-of-record"], category: "企业 AI", title: "为什么企业 AI 仍然需要 System of Record", description: "Agent 可以成为操作界面，但客户、财务、运营和合规事实必须长期、稳定、受治理。", readingTime: "阅读约 9 分钟", sections: [["操作界面正在改变", "员工可能越来越多地从 Super Agent 开始工作，而不是逐个打开 SaaS。他们会用自然语言提出结果、摘要、异常和下一步行动。"],["事实来源不能变成一次对话", "Agent 会话、模型、服务商和上下文窗口都会改变。客户身份、合同状态、工单、发票、权限、审批和审计记录不能由一次对话永久拥有。"],["业务事实需要明确所有权", "权威对象需要稳定 ID、Schema、关系、生命周期规则和事务边界。每一次变化都需要可识别的操作者、时间、来源与结果。"],["Agent 应操作记录，而不是取代记录", "Agent 可以通过受治理指令查找、解释、总结和修改业务记录；System of Record 仍然负责校验、持久化、事件、访问控制和恢复。"],["战略上的耐久性", "企业可以更换 Agent、模型或渠道，同时保留运营历史和业务规则。正因为业务基础稳定，Agent 层才能快速演进。"]], takeaways: ["自然语言可以成为界面，但不能成为数据库。","持久业务事实需要明确模型和治理。","Agent 应通过 System of Record 执行操作。","稳定运行时保护企业免受模型和供应商变化影响。"] },
  "configuration-before-code": { ...en["configuration-before-code"], category: "工程", title: "配置优先于代码生成", description: "为什么企业 Agent 系统应先组合可信能力，再生成新的应用代码。", readingTime: "阅读约 8 分钟", sections: [["生成不应该是第一选择", "AI 让生成代码变得容易，也可能诱导团队用更多代码解决每个差异。对于企业系统，这会快速产生不一致模型、重复逻辑、升级冲突和所有权不清。"],["使用最低充分执行层级", "可靠 Agent 应先尝试业务指令，然后是声明式配置，再到受管理扩展。只有可复用产品能力或平台保证发生变化时，才进入核心工程。"],["元数据就是运营杠杆", "对象、字段、视图、表单、流程、角色、Dashboard 和模板如果表示为可校验定义，就能安全变化。Agent 面对的是小型语义模型，而不是庞大代码仓库。"],["扩展保护产品边界", "部分客户需求确实超出配置。受管理扩展提供版本、命名空间、校验、兼容检查、审计和回滚，同时避免分叉官方模块。"],["长期工程原则", "先组合，再生成；先配置，再编码；先扩展，再分叉。这个顺序同时降低 Token、实施风险、技术债和长期升级成本。"]], takeaways: ["代码容易生成，并不意味着架构纪律消失。","Agent 应使用最低充分适配层。","元数据同时带来效率与升级安全。","受管理扩展优于客户专属核心分叉。"] },
  "ai-software-productionization-gap": { ...en["ai-software-productionization-gap"], category: "市场", title: "AI 生成软件的生产化鸿沟", description: "为什么 AI 创建的 CRM、CMS 和运营应用，仍越来越多地需要高级工程师才能成为企业可依赖的软件。", readingTime: "阅读约 10 分钟", sections: [["原型更早出现", "业务团队现在可以在聘请工程团队前，就创建一套看起来完整的应用。项目因此从一个可运行成果开始，而不是从需求文档开始。"],["困难工作被推迟到后面", "架构、数据所有权、安全、授权、可观测性、测试、部署、迁移、集成和运营支持仍然需要解决。生成更快并没有让这些责任消失。"],["新的服务类别正在形成", "高级开发和架构师越来越多地被要求接管、救援、加固、重构和生产化 AI 生成应用。这说明市场认可 Vibe Coding 的速度，同时已经触及其运营边界。"],["重复救援为什么低效", "每一个项目都重新建设用户、组织、角色、权限、流程、审计、通知、集成可靠性和升级行为，客户需要一次又一次支付生产化成本。"],["平台机会", "受治理业务运行时将重复项目工作转化为可复用基础设施。AI 仍然可以塑造体验和客户流程，但建立在稳定运营保证之上。"]], takeaways: ["AI 生成让原型更早出现，但没有消除生产工程。","接管与加固需求说明市场边界真实存在。","重复生产化是一项可平台化的机会。","Runory 解决生成应用与可靠运营之间缺失的一层。"] },
};

export const agentRuntimeArticles = { en, zh } as const;
export const agentRuntimeSlugs = Object.keys(en);

export function getAgentRuntimeArticle(locale: "en" | "zh", slug: string) {
  return agentRuntimeArticles[locale][slug];
}
