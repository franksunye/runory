# Implementation Economics and Productization

| Metadata | Value |
| --- | --- |
| Status | `proposed` |
| Topic | `commercial-pricing / product-delivery` |
| Applies to | `v0.9+ / paid production workspaces` |
| Owner | Product / Commercial / Engineering / Customer Success |
| Last reviewed | 2026-07-29 |
| Supersedes | — |
| Superseded by | — |

Runory implementation is both a real delivery activity with real cost today and a product-learning loop that should make future delivery faster, more predictable, and less expensive.

This document supplements [Commercial Pricing and Packaging](commercial-pricing-and-packaging.md), [Customer Implementation and Agent-assisted Delivery Model](customer-implementation-delivery-model.md), and [Implementation Platform Product Design](implementation-platform-product-design.md). The pricing document remains authoritative for commercial bands; the delivery model remains authoritative for implementation phases, gates, provider ownership, approvals, and production cutover; the product-design document defines the objects, surfaces, Agent interfaces, Provider Foundation, and minimum complete implementation product.

## 1. Decision

Implementation must not be treated as free merely because Runory intends to automate it later.

The operating principle is:

> Charge for the work and risk that exist today; measure them accurately; then eliminate, standardize, automate, or safely delegate them through the product.

The long-term direction is:

```text
manual expert delivery
→ standardized checklist and template
→ guided product workflow
→ Agent-assisted provisioning and validation
→ repeatable partner delivery
→ bounded self-service where risk permits
```

Implementation revenue is not the strategic goal by itself. The strategic goal is repeatable customer activation with the lowest safe and economically rational delivery burden.

## 2. Why implementation has a separate fee

A paid production Workspace may require work beyond software access:

- discovery and solution blueprint;
- Workspace, roles, service catalog, lifecycle, forms, and scheduling configuration;
- Twilio number, routing, messaging, and regulatory setup;
- Retell Agent, prompt, knowledge, transfer, disclosure, webhook, and test setup;
- customer-owned Stripe Connect onboarding and payment readiness;
- data profiling, mapping, migration, and reconciliation;
- external integrations;
- QA, UAT, training, cutover, rollback preparation, and hypercare.

These activities consume specialist time, provider usage, coordination, and delivery risk. Hiding them inside a low subscription price would obscure the real cost, weaken gross margin, and make partner economics unsustainable.

## 3. Initial implementation fee bands

The current planning bands remain:

| Plan / scope | Proposed standard implementation fee |
| --- | ---: |
| Starter | **$1,000–$2,000** |
| Growth | **$2,500–$5,000** |
| Pro | **From $7,500** |
| Complex migration, integration, or custom delivery | Separately scoped |

These are initial forecasts, not permanent price commitments. The applicable fee must follow accepted scope and expected effort rather than the subscription name alone.

Early-customer discounts may reduce or waive part of the implementation fee, but the order should still show:

- standard implementation fee;
- explicit discount;
- included scope;
- assumptions and exclusions;
- expiration or founding-customer condition.

This preserves the economic meaning of the work and avoids creating an expectation that implementation is inherently free.

## 4. Effort and cost model

Before enough customer evidence exists, every implementation should be estimated by delivery component.

| Cost component | Work to estimate | Main productization opportunity |
| --- | --- | --- |
| Qualification and blueprint | Interviews, scope, business rules, acceptance criteria | Structured discovery, website/document extraction, Blueprint generation |
| Workspace configuration | Users, roles, service catalog, lifecycle, forms, scheduling | Packs, templates, presets, preview/apply Commands |
| Voice and messaging | Number strategy, Twilio, Retell, routing, disclosures, testing | Provider adapters, provisioning Commands, reusable policies, automated test calls |
| Payment connection | Stripe Connect, webhook, readiness checks, test/live cutover | Guided Connect flow, readiness checks, governed production enablement |
| Migration | Source profiling, mapping, cleaning, import, reconciliation | Mapping suggestions, dry run, reusable import recipes, exception reports |
| Integration | Calendar, email, accounting, CRM, API, web forms | Standard connectors and reusable provider adapters |
| QA and UAT | Scenario design, execution, defect review, evidence | Generated suites, automated execution, evidence capture |
| Training and launch | Role training, cutover, monitoring, hypercare | In-product guidance, Launch Agent, health checks |

The internal estimate should record at least:

- expected human hours by role;
- third-party and test usage cost;
- partner or specialist cost;
- risk contingency for customer data and provider uncertainty;
- target elapsed time;
- customer and third-party dependencies;
- scope assumptions and exclusions.

A practical planning model is:

```text
expected delivery labor
+ provider and test cost
+ partner or specialist cost
+ risk contingency
= expected implementation cost

expected implementation cost
+ required implementation contribution
= quoted implementation fee
```

## 5. Productization classification

