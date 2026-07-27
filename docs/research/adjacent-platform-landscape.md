# Adjacent Platform Landscape for Runory

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `architecture` |
| Applies to | `v0.6+` |
| Owner | Product / Architecture |
| Last reviewed | 2026-07-27 |
| Decision guardrails | [External Benchmark Adoption Guardrails](../product/external-benchmark-adoption-guardrails.md) |
| Supersedes | — |
| Superseded by | — |

## 1. Purpose

Runory was conceived independently, but it now sits near a visible group of platforms converging on composable, extensible, metadata-driven, and increasingly Agent-ready enterprise software.

This document records the long-term benchmark landscape and prevents two opposite mistakes:

- assuming Runory has no adjacent products;
- reacting to adjacent platforms by abandoning Runory's core governed-execution thesis.

The relevant conclusion is:

> Similar platforms validate the direction. They do not remove the need for Runory to differentiate through governed business execution, authoritative state, and external-Agent-first operation.

This document provides research input only. It does not create Product Roadmap scope by itself. Any capability proposed for adoption must pass the [External Benchmark Adoption Guardrails](../product/external-benchmark-adoption-guardrails.md) and be assigned to a binding Product or Engineering milestone.

## 2. Landscape Map

The landscape is best understood across two axes:

```text
                         Agent-ready
                              ↑
              NocoBase        │        Runory
                  Twenty      │
                              │     Windmill
App Builder  ←────────────────┼────────────────→  Business Runtime
              Directus        │   Corteza
            Budibase          │       Frappe / ERPNext
          Appsmith            │                    Odoo
                              ↓
                    Traditional Application
```

The positions are directional rather than numeric. They identify each platform's current center of gravity and should be revisited as products evolve.

## 3. Priority Reference Platforms

### 3.1 Twenty — Product Surface, Workflow Builder, and Apps

Twenty is the highest-priority product benchmark for:

- object lists, saved views, filters, sorting, grouping, and record pages;
- coherent enterprise UX and design-system consistency;
- workflow canvas, version status, run visualization, and side-panel configuration;
- application manifests, installation, publishing, and extension lifecycle;
- MCP and external-Agent exposure as the platform expands beyond CRM.

Runory already owns its core FSM objects. The opportunity is not to replace Customer, Contact, Quote, Work Order, Visit, Invoice, or Payment with Twenty. The opportunity is to mature the Product Surface and Record Experience around Runory's existing business model.

Detailed benchmark: [Twenty Platform Benchmark](twenty-platform-benchmark.md).

### 3.2 NocoBase — Metadata, Plugins, AI, and MCP

NocoBase is a high-priority architecture and platform benchmark for:

- data-model-driven application composition;
- microkernel and plugin architecture;
- workflow and permissions as shared platform services;
- internal and external Agent access over common business metadata;
- self-hosting and extensible enterprise deployment.

NocoBase is especially relevant when evaluating whether Runory's Modules, Packs, Dynamic Views, and external-Agent interfaces form a coherent platform rather than a collection of FSM features.

### 3.3 Frappe / ERPNext — Framework and Module Ecosystem

Frappe is a long-term precedent for:

- metadata-driven business applications;
- DocType-style object, form, permission, and workflow composition;
- installable Apps and business modules;
- the evolution from framework to broad ERP ecosystem;
- long-lived upgrade and implementation practices.

Frappe is a useful reference for Runory's longer-term ambition to become an SMB business platform, while Runory remains FSM-first through v1.0.

### 3.4 Windmill — Workflow Runtime

Windmill should be studied for:

- workflow-as-code and visual workflow coexistence;
- retries, branches, loops, errors, approvals, and execution diagnostics;
- durable orchestration and operational visibility;
- the boundary between technical automation and business-readable workflows.

Runory's Workflow Runtime must remain Command-driven and business-semantic, but Windmill is a strong execution and developer-experience reference.

### 3.5 Directus — Data Platform and Extension Framework

Directus is relevant for:

- metadata and data-studio separation;
- generated APIs and permissions;
- extension SDKs and custom layouts;
- flow logs, debugging, and operational tooling;
- object-view composition over an authoritative data model.

### 3.6 Odoo — Module Marketplace and Commercial Model

Odoo is the strongest commercial reference for:

- a stable core plus a large module catalog;
- vertical and horizontal business applications in one ecosystem;
- implementation partners and third-party extensions;
- progressive customer expansion across business functions.

Odoo validates the commercial potential of a modular SMB platform, but it is not the primary reference for modern Agent-first architecture or UX.

## 4. Secondary References

### Corteza

Study its low-code data modules, permissions, CRM composition, and visual workflow model. It demonstrates the pattern of building CRM on a more general business platform.

### Budibase and Appsmith

Study their internal-tool construction, data-source integration, and application-building ergonomics. They are useful Product Surface references but do not currently define authoritative business execution in the same way Runory intends to.

## 5. What the Landscape Validates

The adjacent platforms collectively validate several Runory decisions:

