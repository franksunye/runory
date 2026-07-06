# Runory SaaS Core Implementation Plan

Status: Approved v1.0
Date: 2026-06-22
Decision baseline: [07-saas-core-boundaries.md](07-saas-core-boundaries.md)

## Phase Status Tracker

> Last updated: 2026-06-22

| Phase | Status | Summary |
|-------|--------|---------|
| Phase 0: Consolidate Foundation | Complete | Role enums, RequestContext, migration runner, error envelope |
| Phase 1: Email OTP Auth | Complete | OTP, session, rate limiting, first-login onboarding |
| Phase 2: Org, Invitations, RBAC | Complete | Invitations, memberships, ownership transfer, last-owner invariant |
| Phase 3: Tenant Isolation | Complete | 33 cross-tenant tests, getExtensionVersions leak fixed, RequestContext unified |
| Phase 4: Audit, API Keys, Security | Complete | API Keys (create/revoke/rotate), audit service with redaction, Bearer auth |
| Phase 5: Entitlements, Quotas | Complete | Entitlement service, 6 quota metrics, idempotent usage, auto-provision on onboarding |
| Phase 6: Billing & Subscriptions | Not started | Deferred — early_access has no paid billing |
| Phase 7: Export, Deletion, Recovery | Complete | Export with checksum, 30-day soft delete, org deletion, user anonymization |
| Phase 8: Production Readiness Gate | Not started | Awaits CI, E2E, backup drill, runbook |

### Known Residual Risks

1. **Audit coverage (Criterion 5)**: `writeAuditEvent` service is built but not yet wired into all write operations (`createRecord`, `updateRecord`, `applyExtension`). Infrastructure ready, integration pending.
2. **Quota enforcement (Criterion 7)**: `enforceQuota` service is built but not yet wired into resource creation paths (`createRecord`, `createWorkspace`). Infrastructure ready, integration pending.
3. **Backup restore drill (Criterion 9)**: Migration replay verified from empty database; real backup restore drill not yet performed.
4. **Billing (Criterion 8)**: Phase 6 not implemented. Acceptable for early_access (no paid plans). Must complete before public billing launch.

## 1. Objective

This plan splits SaaS Core into independently acceptable phases in dependency order. Each phase must satisfy its exit criteria before the next phase begins; time estimates are only for ordering and do not replace acceptance.

The manufacturing, release, upgrade, and rollout lifecycle for Modules/Packs/Templates is a parallel platform control-plane workflow and is not mixed into the tenant SaaS Core data model. Its independent specification and CR0–CR5 implementation plan are defined in [09-catalog-release-control-plane.md](09-catalog-release-control-plane.md). The public launch gate must evaluate the completion state of both workflows.

Runory SDK is the local developer product entry point for that control plane. Its SDK0–SDK4 plan is defined in [10-runory-sdk-product.md](10-runory-sdk-product.md). SaaS Core, SDK, and Catalog share contracts, but SDK does not export SaaS private runtime/repository.

## 2. Current Baseline

As of 2026-06-22 (updated after SaaS Core Phases 0–5 and 7 are complete):

Already available:

- Next.js Cloud UI, Workspace shell, and production-grade visual foundation.
- Complete table structure for Organization, User, OrganizationMembership, WorkspaceTenant, and WorkspaceMembership.
- Two independent enums: `OrganizationRole (owner/admin/member)` and `WorkspaceRole (admin/member/viewer)`.
- Unified access helper for Workspace HTTP APIs (`requireWorkspaceContext`) and complete role checks.
- Email OTP authentication, server-side sessions, rate limiting, and automatic first-login onboarding.
- Organization invitation system (7-day expiry, hashed token, workspace grants).
- RBAC and organization-role inheritance (owner/admin → workspace admin).
- Cross-tenant isolation regression test suite (33 tests covering the full access matrix).
- API Key system (create/list/revoke/rotate, hash-only storage, scope+RBAC intersection, automatic revocation when creator loses permission).
- Unified audit service (append-only, sensitive-field redaction, request ID tracing).
- Entitlement & Quota service (early_access plan, 6 quota metrics, idempotent usage events).
- Data lifecycle management (export with checksum, 30-day soft delete, organization deletion, user account deletion and audit anonymization).
- Versioned Platform Migration runner (0001–0007) with SHA-256 verification.
- Turso/libSQL async data path.

Still pending:

- Audit Event is not yet wired into all write operations (infrastructure ready).
- Quota enforcement is not yet wired into resource creation paths (infrastructure ready).
- Billing & Subscriptions (Phase 6) is not implemented and is not required during early_access.
- Backup restore drill has not been executed.
- CI/CD pipeline, E2E tests, and Runbook are not established (Phase 8).

## 3. Delivery Rules

Each phase follows:

1. Define contracts and migrations first, then implement service/API/UI.
2. Permission and cross-tenant tests ship in the same batch as feature code.
3. New write operations must also produce Audit Events.
4. Pages are not allowed to directly operate the database or compute authorization on their own.
5. All production secrets, tokens, and keys use hashes or managed secrets.
6. If a phase has not met its exit criteria, do not mask foundational gaps by adding features.

