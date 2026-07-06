# Runory Next Steps Roadmap

Status: Approved v1.0
Date: 2026-06-22
Updated: 2026-07-03 (advance current target to v0.5 and link later product milestones)
Prerequisite: Cloud-first POC completed
Detailed SaaS plan: [08-saas-core-implementation-plan.md](08-saas-core-implementation-plan.md)
Next productization plan: [product/v0.2-productization-plan.md](product/v0.2-productization-plan.md)
Current commercial FSM plan: [product/v0.5-commercial-fsm-execution-plan.md](product/v0.5-commercial-fsm-execution-plan.md)
Post-v0.5 milestone roadmap: [product/post-v0.5-product-milestone-roadmap.md](product/post-v0.5-product-milestone-roadmap.md)
Customer-demand benchmark: [research/commercial-fsm-customer-demand-benchmark.md](research/commercial-fsm-customer-demand-benchmark.md)
Runory 1.0 GA goal: [product/v1.0-ga-release-goal.md](product/v1.0-ga-release-goal.md)

## 1. Current Position

The Cloud-first POC has proven the core product hypothesis: Metadata-driven objects + Agent-governed Workspace Extensions can form a running business application without generating runtime code.

Current work moves from "proving the platform hypothesis" into two parallel tracks:

```text
Track A — SaaS Core: make the Cloud product safe to launch, collaborate in, and commercialize
Track B — Product Runtime: make CRM Lite and Agent configuration create sustained business value
```

The SaaS Core boundary is defined by [07-saas-core-boundaries.md](07-saas-core-boundaries.md). This file only maintains cross-domain priorities and does not repeat detailed security and data-model checklists.

`v0.1–v0.3` established the Cloud, SaaS, Catalog, and Product Runtime foundations; `v0.4` is completing public launch and online performance closure. The current next product target is [v0.5 Commercial FSM Execution And Planning](product/v0.5-commercial-fsm-execution-plan.md): make CRM, Quote, and FSM become a commercially pilotable system through auditable execution and planning backbones.

The mobile field-entry and form/My Work specifications for `v0.5.1`, and the continuous service, commercial operations, external connection, offline, and AI milestones for `v0.6+`, are governed by the current roadmap documents linked at the top of this file. Sections 2–4 below retain priorities and historical debt from early SaaS foundation work and are no longer the current product-version order.

## 2. Priority Order

### P0 — Cloud Safety and Identity

- Consolidate RequestContext, Principal, Role Policy, and versioned Migration.
- Email OTP + server-side Session.
- Organization, Invitation, fixed RBAC, and Owner invariants.
- Unified tenant isolation across HTTP/MCP/Agent/Job.
- Append-only Audit and Workspace-scoped API Key.
- Cross-tenant security regression suite.

Completion standard: unauthenticated users and cross-tenant users cannot read or modify data through any entry point; multi-user Organizations can complete the full invitation, authorization, and removal loop.

### P0 — Production Operations

- Vercel + Turso production deployment.
- Secret, rate limit, security headers, and structured errors.
- Platform migration deployment job.
- Database backup, real restore drill, and incident runbooks.
- Workspace export, archive, restore, and purge foundation.
- Browser E2E, observability, and production readiness gate.

Completion standard: the service can be restored from backup and pass tenant isolation plus core business tests again.

### P0 — Catalog & Release Control Plane POC

- Git/CI → immutable Cloud Catalog artifact.
- Module/Pack/Template versions and structured validation.
- Pack dependency resolver and frozen lock.
- Internal/Beta/Stable release promotion.
- Sandbox Workspace compatibility validation.
- Workspace Module Center and upgrade preflight.
- Rollout observability, pause, and failure isolation.
- Internal SDK toolchain: typed authoring, validate, test harness, build, publish candidate.

Completion standard: `runory.customer` 1.0 → 1.1 forms a complete auditable loop from candidate, Sandbox, Beta rollout, to Stable upgrade. Detailed specification: [09-catalog-release-control-plane.md](09-catalog-release-control-plane.md).

### P1 — SaaS Commercialization

- `early_access` Entitlement.
- Quota and idempotent Usage Metering.
- Stripe Checkout, Subscription Webhook, and Customer Portal.
- Billing failure grace period and safe downgrade.

Completion standard: plan changes do not modify business modules; duplicate or forged Billing events cannot incorrectly grant entitlements.

### P1 — Product Runtime