- metadata-driven business objects and views;
- composable Modules, Packs, and extensions;
- Cloud plus supported self-host or local deployment paths;
- visual workflow and operational diagnostics;
- open APIs, MCP, and external-Agent interfaces;
- business applications built on reusable platform foundations.

The convergence is not accidental. It is driven by the same market pressures:

- traditional SaaS is too rigid for many customers;
- low-code is configurable but can become difficult to govern and maintain;
- Vibe Coding increases software supply but does not remove production engineering;
- Agents can understand business intent but need controlled execution boundaries;
- enterprises increasingly value openness, portability, and data ownership.

## 6. Runory's Required Differentiation

Runory must not rely on adjacent platforms remaining CRM-only, low-code-only, or human-operated. Their capabilities will continue to expand.

Runory's durable differentiation must be deeper:

- named Business Commands instead of unrestricted CRUD;
- explicit actor identity and delegated Agent authority;
- domain invariants and legal state transitions;
- permission, policy, risk, and approval enforcement;
- atomicity, idempotency, concurrency control, and authoritative outcomes;
- workflow instances, human work items, retries, escalation, and compensation;
- audit, rollback, events, and operational diagnostics;
- external-Agent-first capability contracts;
- FSM domain depth and commercially complete workflows;
- Cloud-first delivery with a controlled Cloud-to-Local path.

The product boundary remains:

```text
Agent proposes and orchestrates.
Humans govern and approve where required.
Runory validates, executes, and records authoritative business state.
```

## 7. Product Implications

### 7.1 Object View Framework

Runory should stop treating object-list and record-detail quality as isolated page work. A shared Object View Framework should support:

```text
Business Object
→ View Definition
→ Query / Filter / Sort / Group
→ Field Presentation
→ Record Actions
→ Desktop Table / Mobile Card / Board / Agent View
```

Twenty and Directus are key benchmarks, but the framework must expose Runory-specific execution state, responsibility, SLA, risk, and next action.

### 7.2 Workflow Builder

Runory should first make its existing Workflow V2 definitions and Runs
business-readable. An enterprise-grade Workflow Builder remains a possible
later product, not a current milestone requirement.

Its product thesis is:

> **Agent-managed, human-governed workflow.**

If repeated implementation evidence later justifies a Builder, the research
model has four modes:

1. **Overview** — business-readable process explanation;
2. **Review** — Agent-generated change diff, impact, and risk;
3. **Configure** — advanced editing for implementers;
4. **Run** — actual execution path, state, timing, errors, approvals, and audit.

The immediate trust surface is the existing Workflow Overview and Run view,
showing that execution is structured, versioned, inspectable, and governed.

### 7.3 Apps, Packs, and Extensions

Runory should continue formalizing:

- stable IDs and manifests;
- installation and metadata migration;
- compatibility validation;
- Official Module, Industry Pack, and Workspace Extension ownership;
- typed SDK and CLI workflows;
- publishing, upgrade, rollback, and marketplace mechanics.

## 8. Research and Decision Rules

Runory should use adjacent platforms as:

1. **market validation**;
2. **product-quality benchmarks**;
3. **architecture references**;
4. **potential component references where licensing permits**;
5. **adjacent competitors whose direction may affect Runory positioning**.

Runory should not:

- replace its existing Business layer merely to obtain a more polished UI;
- become a thin FSM App inside another platform without a clear strategic decision;
- copy AGPL or commercially licensed code without legal review;
- copy resource-level workflow semantics that bypass Runory Commands;
- expand beyond FSM before the current roadmap and customer evidence justify it.

All downstream adoption decisions must follow the [External Benchmark Adoption Guardrails](../product/external-benchmark-adoption-guardrails.md), including the four mandatory questions, one-problem/one-model rule, structural-change budget, complexity assessment, and Adopt / Adapt / Defer / Reject classification.

## 9. Review Cadence

Review this landscape:

- before major Product Surface decisions;
- before Workflow Builder architecture decisions;
- before Module SDK or marketplace changes;
- before Cloud-to-Local implementation milestones;
- when Twenty, NocoBase, Frappe, Windmill, Directus, or Odoo ships a strategically relevant release;
- at least once per quarter while Runory remains pre-1.0.

Each review should answer:

- Which shared platform capabilities have become table stakes?
- Which UX patterns should enter the Runory design system?
- Are competitors moving toward named business actions or still exposing CRUD?
- How are Agent identity, delegated authority, approvals, and audit handled?
- How mature are workflow versioning, run diagnostics, and human governance?
- Does any development weaken Runory's current differentiation?
- Which capability should Runory adopt, adapt, defer, or explicitly reject?

## 10. Current Conclusion

> **Runory sits at the intersection of several converging platform directions, but its strategic center must remain the governed business execution Runtime.**

Twenty is currently the strongest Product Surface and Workflow Builder reference. NocoBase is a major metadata, plugin, AI, and MCP reference. Frappe validates the framework-and-module path. Windmill informs Workflow Runtime. Directus informs the data and extension surface. Odoo validates the module-market commercial model.

Runory should study all of them over the long term, absorb their strongest patterns selectively, and continue making governed business execution deeper, clearer, and more operationally credible than adjacent platforms.
