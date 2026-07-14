# Runory Documentation

> The governed entry point for Runory product, architecture, operations, release, and historical documentation.

| Metadata | Value |
| --- | --- |
| Status | `canonical` |
| Topic | `documentation-governance` |
| Applies to | `v0.5+` |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-14 |
| Supersedes | Earlier directory-based navigation |
| Superseded by | — |

Runory documentation is organized by topic authority and lifecycle rather than by filename or version number. Existing files remain in place to preserve links and history. The enforceable rules are defined in [Documentation Governance](document-governance.md).

## Start Here

| Need | Start with | Then read |
| --- | --- | --- |
| Understand Runory | [Product Definition](product/product-definition.md) | [Concepts](concepts.md), [Architecture Overview](architecture/overview.md) |
| Start using Runory | [Getting Started](getting-started.md) | [Workspace Guide](workspace-guide.md), [Packs and Modules](packs-and-modules.md) |
| Understand the platform | [Architecture Overview](architecture/overview.md) | [Module Architecture](architecture/module-architecture.md), [Repository Structure](architecture/repository-structure.md) |
| Build or extend Runory | [SDK / Module Development](sdk-module-development.md) | [Module SDK](sdk/module-sdk.md), [Workspace Extension Architecture](architecture/workspace-extension-architecture.md) |
| Operate Runory | [Operations Runbooks](operations/runbooks.md) | [Backup / Restore Runbook](operations/backup-restore-runbook.md), [Troubleshooting](troubleshooting.md) |
| Review releases | [Release Notes](release-notes.md) | [Release evidence](releases/) |
| Add or change documentation | [Documentation Governance](document-governance.md) | Run `pnpm docs:check` |

## Topic Index

### 1. Product

**Authority:** [Product Definition](product/product-definition.md)

- [Product Definition](product/product-definition.md) — canonical product boundary and positioning.
- [Product Roadmap](product/product-roadmap.md) — active FSM-first milestone sequence through v4.0.
- [v1.0 GA Release Goal](product/v1.0-ga-release-goal.md) — proposed GA target.
- [Voice Intake Product Definition](product/voice-intake-product-definition.md) — proposed phone-to-work-order product boundary.
- [Payment Product Definition](product/payment-product-definition.md) — proposed customer-payment product boundary and SaaS-billing separation.
- [Payment POC Execution Plan](product/payment-poc-execution-plan.md) — active bounded delivery and acceptance plan.
- [Commercial FSM Customer Demand Benchmark](research/commercial-fsm-customer-demand-benchmark.md) — supporting research.

Versioned iteration plans provide implementation history but do not override the Product Definition or a newer active specification.

### 2. User & Workspace

**Authority:** [Getting Started](getting-started.md) and [Workspace Guide](workspace-guide.md)

- [Getting Started](getting-started.md) — canonical onboarding journey.
- [Workspace Guide](workspace-guide.md) — active workspace operation guide.
- [Admin / Governance](admin-governance.md) — administration, audit, members, RBAC, and export.
- [Troubleshooting](troubleshooting.md) — active recovery guidance.
- [Cloud-to-Local Workspace](architecture/cloud-to-local-workspace.md) — portability and deployment choice.

### 3. FSM

**Authority:** [FSM Canonical Execution Product Architecture](product/fsm-canonical-execution-product-architecture.md)