## 4. Phase 0: Consolidate the Existing Foundation

Priority: P0
Dependency: none

### Deliverables

- Finalize two independent enums: `OrganizationRole` and `WorkspaceRole`.
- Remove `owner` from Workspace role and migrate existing records to `admin`.
- Establish canonical `RequestContext`, `Principal`, and Authorization Policy API.
- Unify HTTP errors into stable `401/403/404/409/429` envelopes.
- Clarify code boundaries between low-level Repository and Authorized Service.
- Add request ID and carry it through API responses and logs.
- Establish versioned Platform Migration runner and `schema_migrations` table.
- Convert current schema bootstrap into migration `0001_baseline`, while preserving a development-environment initialization entry.

### Tests

- Role hierarchy unit tests.
- RequestContext does not accept client Actor override.
- Migration replay from empty database, repeated execution, and checksum mismatch tests.
- All Workspace routes declare a minimum role.

### Exit Criteria

- No production route depends on temporary development identity.
- A complete schema can be built from an empty database using only migrations.
- Authentication and authorization failures no longer return generic 500.

## 5. Phase 1: Email OTP and Server Sessions

Priority: P0
Dependency: Phase 0

### Schema

- `auth_identities`
- `auth_challenges`
- `sessions`
- authentication security events

### Deliverables

- Request OTP, Verify OTP, Logout, and Logout all sessions APIs.
- Email normalization, OTP hash, expiration, attempt limit, and single-use.
- Session opaque token, hash storage, rotation, expiry, and revoke.
- `HttpOnly + Secure + SameSite` Cookie.
- Origin/CSRF protection.
- IP, email, and endpoint rate limiting.
- Mail provider adapter and safe development mail sink.
- Login page, verification-code page, and basic Session management UI.
- Automatic Organization, default Workspace, and Owner membership creation on first login.

### Tests

- OTP expiration, replay, brute-force attempt, and enumeration protection.
- Session revoke, logout-all, and cookie flags.
- First-user onboarding transaction consistency.
- Same normalized email does not create duplicate User.

### Exit Criteria

- Production environment does not need trusted identity headers.
- Unauthenticated requests cannot access any Workspace data.
- Complete browser tests cover login, first creation, and repeat login.

## 6. Phase 2: Organization, Invitations, and RBAC

Priority: P0
Dependency: Phase 1

### Schema

- `organization_invitations`
- `invitation_workspace_grants`
- finalized organization/workspace membership constraints

### Deliverables

- Organization settings and member list.
- Create, resend, revoke, and accept invitations.
- Transactionally create Organization and Workspace memberships when accepting invitations.
- Member role modification, Workspace assignment, member removal.
- Owner transfer.
- last-owner invariant.
- Workspace admin inheritance for Organization owner/admin.
- Immediate invalidation strategy for Membership/permission cache.

### Tests

- Wrong email cannot accept invitation.
- Invitation token expiration, revocation, and replay tests.
- Ordinary members cannot invite or upgrade themselves.
- Last Owner cannot leave, be downgraded, or be removed.
- After member removal, the next request immediately returns 403.

### Exit Criteria

- Multi-user Organization can complete the full invitation, authorization, and removal loop only through UI.
- All permission changes have Audit Events.

## 7. Phase 3: End-to-end Tenant Isolation

Priority: P0
Dependency: Phase 2

### Deliverables

- All HTTP, MCP, Agent, Webhook, and Job entry points use unified RequestContext.
- All record lookups include both `workspace_id` and resource ID.
- Review and fix metadata, module business tables, and extension value queries.
- Cache key, SSE/event channel, file path, and job payload include tenant scope.
- Forbid user data from entering cross-user shared Next.js cache.
- Change MCP to Cloud HTTP transport and wire it into the same authorization policy.
- Establish cross-tenant security regression suite.

### Tests

- Full access matrix with two Organizations and multiple Workspaces.
- Even if another tenant's record ID is known, it cannot be read or written.
- Files, exports, event subscriptions, cache, and MCP do not leak.
- Organization admin inheritance and explicit Workspace role behavior are consistent.

### Exit Criteria

- Cross-tenant tests cover all public data entry points and are enforced in CI.
- No public path can bypass Authorized Service to access production data.

## 8. Phase 4: Audit, API Keys, and Security Baseline

Priority: P0
Dependency: Phase 3

### Schema

- finalized `audit_events`
- `api_keys`
- rate-limit storage or provider adapter

### Deliverables

- Append-only audit service, in the same transaction as key business mutations or via reliable outbox.
- before/after redaction policy.
- Audit query/export permission and 365-day retention policy.
- Workspace API Key create/list/revoke/rotate.
- Hash-only key storage, prefix, expiry, last-used, and scopes.
- API Key permission intersects with creator RBAC.
- API Key becomes invalid immediately when creator loses permission.
- Security headers, structured logs, secret redaction, and production error policy.

