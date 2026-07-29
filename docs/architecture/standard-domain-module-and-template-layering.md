# Standard Domain Module and Template Layering

| Metadata | Value |
| --- | --- |
| Status | `proposed` |
| Topic | `module-architecture / product-composition` |
| Applies to | `all Official Modules, Packs, Templates, and Workspace Extensions` |
| Owner | Product / Architecture / Engineering |
| Last reviewed | 2026-07-29 |
| Supports | [Module Architecture](module-architecture.md) |
| Supersedes | Product-specific interpretations that place customer forms, provider setup, or customer-specific workflow details inside a reusable domain Module |
| Superseded by | — |

This document defines a cross-cutting Runory product rule:

> Official Modules implement stable domain capabilities. Packs, Templates, metadata-driven Forms, provider adapters, and Workspace Extensions express product, industry, and customer differences.

This rule applies to every Runory domain, including CRM, Sales, FSM, Payment, Voice Intake, Implementation, Expense, Inventory, and future Modules.

## 1. Decision

Runory must not create a separate codebase or domain Module for every customer variation.

The required layering is:

```text
Platform Core
→ standard Official Domain Modules
→ Business Packs
→ Workspace Templates
→ metadata-driven Forms / Views / Rules
→ Provider Adapters
→ Managed Workspace Extensions
→ customer business data
```

The standard Module owns durable domain semantics. The layers above it compose, configure, label, present, connect, and extend those semantics without duplicating the Module.

## 2. What remains standard

A domain Module should standardize the business concepts that remain valid across supported customers.

Typical Module-owned concerns are:

- canonical business objects and relations;
- authoritative ownership of mutable business facts;
- stable lifecycle states and legal transitions;
- named Command Contracts and domain invariants;
- permissions and audit facts;
- domain events and extension points;
- reusable baseline views, forms, workflows, metrics, and Agent Skills;
- migration and compatibility contracts.

For example, `runory.implementation` may standardize:

- Implementation Run;
- Implementation Blueprint and versioning;
- Customer Input Request;
- Migration Plan and Batch;
- Test Suite and Test Run;
- Approval Gate;
- Go-live Plan;
- Implementation Issue and Hypercare Case;
- implementation lifecycle, permissions, evidence, cost, and quality semantics.

These concepts do not become Runory-product-specific merely because Runory is the first reference customer.

## 3. Where differences belong

### 3.1 Business Pack

A Pack combines Modules into a commercial or operational solution.

Examples:

```text
Runory Product Implementation Pack
= CRM + Sales + FSM + Payment + runory.implementation
```

```text
Field Service Operations Pack
= CRM + Scheduling + FSM + Payment + Voice Intake
```

A Pack may define dependencies, required capabilities, default workflows, role bundles, and compatibility locks. It must not redefine Module invariants.

### 3.2 Workspace Template

A Template defines the default user experience for a type of business or delivery model:

- navigation;
- terminology;
- homepage and dashboards;
- role entry points;
- default views and filters;
- enabled process variants;
- sample data and onboarding guidance.

### 3.3 Forms, fields, views, and rules

Customer and industry differences should normally be expressed through metadata:

- Form Definitions;
- Field Definitions;
- View Definitions;
- Workflow Definitions;
- validation and visibility rules;
- required-input checklists;
- approval policies;
- notification templates.

A form difference is not a reason to fork or duplicate a Module.

### 3.4 Provider Adapter

External systems belong behind provider-neutral capability contracts.

Examples:

- Twilio telephony adapter;
- Retell Voice Agent adapter;
- Stripe payment adapter;
- accounting, calendar, email, storage, and future provider adapters.

A provider adapter translates a provider API into Runory semantic capabilities. Provider payloads and credentials must not become canonical Module fields.

### 3.5 Managed Workspace Extension

A Workspace Extension expresses a customer-specific difference that is not suitable as a shared Module default or reusable Template.

Examples:

- customer-specific fields;
- special approval steps;
- a proprietary integration;
- customer-specific dashboards;
- additional Agent Skills;
- exceptional workflow rules.