- [FSM Canonical Execution Product Architecture](product/fsm-canonical-execution-product-architecture.md) — canonical product blueprint.
- [v0.5 Commercial FSM Technical Spec](product/v0.5-commercial-fsm-technical-spec.md) — current technical baseline.
- [v0.5.1 Commercial FSM Productization Technical Spec](product/v0.5.1-commercial-fsm-productization-technical-spec.md) — active productization specification.
- [v0.5.1 Mobile Field Work Spec](product/v0.5.1-mobile-field-work-spec.md) — mobile field-work experience.
- [FSM Owner Single-role E2E Acceptance Runbook](product/fsm-owner-single-role-e2e-acceptance-runbook.md) — active acceptance procedure.
- [FSM Owner E2E Run — 2026-07-14](releases/fsm-owner-e2e-run-2026-07-14.md) — release evidence.
- [FSM Pack Plan](product/fsm-pack-plan.md) — Pack planning context.
- [v0.5 Commercial FSM Execution Plan](product/v0.5-commercial-fsm-execution-plan.md) — historical implementation context.
- [Voice Intake Technical Specification](product/voice-intake-technical-spec.md) — proposed Twilio + Retell + Runory implementation.
- [Voice Intake POC Execution Plan](product/voice-intake-poc-execution-plan.md) — active bounded delivery and acceptance plan.

### 4. Platform & Extensibility

**Authority:** [Architecture Overview](architecture/overview.md)

- [Architecture Overview](architecture/overview.md) — canonical platform overview.
- [Module Architecture](architecture/module-architecture.md) — module boundaries and composition.
- [Workspace Extension Architecture](architecture/workspace-extension-architecture.md) — governed workspace customization.
- [Thin FSM and Agent Runtime Architecture](architecture/thin-fsm-agent-runtime.md) — proposed event-driven Agent Task and Runner operating model.
- [Agent Operations](agent-operations.md) — plan, preview, apply, audit, and rollback.
- [SDK / Module Development](sdk-module-development.md) — active authoring guide.
- [Module SDK](sdk/module-sdk.md) — SDK reference.
- [v0.5 Layered Architecture Review](architecture/v0.5-layered-architecture-review.md) — architecture review and rationale.
- [Voice Intake Integration Boundary](architecture/voice-intake-integration-boundary.md) — proposed conversation-channel adapter and command boundary.
- [Payment Integration Boundary](architecture/payment-integration-boundary.md) — proposed business-payment Module and provider-adapter boundary.
- [Payment Technical Specification](product/payment-technical-spec.md) — proposed Stripe-first provider-neutral implementation.
- [Command Runtime Performance Baseline](architecture/command-runtime-performance-baseline.md) — proposed performance model, budgets, and v0.6 acceptance baseline.
- [Performance Optimization Plan](architecture/performance-optimization-plan.md) — deployment-specific optimization work.
- [Internationalization Architecture](architecture/internationalization.md) — localization architecture.

### 5. Command, Workflow & Forms

**Authority:** [Contract-driven Command Architecture](architecture/contract-driven-command-architecture.md)

- [Contract-driven Command Architecture](architecture/contract-driven-command-architecture.md) — canonical command and mutation architecture.
- [Command Runtime Performance Baseline](architecture/command-runtime-performance-baseline.md) — performance risks, measurement scenarios, and optimization order.
- [Workspace Extension Architecture](architecture/workspace-extension-architecture.md) — governed customization boundary.
- [Thin FSM and Agent Runtime Architecture](architecture/thin-fsm-agent-runtime.md) — Agent Tasks must execute through the same governed Command boundary.
- [v0.5 Commercial FSM Technical Spec](product/v0.5-commercial-fsm-technical-spec.md) — lifecycle implementation example.
- [v0.5.1 Mobile Field Work Spec](product/v0.5.1-mobile-field-work-spec.md) — forms and workflow behavior in field use.
- [Payment Technical Specification](product/payment-technical-spec.md) — financial Command, idempotency, webhook, and refund rules.
- [Product Roadmap](product/product-roadmap.md) — stabilization and next-step context.

New command, workflow, form, or customization documents must state whether they support or supersede this authority.

### 6. Identity & Access

**Authority:** [Admin / Governance](admin-governance.md)

- [Admin / Governance](admin-governance.md) — identity, membership, RBAC, audit, and export.
- [Architecture Overview](architecture/overview.md) — platform context.
- [Workspace Guide](workspace-guide.md) — user-facing workspace behavior.