- Contact full CRUD and Customer relation.
- Template-driven navigation/dashboard/terminology.
- Extension beyond custom field: view order, filter, section.
- Minimal governed configuration entry for the Built-in Agent.
- SSE or SWR revalidation; UI updates within 2 seconds after changes.

Completion standard: real SMBs can continuously use CRM Lite through Cloud UI and safely complete common configuration through Agent.

### P2 — Platform Expansion

- Workflow Runtime and approval queue.
- Third-party publisher and Marketplace read path.
- Async jobs for export, retention, and usage rollup.
- Module SDK and publishing tools.

### Deferred — Requires New ADR

- Team.
- Custom roles, field/record ACL.
- OIDC, SAML, SCIM.
- Service Account.
- Seat/usage-overage Billing and complex Add-on.
- Private/VPC/On-premise production delivery.
- Data residency, per-tenant database, and advanced compliance controls.

## 3. Milestone Gates

| Milestone | Required Outcome |
| --- | --- |
| M1 Identity | Email OTP, Session, and first Organization/Workspace onboarding pass E2E |
| M2 Collaboration | Invitation, RBAC, Owner transfer, and immediate revoke are complete |
| M3 Isolation | HTTP/MCP/Agent/Job cross-tenant tests are enforced in CI |
| M4 Trust | Audit, API Key, rate limit, and structured security errors are complete |
| M5 Catalog | Immutable artifact, validation, release, upgrade, and rollout POC are complete |
| M6 Operations | Migration, backup restore, and export/deletion runbooks are complete |
| M7 Commercial | Entitlement, Usage, and Stripe sandbox subscription loop are complete |
| M8 Public Launch | Production readiness gate fully passes |

## 4. Active Technical Debt

| Item | Priority | Resolution Phase |
| --- | --- | --- |
| Trusted identity headers are temporary | P0 | SaaS Phase 1 |
| Workspace role still contains POC `owner` semantics | P0 | SaaS Phase 0 |
| Generic API errors can hide auth semantics | P0 | SaaS Phase 0 |
| Schema bootstrap is not a versioned migration system | P0 | SaaS Phase 0 |
| MCP does not yet use Cloud RequestContext | P0 | SaaS Phase 3 |
| Cross-tenant test matrix is incomplete | P0 | SaaS Phase 3 |
| Audit model is POC-level | P0 | SaaS Phase 4 |
| Request body validation is incomplete | P0 | Phase 0–4 per route |
| UI polish is uneven outside landing/shell/dashboard | P1 | Product Runtime |
| Type safety still contains POC `any` values | P1 | Continuous |

## 5. Tracking Source of Truth

- Product and platform direction: [02-vision.md](02-vision.md)
- Architecture: [03-architecture.md](03-architecture.md)
- SaaS decisions: [07-saas-core-boundaries.md](07-saas-core-boundaries.md)
- SaaS execution and acceptance: [08-saas-core-implementation-plan.md](08-saas-core-implementation-plan.md)
- Catalog/release specification: [09-catalog-release-control-plane.md](09-catalog-release-control-plane.md)
- SDK product and developer experience: [10-runory-sdk-product.md](10-runory-sdk-product.md)
- v0.1.0 release definition: [releases/v0.1.0-cloud-early-access.md](releases/v0.1.0-cloud-early-access.md)
- v0.2 productization plan: [product/v0.2-productization-plan.md](product/v0.2-productization-plan.md)
- v0.5 commercial FSM plan: [product/v0.5-commercial-fsm-execution-plan.md](product/v0.5-commercial-fsm-execution-plan.md)
- v0.5.1 mobile field-work specification: [product/v0.5.1-mobile-field-work-spec.md](product/v0.5.1-mobile-field-work-spec.md)
- post-v0.5 milestone roadmap: [product/post-v0.5-product-milestone-roadmap.md](product/post-v0.5-product-milestone-roadmap.md)
- commercial FSM customer-demand benchmark: [research/commercial-fsm-customer-demand-benchmark.md](research/commercial-fsm-customer-demand-benchmark.md)
- Runory 1.0 GA 90/10 release contract: [product/v1.0-ga-release-goal.md](product/v1.0-ga-release-goal.md)
- Historical POC result: [05-cloud-first-poc-progress.md](05-cloud-first-poc-progress.md)

Do not redefine the SaaS data model or permission boundary in this file. Decision changes must first update the SaaS Core decision baseline and record migration impact.
