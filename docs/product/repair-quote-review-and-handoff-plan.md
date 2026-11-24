# Repair Quote Review and Handoff — Product and Engineering Plan

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `product` |
| Applies to | `v0.9+ / bounded Reactive Repair pilot candidate` |
| Owner | Product / Engineering |
| Last reviewed | 2026-11-24 |
| Supports | [Product Definition](product-definition.md), [Product Roadmap](product-roadmap.md), [v0.9 Execution Plan](v0.9-repeatable-delivery-execution-plan.md) |
| Research input | [FSM AI Market Review — 2026-11-24](../research/fsm-ai-market-review-2026-11-24.md) |
| Supersedes | — |
| Superseded by | — |

## 1. Working decision and authority

The next focused product-development and commercial-validation priority is **repair quote review and execution-handoff consistency** (维修报价审核与交底一致性).

Deliver one bounded business Pack/reference configuration and use it to complete a measurable business-execution journey for both an operator and an approved external Agent:

**Existing survey evidence and quote → evidence-backed review → human-approved scope → consistent execution brief and governed Work Order.**

This is the selected working priority, not a claim that the Pack is implemented, released, differentiated in practice, or commercially validated. Willingness to pay, measurable customer benefit, repeatable delivery economics, and the best initial repair category remain hypotheses. The market review supplies decision evidence; this plan defines the bounded work. [Product Definition](product-definition.md) remains the product authority.

The existing Reactive Repair / Callout scope, Cloud-first and external-Agent-first architecture, and [GA contract](v1.0-ga-release-goal.md) continue to apply. This plan adds no new commercial operating model or release number. A Pack pilot candidate can be engineering-complete before the real-customer, v0.9, or GA gates are complete. The existing [G4 device/provider and G5 customer-repeatability gates](../releases/v0.9-e2e-gate-remapping-2026-07-31.md) retain their own required evidence.

## 2. Commercial job and initial customer hypothesis

### Buyer and entry point

Start with a reachable repair business where survey, estimating, approval, and execution involve different people, and an owner or operations manager repeatedly checks photos, notes, spreadsheets, quotes, and handoffs for omissions. Select **one repair category and one language/region** using access to real cases, an accountable buyer, and sufficient job frequency. Record that selection before the first pilot; it is not yet established by this document.

Existing XLink experience may inform domain questions and examples. It is not evidence that Runory already contains those capabilities or has an overseas distribution channel. US basement waterproofing is not a default segment: ArcSite already addresses much of the adjacent workflow. Compare the customer's incumbent software configuration and general-purpose AI alternatives before claiming differentiation.

The initial offer may be a fixed-scope customer solution assembled from Runory's reusable capabilities, or a bounded implementation plus a Cloud subscription for the approved review/handoff workflow. Charge for actual development, implementation, hosting, maintenance, support, and provider responsibilities as applicable; do not require a mature SaaS offer before a scoped customer solution can be delivered. Scope and acceptance must be explicit for either path. This plan sets no validated price and does not replace [Commercial Pricing and Packaging](commercial-pricing-and-packaging.md) or the [Customer Implementation Delivery Model](customer-implementation-delivery-model.md). Outcome-based pricing remains a later option requiring credible attribution.

### Bounded customer deliverable

| Input or output | First-slice boundary |
| --- | --- |
| Inputs | Existing survey notes, customer requirements, selected photos/documents, an existing quote, and the applicable customer price book/rules. Select actual input formats during pilot scoping. |
| Evidence-backed review | List confirmed facts, proposed interpretations, missing information, and conflicts separately; every material finding points to a source or an explicit rule. |
| Scope/quote check | Check supported required work, quantities, units, inclusions, exclusions, and conflicting versions. Surface uncertainty for human resolution. |
| Approved version | Preserve the authorized scope, price, exclusions, conditions, approver, and applicable document/rule versions. |
| Execution handoff | Produce a brief and required checklist faithful to the approved scope; create or link the Work Order through existing governed lifecycle actions. |
| Change handling | Show differences, require the applicable reapproval, and keep earlier approved versions and their derived handoffs traceable. |