Every repeated manual implementation step should be classified as one of:

1. **Eliminate** — remove unnecessary work through a better default or product decision.
2. **Standardize** — convert it into a checklist, Pack, template, preset, policy, or reusable integration.
3. **Automate** — execute it through a governed Command, workflow, or Implementation Agent.
4. **Delegate safely** — make it repeatable for a certified partner or customer administrator.
5. **Retain as expert work** — keep it human-led because it requires judgment, compliance, exceptional data handling, or material business-risk acceptance.

The objective is not zero implementation in every case. Standard customers should approach bounded, Agent-assisted implementation; complex customers may continue to require paid expert delivery.

## 6. Agent-assisted implementation priorities

The highest-value automation candidates are:

- conversational discovery and completeness checks;
- customer website, document, and CSV extraction;
- Implementation Blueprint generation;
- industry and workflow templates;
- Workspace and role configuration previews;
- Twilio Subaccount, number, routing, and messaging provisioning;
- Retell Agent, prompt, knowledge, transfer, and webhook setup;
- Stripe Connect onboarding initiation and readiness checks;
- migration profiling, mapping, dry run, reconciliation, and exception reports;
- generated scenario suites and automated Voice test calls;
- customer approval and evidence collection;
- production cutover, rollback, monitoring, and hypercare checks;
- partner-facing guided delivery and certification.

Automation must use governed Runory Commands rather than unrestricted external-provider console or API access. Material cost, legal declarations, production publication, payment activation, data replacement, and go-live remain approval-gated.

## 7. Implementation Run economics data

Every paid Implementation Run should capture enough actual data to replace assumptions with evidence:

- scoped fee, discount, and collected amount;
- planned and actual hours by phase and role;
- manual versus automated steps;
- provider and test usage cost;
- rework, defects, and blocked days;
- partner-delivered effort and Runory escalation effort;
- time to first usable pilot;
- time to production;
- hypercare effort;
- implementation contribution;
- reusable templates, Commands, connectors, tests, or documentation created.

This data should be attributed by Workspace, implementation type, industry template, provider combination, and delivery owner where appropriate.

## 8. Review and price-reduction rule

Product, Commercial, Engineering, and Customer Success should review implementation cohorts regularly.

Implementation fees may be lowered, repackaged, or partially included in subscription only when actual evidence shows that:

- human effort has fallen;
- provider and test cost is understood and recoverable;
- first-pass quality has improved;
- rework and exception rates are controlled;
- elapsed time has fallen;
- customer outcomes and governance have not weakened;
- partner delivery remains economically sustainable.

Do not reduce implementation fees merely to improve headline pricing while Runory or a partner still carries the same labor, liability, and support burden.

## 9. Product backlog rule

A delivery shortcut is not automatically productization.

A repeated implementation need should enter the product backlog when it:

- applies across supported customers or a defined industry template;
- can be represented through stable data, policy, workflow, or Commands;
- can be governed, tested, audited, and supported;
- materially reduces cost, risk, error, or elapsed time;
- does not create disproportionate platform complexity.

Implementation learnings should produce explicit backlog candidates, not remain only in project notes or staff memory.

## 10. Directional success measures

Final targets should be set after real-customer evidence exists. Directionally, Runory should improve:

- implementation hours per standard customer;
- calendar time from order to pilot;
- calendar time from pilot to production;
- percentage of steps completed through product workflows or Agents;
- first-pass UAT success rate;
- migration reconciliation rate;
- Voice test pass rate;
- provider-provisioning failure rate;
- rework and hypercare hours;
- implementation contribution margin;
- percentage of implementations delivered by certified partners without Runory escalation.

Cost reduction must not come from weakening validation, audit, approvals, security, or customer acceptance.

## 11. Customer-facing principle

The recommended explanation is:

> Implementation is charged for the real work required to make the customer's operating system correctly configured, connected, tested, and production-ready. Runory is actively turning repeated implementation work into reusable product capability and Agent-assisted automation so future implementations become faster, more predictable, and less expensive.

This statement must not imply that all customer-specific work will eventually become free.

## 12. Related documents

- [Commercial Pricing and Packaging](commercial-pricing-and-packaging.md)
- [Customer Implementation and Agent-assisted Delivery Model](customer-implementation-delivery-model.md)
- [Implementation Platform Product Design](implementation-platform-product-design.md)
- [Product Definition](product-definition.md)
- [Voice Intake Product Definition](voice-intake-product-definition.md)
- [Voice Intake Technical Specification](voice-intake-technical-spec.md)
- [Payment Product Definition](payment-product-definition.md)
- [Stripe Connect Pre-GA Completion Plan](stripe-connect-pre-ga-plan.md)
- [Agent Operations](../agent-operations.md)
- [Contract-driven Command Architecture](../architecture/contract-driven-command-architecture.md)