Extensions must remain versioned, validated, auditable, upgrade-compatible, and governed through the same Command boundary.

## 4. Product-specific reference implementations

Runory may use one customer or product as the first complete reference implementation. That does not change the ownership boundary.

For `runory.implementation`:

```text
runory.implementation
= standard implementation domain Module

Runory Product Implementation Pack
= Runory-specific module composition and delivery policy

Runory Implementation Workspace Template
= Runory-specific navigation, terminology, roles, dashboards, and forms

Twilio / Retell / Stripe adapters
= provider-specific execution

Workspace Extensions
= exceptional customer differences
```

Therefore, the following belong outside the permanent core of `runory.implementation`:

- mandatory dependence on Twilio, Retell, or Stripe;
- a Runory-only Blueprint schema;
- Runory-only Pack installation details;
- fixed Voice Intake forms for every implementation;
- customer-specific fields and approval policies;
- provider credentials and raw provider objects.

They may be included in the first Runory reference Pack and Template, while the underlying Module remains provider-neutral and reusable.

## 5. Module design test

Before adding a field, state, Command, workflow, or dependency to an Official Module, Product and Engineering must ask:

1. Does this represent a stable domain concept across the supported market?
2. Is it an authoritative business fact rather than a presentation or configuration preference?
3. Does it require a domain invariant or governed Command?
4. Would placing it in the Module improve reuse without forcing irrelevant complexity on other customers?
5. Could it instead be represented by a Pack, Template, Form, provider adapter, policy, or Workspace Extension?

If the answer to question 5 is yes and no domain invariant requires Module ownership, it should normally remain outside the Module core.

## 6. Anti-patterns

The following are prohibited:

- cloning a Module because one customer's form fields differ;
- embedding one provider's API model into a canonical domain object;
- making an optional product capability a hard dependency for all installations;
- encoding customer-specific terminology in Module object keys;
- putting implementation scripts outside governed Commands because they are considered temporary;
- using Workspace Extensions to replace a missing shared domain invariant;
- creating a Pack that silently redefines Module lifecycle rules.

## 7. Application to current documents

The following documents must be interpreted and implemented under this rule:

- [Implementation Platform Product Design](../product/implementation-platform-product-design.md)
- [Implementation Platform Technical Specification](../product/implementation-platform-technical-spec.md)
- [Customer Implementation and Agent-assisted Delivery Model](../product/customer-implementation-delivery-model.md)
- [Implementation Economics and Productization](../product/implementation-economics-and-productization.md)

In those documents:

- Implementation Run, Blueprint, Inputs, Migration, Tests, Gates, Go-live, Hypercare, evidence, and economics describe the standard `runory.implementation` domain;
- Runory Workspace provisioning, Pack installation, Voice Intake setup, Twilio, Retell, and Stripe describe the first Runory Product Implementation Pack, its Templates, and provider adapters;
- customer-specific form fields and policies belong to metadata or Managed Workspace Extensions.

This clarification narrows ownership without reducing the agreed first reference implementation scope.

## 8. Acceptance criteria

This architecture direction is satisfied when:

- [ ] each Official Module has a provider-neutral domain boundary;
- [ ] customer form differences are implemented through metadata, not Module forks;
- [ ] Packs compose Modules without redefining their invariants;
- [ ] Templates own navigation, terminology, default views, and role experience;
- [ ] provider-specific behavior is isolated behind adapters;
- [ ] customer-specific exceptions use governed Workspace Extensions;
- [ ] the same named Commands are used by UI, Workflow, Automation, MCP, Skills, and Agents;
- [ ] reference-customer implementation does not create permanent product-specific coupling in the Module core;
- [ ] Catalog validation and contract tests enforce dependency and compatibility boundaries.

## 9. Related documents

- [Architecture Overview](overview.md)
- [Module Architecture](module-architecture.md)
- [Workspace Extension Architecture](workspace-extension-architecture.md)
- [Contract-Driven Command Architecture](contract-driven-command-architecture.md)
- [Implementation Platform Product Design](../product/implementation-platform-product-design.md)
- [Implementation Platform Technical Specification](../product/implementation-platform-technical-spec.md)