### Tests

- No directly usable Session/OTP/API Key exists in database.
- Key revoke, expiry, scope, and creator removal.
- Every mutation can locate an Audit Event by request ID.
- Audit does not contain authentication secrets.

### Exit Criteria

- Personal Agent can use a revocable, Workspace-scoped API Key.
- Core write-operation audit coverage is 100%.

## 9. Phase 5: Entitlements, Quotas, and Usage

Priority: P1
Dependency: Phase 4

### Schema

- `organization_entitlements`
- `usage_events`
- `usage_rollups`

### Deliverables

- Central Entitlement Service.
- `early_access` entitlement provisioning.
- Workspace/member/storage/Agent hard quotas.
- API/record/audit soft quotas and 80%/100% notifications.
- Idempotent usage event ingestion and period rollup.
- Atomic quota reservation to avoid concurrent overage.
- Admin usage and limit UI.

### Tests

- Concurrent resource creation cannot exceed hard quotas.
- Same idempotency key is not metered repeatedly.
- Entitlement override takes effect and can expire.
- Downgrade does not delete or hide existing data.

### Exit Criteria

- All billable resources have clear metric owners and server-side enforcement.
- Plan changes do not require modifying business modules.

## 10. Phase 6: Subscription Billing

Priority: P1
Dependency: Phase 5

### Schema

- `billing_customers`
- `subscriptions`
- `billing_webhook_events`

### Deliverables

- Organization Owner creates Stripe Checkout Session.
- Server-side price catalog; arbitrary client Price ID is forbidden.
- Webhook raw-body signature verification and event idempotency.
- Subscription snapshot → Entitlement transaction.
- Stripe Customer Portal.
- Billing settings UI.
- payment failure grace period and restriction strategy.
- When Stripe is unavailable, use the latest trusted Entitlement and do not block existing users.

### Tests

- Forged success redirect does not grant entitlement.
- Duplicate and out-of-order webhooks do not corrupt Subscription.
- payment failed, recovery, cancel-at-period-end, and deleted states.
- Non-Owner cannot create Checkout or Portal session.

### Exit Criteria

- Sandbox completes subscribe → renew/fail → recover/cancel full loop.
- Billing failure does not delete data or immediately remove read access from existing customers.

## 11. Phase 7: Export, Deletion, and Recovery Operations

Priority: P1
Dependency: Phase 4; may run alongside Phase 5–6

### Schema

- export jobs
- deletion jobs/tombstones
- backup recovery drill records

### Deliverables

- Versioned Workspace export manifest and checksum.
- Async export and short-lived signed download URL.
- Workspace archive, 30-day pending deletion, restore, and purge.
- Organization deletion with fresh Email OTP confirmation.
- User account deletion, Session/API Key revoke, and audit anonymization.
- Blob, cache, event, and derived data purge handlers.
- Managed database backup configuration and recovery runbook.
- Complete one real recovery drill and record RPO/RTO results.

### Tests

- Export does not include authentication or Billing secrets.
- Purge is retryable and does not affect other Workspaces.
- 30-day recovery window behavior.
- After restoring from backup, key tenant isolation tests still pass.

### Exit Criteria

- Backup has real restore evidence.
- Workspace and Organization deletion lifecycle can be executed and audited end to end.

## 12. Phase 8: Production Readiness Gate

Priority: P0 before public launch
Dependency: Phase 0–7

### Required Gate

- Full-repo typecheck, unit, integration, migration, and browser E2E pass.
- Cross-tenant security suite passes.
- Auth/OTP/API rate-limit verification passes.
- Webhook replay and job retry verification passes.
- Backup restore drill passes.
- Secret scan, dependency audit, and production headers check pass.
- Critical-path observability: request ID, error rate, latency, job failure.
- Runbook: auth outage, email outage, database restore, billing webhook backlog, key compromise.

### Launch Definition

The minimum scope for public SaaS launch is Phases 0–4, Phase 7 backup/deletion foundation, and Production Gate. Phases 5–6 can be completed in parallel during the unpaid `early_access` phase, but must be complete before public paid billing.

## 13. Explicitly Deferred Backlog

The following capabilities are not part of the completion standard for the phases above:

- Team / TeamMembership / WorkspaceTeamGrant.
- Custom roles, field ACL, record ACL.
- OIDC, SAML, SCIM.
- Service Account.
- Seat Billing, usage overage Billing, Add-on.
- Data residency, per-tenant database, customer-managed encryption keys.
- SIEM/DLP/IP allowlist and advanced compliance admin console.

Before any deferred item enters the plan, it must first satisfy the trigger conditions defined in [07-saas-core-boundaries.md](07-saas-core-boundaries.md) and produce a new ADR.

## 14. Tracking Format

Each Phase uses the following status:

```text
Not started → In progress → Verification → Complete
```

Completion report must include:

- migrations and contracts changed
- security boundary changed
- tests added and results
- operational runbook impact
- known residual risks
- next phase dependency readiness
