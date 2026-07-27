# Twenty Platform Benchmark for Runory

Status: Living research note  
Date: 2026-07-27  
Review cadence: Revisit at major Twenty releases and before major Runory Product Surface or Workflow Builder decisions.

## 1. Purpose

Twenty is one of the most relevant long-term reference projects for Runory.

It should not be treated simply as an open-source CRM competitor. Twenty is evolving toward a programmable enterprise application platform built around custom objects, views, workflows, applications, permissions, AI agents, and self-hosting.

This overlaps with several Runory concerns:

- metadata-driven business objects;
- configurable record views and layouts;
- application and extension packaging;
- workflow authoring and visualization;
- AI and Agent integration;
- cloud and self-host deployment;
- developer tooling and versioned application delivery.

The overlap validates important parts of the Runory direction, while also providing a concrete implementation against which Runory can benchmark product quality and architecture decisions.

## 2. Strategic Interpretation

Twenty and Runory share part of the same product territory, but their centers of gravity differ.

Twenty is currently application- and workspace-centric:

```text
Objects + Views + Workflows + Apps
→ configurable CRM and business applications
→ used by humans and embedded AI
```

Runory is business-execution- and Agent-centric:

```text
Business Intent
→ External Agent or Human
→ Governed Command / Workflow
→ Runory Runtime
→ Authoritative Business State
```

The practical implication is:

> Twenty is a strong reference for how configurable enterprise software is constructed, presented, and extended. Runory must remain differentiated in how business actions are governed, executed, audited, versioned, and exposed to external Agents.

## 3. What Runory Should Study Continuously

### 3.1 Product Surface and Enterprise UX

Twenty should be used as a benchmark for:

- object list pages;
- table, board, filter, sort, and saved-view interactions;
- record detail pages;
- activity timelines;
- navigation and command menus;
- settings and configuration experiences;
- empty, loading, error, and permission states;
- density, hierarchy, keyboard interaction, and interaction consistency.

Runory already has core business objects such as Customer, Lead, Contact, Quote, Work Order, Visit, Invoice, and Payment. The primary opportunity is not to rebuild these objects, but to improve the Product View and Record Experience layers around them.

A useful target architecture is:

```text
Business Object
→ View Definition
→ Query / Filter / Sort / Group
→ Field Presentation
→ Record Actions
→ Desktop Table / Mobile Card / Board / Agent View
```

### 3.2 Workflow Builder

Twenty's Workflow Builder is a high-priority reference for:

- editable node-and-edge canvas;
- trigger and action selection;
- branching and conditions;
- side-panel configuration;
- version status;
- read-only visualization;
- workflow run visualization;
- node layout and interaction details.

Runory should not copy Twenty's user-managed automation model directly. The Runory target is:

> **Agent-managed, human-governed workflow.**

The expected Runory lifecycle is:

```text
User states a business requirement
→ Agent proposes or edits a workflow draft
→ Builder visualizes the workflow and its changes
→ Runtime validates commands, permissions, risks, and compatibility
→ User reviews and approves
→ Version is published
→ Runs, exceptions, approvals, and audit events remain visible
```

The Builder should therefore support four product modes:

1. **Overview** — business-readable workflow explanation;
2. **Review** — Agent-generated changes, risk, and impact diff;
3. **Configure** — advanced manual editing for implementers;
4. **Run** — actual execution path, state, timing, errors, and audit.

Runory-specific node categories should include:

- Trigger;
- Business Command;
- Governance Check;
- Approval;
- Human Task;
- Condition and Branch;
- Wait, Retry, Escalation;
- Completion and Compensation.

The Builder is not merely an editing feature. It is a major trust and credibility surface that proves Runory operates structured, inspectable, enterprise-grade business processes rather than opaque Agent automation.

### 3.3 Apps, Manifest, and Extension Lifecycle

Twenty's application model should be studied for:

- declarative entity definitions;
- manifest generation;
- stable identifiers;
- metadata migration;
- installation and upgrade lifecycle;
- role and permission declarations;
- sandboxed server and front-end extensions;
- CLI and local development experience;
- typed SDK generation;
- publishing and marketplace mechanics.

These topics map directly to Runory Modules, Packs, and Managed Workspace Extensions.

Runory should preserve the ownership hierarchy:

```text
Official Module
→ Industry Pack
→ Managed Workspace Extension
```

Customer-specific extensions must remain isolated from official Module source and compatible with future upgrades.