### 7. Packs, Catalog & SDK

**Authority:** [Packs and Modules](packs-and-modules.md)

- [Packs and Modules](packs-and-modules.md) — canonical user-facing model.
- [Concepts](concepts.md) — SaaS Core, Module, Pack, Template, Extension, Agent Operation, and Catalog definitions.
- [SDK / Module Development](sdk-module-development.md) — active authoring guide.
- [Module SDK](sdk/module-sdk.md) — SDK specification.
- [FSM Pack Plan](product/fsm-pack-plan.md) — domain Pack example.

SDK POC and customer validation reports are evidence, not normative SDK specifications.

### 8. Operations

**Authority:** [Operations Runbooks](operations/runbooks.md)

- [Operations Runbooks](operations/runbooks.md) — canonical operations entry.
- [Backup / Restore Runbook](operations/backup-restore-runbook.md) — active resilience procedure.
- [Troubleshooting](troubleshooting.md) — active diagnosis and recovery guide.

Drill reports validate runbooks and remain separate from normative procedures.

### 9. Releases & Evidence

**Authority:** [Release Notes](release-notes.md)

- [Release Notes](release-notes.md) — canonical release history.
- [Release evidence directory](releases/) — test reports, E2E runs, drill results, and release validation artifacts.
- [FSM Owner E2E Run — 2026-07-14](releases/fsm-owner-e2e-run-2026-07-14.md) — indexed evidence example.

Evidence records what happened at a point in time and must not silently become a product or architecture specification.

### 10. Historical Plans

The numbered documents in the `docs/` root and versioned v0.1–v0.4 plans preserve product and architecture evolution. They are not current authority unless a canonical or active document explicitly references them.

Representative historical material:

- [Vision](02-vision.md)
- [Architecture](03-architecture.md)
- [Cloud-first Architecture Pivot](04-architecture-pivot-cloud-first.md)
- [Cloud-first POC Progress](05-cloud-first-poc-progress.md)
- [Next Steps Roadmap](06-next-steps-roadmap.md)
- [SaaS Core Implementation Plan](08-saas-core-implementation-plan.md)
- [v0.2 Productization Plan](product/v0.2-productization-plan.md)
- [v0.3 Iteration Spec](product/v0.3-iteration-spec.md)
- [v0.4 Public Free Launch Plan](product/v0.4-public-free-launch-plan.md)

## Lifecycle

| Status | Meaning |
| --- | --- |
| `canonical` | Current authoritative source for a bounded topic. |
| `active` | Current guide, runbook, or implementation specification. |
| `proposed` | Design or plan not yet adopted as the baseline. |
| `historical` | Retained context that no longer directs current work. |
| `evidence` | Point-in-time test, drill, acceptance, migration, or release record. |

See [Documentation Governance](document-governance.md) for required metadata, supersession rules, placement, review cadence, and enforcement.

## Governance Rules

1. Start from this index and identify the topic authority before adding a document.
2. Do not create a competing canonical source for the same bounded topic.
3. Versioned plans and TODOs default to `proposed`; completed tests and reports default to `evidence`.
4. Adoption of a proposal must update its lifecycle and the relevant topic index.
5. Historical files remain available but do not appear as primary onboarding material.
6. Important documents must be reachable from this page through Markdown links.
7. Moves and renames require a separate migration PR with link validation.
8. New or materially edited documents must pass `pnpm docs:check`.

## Maintenance Checklist

- [ ] Select a `Topic` and `Status`.
- [ ] Add the required metadata table.
- [ ] Link the document into the appropriate topic graph.
- [ ] Identify the authority it supports or supersedes.
- [ ] Update `Supersedes` / `Superseded by` when authority changes.
- [ ] Keep evidence separate from normative specifications.
- [ ] Run `pnpm docs:check` and resolve errors.
- [ ] Update `Last reviewed` only after a material review.