Illustrative fixtures, not observed customer results: a confirmed demolition/restoration requirement is absent from the quote; a quote includes two locations but the brief includes one; or a required quantity has no reliable source. These become review findings, not automatic diagnoses or invented measurements.

Use existing customer materials so a review pilot does not require full FSM migration. Define one authoritative owner for each quote and work order: an imported external record is a versioned input, not an independently editable second source of truth. If a connector is unavailable, the pilot can return a reviewed document for explicit human transfer. Do not represent that path as verified external-system execution. Production API access, plan limits, and approved integration routes must be checked for the selected system.

## 3. Baseline and work to add

Repository baseline reviewed: [0433987e7b7f9846293b1030d0f9416fb9557fd3](https://github.com/franksunye/runory/tree/0433987e7b7f9846293b1030d0f9416fb9557fd3), 2026-11-24. This is a source/document review, not a new production acceptance result.

| Area | Existing basis to reuse | Additional evidence or product work |
| --- | --- | --- |
| Quote and commercial state | Existing Quote and Price Book modules, revisions, calculations, approvals, and governed conversion contracts | Bind review findings and approved repair scope to the authoritative version; prove brief fidelity and change handling. |
| Field work and evidence | Existing FSM, Work Order, Visit, Forms, attachments, and operator surfaces | Receive existing survey evidence; add the bounded review and handoff projections. Do not introduce another survey/Visit scheduling lifecycle. |
| Execution governance | Command Contracts, permissions, Workflow work items, audit, idempotency, Outbox, and recovery boundaries | Connect the complete chosen action sequence and verify its failure paths. |
| External Agent | [MCP server](../../apps/mcp/src/server.ts) already exposes workspace, Pack, inspection, extension, audit, and record tools | Complete and validate the required named business-action access. Generic record tools do not prove the Quote-to-handoff journey. |
| Delivery and customization | Pack/Template composition and Managed Workspace Extensions; existing v0.9 delivery work | Install the same reference configuration twice, express customer variation without a Core fork, and preserve it on upgrade. |
| Implementation management | Existing proposed `runory.implementation` product/specification boundary | Record real delivery effort and reusable assets. The reviewed tree does not establish an implemented module; completing the whole implementation platform is not a prerequisite for this Pack. |

The [Sales Quote Pack manifest](../../catalog/packs/sales-quote-pack/manifest.yaml) already composes shared commercial modules and states that the standalone `quote_approval` module is retired. Reuse Workflow approval work items; do not revive the old module from an early planning document. Compose the existing [FSM Pack](../../catalog/packs/fsm-pack/manifest.yaml) where field execution is needed.

## 4. Product and architecture boundaries

The [Workspace Customization Boundaries](../architecture/workspace-customization-boundaries.md), [Module Architecture](../architecture/module-architecture.md), and [Command Architecture](../architecture/contract-driven-command-architecture.md) govern implementation.

- **Pack/Template:** selected module composition, evidence checklists, role defaults, review rules, workflow configuration, terminology, and reference examples.
- **Workspace Extension:** customer-specific fields, supported rules, views, forms, and process differences within declared extension points.
- **Official Module:** stable new domain facts or invariants only when the chosen journey requires them and existing ownership cannot express them. Record the architecture decision before implementation.
- **Shared Runtime:** reuse existing execution, authorization, forms, workflow, and extension lifecycle. A reusable contract fix is different from a customer-specific Core fork.

Evidence, review finding, rule version, approved scope, and handoff lineage are required logical concepts. This plan does not prescribe a new table, service, framework, or generic knowledge graph for each concept. First map them to existing records, attachments, revisions, forms, and supported extensions.

An external Agent may extract or propose facts, identify supported discrepancies, explain a suggested correction, and prepare an action. The same authorization, approval, validation, named Command, read-back verification, and audit boundaries apply to human and Agent execution. A model response is never authoritative commercial state. Use deterministic calculations for money, quantities, and version comparisons; unknown costs mean unknown margin.

Keep the initial proposal/review manual when necessary. Advanced AI quality can improve independently of the commercial state machine. Model/provider adapters may change while domain records, rule versions, approved actions, and evaluation cases remain stable.

### Non-goals for this slice

- Autonomous repair diagnosis, measurement from arbitrary photos, or a guaranteed complete final quote without qualified review.
- Revenue-optimizing dispatch, route optimization, a proprietary voice model, or a general decision/Agent platform.
- Every repair trade, input format, price book, connector, or regional workflow.
- Project/Installation or Recurring Maintenance commercial models.
- A second Quote, approval, Forms, Workflow, permission, or extension runtime; customer-specific Core forks.
- A public marketplace, broad Local deployment automation, or completion of the entire implementation-management platform.

## 5. Durable engineering assets

Each iteration must produce **a usable role task, a reusable asset, and verifiable cases**. This slice applies the broader [business-asset contract](product-definition.md#8-durable-business-assets-and-rapid-custom-delivery): business objects, processing logic, and role applications must accumulate alongside runtime reliability. The already scoped canonical FSM backlog may continue independently of this slice's commercial results.

### 5.1 Business capabilities this slice should leave behind

| Layer | Reusable outcome |
| --- | --- |
| Objects and relationships | Evidence and review findings linked to the existing customer/site, Quote revision, approved scope, Work Order, and relevant field records; preserve domain ownership and lineage. |
| Processing logic | Supported scope checks, deterministic calculations, correction/approval/revision behavior, faithful handoff, governed conversion, and recovery through the existing business contracts. |
| Role applications | A salesperson/estimator assembles and reviews; a manager approves or returns; dispatch/technicians receive and act on the approved brief; customer confirmation reuses existing scoped access when included. Each role has a complete task and exception path. |
| Customer adaptation | Versioned form, rule, role, navigation, import, and handoff defaults that another compatible customer can configure or extend without changing official source. |

Reuse existing desktop/mobile/customer surfaces and the same business semantics for external Agents. Do not create a separate application per role merely to satisfy this inventory. A role-task implementation must include the permissions, input, action, output, and recovery behavior it needs.

For each delivered capability, record its owning Module/component, version, supported role task, extension points, acceptance cases, and maturity (designed, implemented, verified, or production-accepted). Keep this record with existing specifications/evidence; it does not require a new inventory platform.

### 5.2 Supporting technical assets

The following investment areas serve the same business capabilities; they are not six independent platform projects.

| Asset | Immediate user action it serves | Durable output | Evidence of progress |
| --- | --- | --- | --- |
| Facts and evidence | Check why a finding exists | Source/version/time/unit references; observation versus inference; confirmation and conflict handling | Review can trace a finding and correct it without losing its origin. |
| Scope and rules | Check work against agreed conditions | Versioned applicability, required steps, inclusions/exclusions, units, and price/cost references | Same inputs and rule version produce reproducible checks; unsupported cases remain explicit. |
| Governed execution | Approve and publish a consistent handoff | Existing Command-based action chain with permission, preview, idempotency, read-back, and recovery | Human and Agent paths preserve the same business invariants under retry and concurrent edits. |
| Import and mapping | Reuse current customer records | One bounded import/mapping path, provenance, validation, and reconciliation | Duplicate or conflicting imports are visible; the authoritative record is unambiguous. |
| Upgradeable Pack/Extension | Deliver the next compatible customer | Versioned reference configuration, customer variation, compatibility and upgrade cases | A second installation and its upgrade preserve behavior without a customer Core fork. |
| Evaluation and feedback | Learn from corrections and model changes | Versioned cases, expected findings, false positives/misses, correction reasons, and actual outcome links where available | Model/rule changes are compared on the same held-out cases and do not silently worsen accepted behavior. |

Runtime correctness, adapters, permissions, and compatibility are engineering assets; they are necessary but not by themselves a market moat. Repair-specific rules, difficult cases, corrections, and verified outcomes can become industry assets through real use. Customer data rights and tenant boundaries apply; cross-customer pooling or a network effect must not be assumed.

## 6. Execution order and bounded backlog

Use an initial **6–8 week engineering planning cycle**, adjusted to actual capacity and the existing release-hardening workload. This is a planning envelope, not a delivery date, a revenue commitment, or a GA deadline. Current release blockers retain priority. Research, explicit fixtures, rule mapping, and bounded design can proceed while release/customer evidence is pending.

| Work item | Priority / owner | Deliverable and exit evidence |
| --- | --- | --- |
| RQH-01: select the first case set | P0 / Product | One repair category, buyer, input formats, current process, alternatives, authoritative-system map, and pilot acceptance criteria recorded; distinguish real, anonymized, and synthetic cases. |
| RQH-02: map the existing capabilities | P0 / Engineering | Record reused objects, business logic, role-task surfaces, Commands/permissions, additive gaps, maturity, and upgrade impact. No new foundation without the guardrail decision. |
| RQH-03: evidence to review | P1 / Product + Engineering | Operator can inspect sources, confirm or correct facts, resolve conflicts, and accept/reject review findings for the selected category. |
| RQH-04: approved scope to handoff | P1 / Engineering | Version-bound execution brief and applicable Work Order actions; a change shows a diff and preserves approval lineage. |
| RQH-05: external-Agent journey | P1 / Engineering | An approved external Agent completes the same bounded journey through supported actions; permissions, read-back, rejected actions, and recovery are demonstrated. |
| RQH-06: repeatable delivery | P2 / Engineering | Installable Pack/reference configuration, input mapping, customer variation, role-task acceptance on a second configuration, and upgrade/rollback evidence on the same maintained product lineage. |
| RQH-07: evaluation and economics | Continuous / Product + Engineering | Reusable regression cases plus measured human review, implementation, provider, and support effort. Technical and commercial conclusions are reported separately. |

Suggested batches: first evidence/review, then approved scope/handoff plus Agent execution, then repeatable installation and hard-case recovery. Evaluation starts in the first batch. Product owns case access, buyer feedback, pricing experiments, and the commercial decision; Engineering owns contracts, implementation, regression, upgrade, and execution evidence. Assign named owners when scheduling the backlog.

### When customer feedback is delayed

Continue the already scoped canonical FSM backlog, including reusable objects, processing logic, and role applications. For this slice, continue evidence traceability, supported rule checks, approval/handoff consistency, permissions, failure recovery, import validation, installation/upgrade compatibility, and measured runtime cost/performance. Use clearly labelled synthetic or expert-authored cases where necessary.

Do not use the delay to add trades, platforms, abstract orchestration, or speculative integrations. Synthetic success demonstrates engineering behavior only; it cannot establish demand, revenue lift, reduced rework, or customer repeatability. Deep learned diagnosis/optimization and claims about business outcomes require suitable real data.

Review scope after each batch. A weak commercial signal changes the scenario, offer, acquisition/delivery approach, or scale of investment; it is not a blanket instruction to stop accumulating useful engineering assets.

## 7. Acceptance and validation

### Engineering acceptance for a pilot candidate

1. Material facts and findings carry retrievable sources and versions; missing/conflicting evidence is explicit and blocks the relevant action when required by policy.
2. Supported monetary and quantity calculations are deterministic and reproducible; the Agent does not invent costs, dimensions, or margin.
3. Approval binds an identified scope/quote revision. A stale or concurrent change cannot silently overwrite the approved version.
4. The execution brief faithfully projects the approved scope, including locations, quantities, exclusions, and conditions; later changes remain traceable.
5. Governed conversion/retry does not create duplicate Work Orders or duplicate external effects.
6. Tenant, role, field, and delegated-Agent permissions are enforced; denials and human reject/correct actions are recorded.
7. Partial failures are visible and recover through supported actions; human and Agent journeys pass the same required business outcomes.
8. A second reference installation and a representative supported variation pass complete role-task and compatibility/upgrade checks without a customer-specific Core or official-Module source fork.
9. Changing the model or rules reruns the same evaluation cases, with versions, false positives, omissions, and corrections retained.

These are acceptance requirements, not a claim that results already exist. Preserve the existing release, security, financial, recovery, and performance gates for any affected capability.

### Commercial validation scorecard

Record the customer's baseline before the pilot and compare similar real jobs. Include document preparation, review, correction, handoff, and support time; distinguish active labor from waiting time. Record sample size, job differences, pricing changes, and other confounders. Revenue per job alone does not establish attributable value.

| Question | Evidence to collect | Reconsideration trigger |
| --- | --- | --- |
| Does review find valuable issues? | Confirmed material omissions/conflicts, false positives, misses, and reviewer reasons | Repeated real cases yield little useful correction or added review burden exceeds benefit. |
| Does the whole workflow improve? | Total labor/time, corrections, version mismatch, and downstream clarification/rework where observable | Preparation and verification offset the apparent saving. |
| Is there purchasing intent? | Paid pilot/delivery, real repeated use, buyer commitment and procurement steps | Suitable buyers finish useful trials but take no concrete purchasing action. |
| Can delivery repeat economically? | Implementation and support hours, provider cost, configuration reuse, second-customer changes | Similar customers still require bespoke logic and recurring effort does not decline. |
| Is the offer better for this customer? | Comparison against incumbent configuration, manual process, and general AI assistance | An available substitute provides similar results with materially less cost or change. |

Agree numeric pilot thresholds with the selected buyer before evaluation; this document invents no validated lift target. **Two paid, repeatable deliveries** are an early signal to review investment, not a substitute for the existing **3–5 customer v0.9 cohort**, coverage requirements, or GA gates. Rejections and failed pilots are evidence to retain, not results to hide by changing the denominator.

Record whether each engagement is a custom solution or a Cloud subscription. Compare scope-matched customers using total delivery/support effort and accepted role tasks, not only coding time or counts of fields/modules. Two reference configurations can prove engineering reuse; paid projects can prove delivery revenue; neither alone proves SaaS acquisition, retention, or subscription economics. A custom solution that does not meet the existing Cloud cohort criteria must not be counted as satisfying them.

## 8. External-benchmark adoption record

This decision follows the [External Benchmark Adoption Guardrails](external-benchmark-adoption-guardrails.md).

| Required question | Decision |
| --- | --- |
| Current problem | The broader FSM/runtime baseline needs a narrow, buyer-visible result and a complete, evaluable human/Agent business journey. |
| Cost of deferral | Continuing broad feature work without a focused result delays feedback and lets review/handoff logic fragment across documents and customer-specific work. This is a product risk, not proof of market demand. |
| Existing model | Reuse Quote/FSM, Forms, Workflow approval, Commands, attachments, Pack/Template, and Managed Workspace Extensions. |
| Ongoing complexity | Own bounded source/rule/version lineage, review UX and exceptions, import maintenance, Pack compatibility, and evaluation data. Introduce no second runtime. |

| Pattern | Classification | Application |
| --- | --- | --- |
| Connect one recurring valuable decision with execution and feedback | Adapt | Learn from Probook's focus; choose quote review/handoff based on asset fit and obtainable cases, without copying its dispatch optimization. |
| Consistent commercial documents and field instructions | Adapt | Use the incumbent workflow as the comparison baseline; prove a useful improvement on the selected repair category. |
| Shared business authority and explicit rollout/approval | Adopt | Apply existing Runory contracts to human and external-Agent actions. |
| Learned dispatch, broad autonomous quoting, industry expansion | Defer | Require suitable data, verified customer benefit, and a separate scope decision. |
| A duplicate Agent platform or model-written authoritative prices/state | Reject | Conflicts with the current product and execution architecture. |

Runtime impact is bounded to necessary existing-contract extensions; data impact requires additive schemas or supported extensions with migration tests; UX adds review and version-diff states on shared surfaces; delivery owns one supported mapping and Pack upgrade path; ecosystem impact requires checking provider access, licensing, and ongoing integration cost. No third-party code adoption is authorized by this research decision. Product and Engineering own this record; specific architecture changes follow the existing review process.

## 9. Related documents

- [FSM AI Market Review — 2026-11-24](../research/fsm-ai-market-review-2026-11-24.md)
- [Product Definition](product-definition.md)
- [Product Roadmap](product-roadmap.md)
- [v0.9 Repeatable Delivery Execution Plan](v0.9-repeatable-delivery-execution-plan.md)
- [Engineering Benchmark Adoption Roadmap](engineering-benchmark-adoption-roadmap.md)
- [v1.0 GA Release Goal](v1.0-ga-release-goal.md)
- [Implementation Platform Product Design](implementation-platform-product-design.md)
- [Implementation Economics and Productization](implementation-economics-and-productization.md)