### 3.4 AI and External Agent Integration

Twenty's AI capabilities and MCP support should be monitored, particularly where it exposes objects, actions, workflows, and application capabilities to external Agents.

Runory should compare these developments against its own stricter execution contract:

- named business Commands rather than unrestricted CRUD;
- explicit actor identity and delegated authority;
- risk classification and approval requirements;
- validation and domain invariants;
- atomicity, idempotency, and concurrency control;
- audit, compensation, and rollback;
- authoritative business-state ownership.

Twenty may become increasingly Agent-capable. Runory's differentiation cannot depend on Twenty remaining CRM-only. It must depend on a deeper governed execution model.

## 4. What May Be Borrowed and What Must Remain Runory-Owned

### Borrow or closely benchmark

- Product Surface patterns;
- object view framework;
- record-page composition;
- Workflow Builder interaction model;
- application manifest concepts;
- extension lifecycle and CLI ergonomics;
- design-system consistency;
- deployment and self-host operational experience.

### Keep Runory-owned

- Command Contracts;
- domain invariants;
- governed business actions;
- workflow execution semantics;
- approvals and human work items;
- Agent delegation and authorization;
- transaction, idempotency, audit, rollback, and compensation;
- FSM domain depth;
- external-Agent-first capability contract;
- authoritative business state.

## 5. Code Reuse Boundary

Twenty is valuable as an architectural and product reference, but direct code reuse must be treated cautiously.

The repository is tightly coupled to its own data model, GraphQL layer, state management, UI framework, and workflow schema. Its open-source licensing also requires legal review before code is copied, forked, or embedded into Runory.

The default Runory strategy should be:

```text
Study behavior and architecture
→ document reusable patterns
→ implement against Runory contracts
→ selectively reuse only clearly separable and license-compatible components
```

For the Workflow Builder specifically, the preferred approach is:

```text
React Flow or equivalent canvas foundation
+ Twenty interaction reference
+ Runory Workflow Schema
+ Runory Command Runtime
+ Runory Governance Model
```

## 6. Competitive and Product Implications

Twenty should be considered simultaneously as:

1. **market validation** — configurable, open, extensible enterprise software is becoming more important;
2. **product benchmark** — it exposes gaps in Runory's Product Surface and developer experience;
3. **architecture reference** — it provides concrete solutions for metadata, apps, workflow, permissions, and extensions;
4. **adjacent competitor** — its platform may continue moving beyond CRM and toward broader Agent-enabled business applications.

Runory should not attempt to match every Twenty feature. It should selectively reach comparable enterprise polish in shared platform surfaces while investing more deeply in governed execution and Agent-first operation.

## 7. Ongoing Research Questions

Each significant review should answer:

- Has Twenty expanded beyond CRM into general business applications?
- Has its object and view framework materially improved?
- How has its app manifest and installation lifecycle changed?
- What workflow triggers, actions, versioning, and run diagnostics now exist?
- How much of the workflow experience is user-managed versus Agent-managed?
- How are permissions, identities, approvals, and audit enforced?
- Does Twenty expose business-semantic actions or primarily record-level CRUD?
- How mature are MCP and external Agent capabilities?
- Which UX patterns should enter the Runory design system?
- Does any development reduce or threaten Runory's current differentiation?

## 8. Near-Term Actions

1. Complete a page-by-page Product Surface comparison, beginning with Customers, Work Orders, and Record Detail.
2. Produce a Runory Object View Framework specification rather than continuing page-specific list implementations.
3. Define the Runory Workflow Builder product specification around Overview, Review, Configure, and Run modes.
4. Map Twenty workflow concepts to Runory Workflow Definitions, Versions, Instances, Events, and Work Items.
5. Maintain a lightweight release watch and update this document when Twenty makes strategically relevant changes.

## 9. Conclusion

> **Twenty is not a foundation Runory needs to adopt wholesale. It is a long-term benchmark that Runory should study systematically.**

Its strongest value is showing how a configurable enterprise platform can achieve product completeness, coherent UX, extension tooling, and visible workflow sophistication.

Runory should absorb those lessons while preserving its core distinction:

> **Agent proposes and manages; humans govern; Runory validates, executes, and records authoritative business state.**

## References

- Twenty website: https://twenty.com/
- Twenty repository: https://github.com/twentyhq/twenty
- Twenty documentation: https://docs.twenty.com/
