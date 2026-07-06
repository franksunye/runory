# Runory SaaS Core Boundaries and Decisions

Status: Approved v1.0
Date: 2026-06-22
Scope: Runory Cloud SaaS foundation
Related: [03-architecture.md](03-architecture.md), [08-saas-core-implementation-plan.md](08-saas-core-implementation-plan.md)

## 1. Purpose

This document is the boundary and architecture decision baseline for Runory SaaS Core. It answers which complete capabilities must exist now, which complex capabilities are deferred, and which models must preserve extension paths for the future.

The current goal is not to build a large enterprise management suite, but to complete:

> A SaaS Core that can safely go online, support multiple organizations and multi-user collaboration, provide auditability, metering, subscription readiness, and continuous upgradeability.

## 2. Scope Summary

The current SaaS Core must cover:

1. Passwordless Email OTP authentication and server-side Sessions.
2. Clear boundaries between Organization and Workspace.
3. Fixed-role RBAC, member invitation, and immediate permission revocation.
4. Unified multi-tenant data isolation across all entry points.
5. Audit, security baseline, and Workspace API Keys.
6. Entitlement, Quota, and Usage Metering.
7. Stripe Subscription Billing foundation.
8. Versioned Migration, Backup, Export, and deletion lifecycle.

The current scope only reserves architecture paths and does not implement the product surface for:

1. Team.
2. Custom roles, field-level ACL, or record-level ACL.
3. OIDC, SAML, SCIM.
4. Per-tenant database, data residency, or customer-managed keys.
5. Seat Billing, usage overage charging, and complex Add-ons.
6. SOC 2 / ISO 27001 certification process and advanced compliance products.

## 3. Canonical Domain Model

```text
User
  └─ AuthIdentity (email_otp now; oidc/saml later)

Organization (tenant, ownership, membership, billing, security)
  ├─ OrganizationMembership
  ├─ OrganizationInvitation
  ├─ BillingCustomer / Subscription / Entitlement / Usage
  └─ Workspace (business data and configuration boundary)
       ├─ WorkspaceMembership
       ├─ Modules / Packs / Extensions
       ├─ Business Records / Files / Events
       ├─ Audit Events
       └─ API Keys
```

Constraints:

- One User can join multiple Organizations.
- One Organization can own multiple Workspaces.
- One Workspace can belong to only one Organization.
- Single-person users still use Organization; no special Personal Workspace model is created.
- Organization owns business assets; when a User leaves, they do not take Organization data with them.

## 4. Decision 01: Passwordless Email OTP

### 4.1 Definition

A "valid email" is strictly defined as an email address where the user can receive and correctly submit a one-time verification code.

Default flow:

```text
Enter email
→ Send one-time verification code
→ Verify email control
→ Create or match User
→ Create server-side Session
→ Create Organization + Workspace on first use
```

Registration and login are not separated. First verification auto-registers the user; later verification signs them in directly.

### 4.2 Required Controls

- Normalize email and establish a unique identity constraint.
- Store only OTP hashes; expire after 5–10 minutes and invalidate immediately after use.
- Limit send frequency, verification attempts, and request volume by IP and email.
- API responses must not reveal whether an email is already registered.
- Session uses a random opaque token; the database stores only the token hash.
- Cookie uses `HttpOnly + Secure + SameSite`.
- Support Session expiration, revocation, logout, and logout from all devices.
- Write login, failure, logout, and identity-change events to security audit.
- Email delivery uses an external service; Runory does not maintain a mail server.

### 4.3 Deferred

- Passwords and password reset.
- OAuth social login.
- MFA, Passkey.
- OIDC, SAML enterprise SSO.
- Self-built JWT refresh-token system.

## 5. Decision 02: Organization and Workspace

### 5.1 Responsibilities

Organization is:

- Tenant and ownership boundary.
- Member, invitation, and security policy boundary.
- Billing, Entitlement, and Usage boundary.

Workspace is:

- Business data isolation boundary.
- Module, Pack, Template, and Extension configuration boundary.
- Business audit, files, events, and Agent operation boundary.

First use only requires the user to enter a Workspace name. The system may create the Organization with the same name to avoid adding onboarding complexity.

### 5.2 Roles

Organization Roles:

| Role | Capability |
| --- | --- |
| `owner` | All permissions, Billing, organization deletion, and ownership transfer |
| `admin` | Member and Workspace management; cannot transfer or delete the organization |
| `member` | Can only access explicitly assigned Workspaces |

Workspace Roles:

| Role | Capability |
| --- | --- |
| `admin` | Workspace settings, modules, Agent changes, and business data |
| `member` | Read/write business data |
| `viewer` | Read-only business data |

Organization `owner/admin` automatically receives `admin` permission for all Workspaces under the Organization. Workspace does not define ownership; ownership belongs to Organization.

### 5.3 Deferred Operations

- Transfer Workspace across Organizations.
- Merge Organizations.
- Joint ownership of a Workspace by multiple Organizations.
- Department tree and hierarchical organization model.

## 6. Decision 03: Team-ready, Not Team-enabled

Team is a people group inside an Organization. It is not a tenant, data, or billing boundary.

Current authorization path:

```text
Organization → User → WorkspaceMembership
```

Future extension path:

```text
Organization → Team → TeamMembership → WorkspaceTeamGrant
```

Current requirements:

- Authorization is always computed through Policy/Authorization Service.
- Permission subject concept can extend to `user` or `team`.
- Do not add `team_id` to business records.
- Do not allow nested Teams.

Team implementation is triggered when customers commonly exceed 10–20 members, the same groups of members are repeatedly assigned to multiple Workspaces, or clear departmental access boundaries appear.

## 7. Decision 04: Invitation and Fixed RBAC

### 7.1 Invitation Flow

```text
Organization owner/admin enters email
→ Select Workspace and role
→ Create one-time invitation
→ User completes OTP verification with the same email
→ Create OrganizationMembership + WorkspaceMembership in one transaction
→ Mark invitation accepted
```

Rules:

- Invitations expire after 7 days and can be resent or revoked.
- Invitation tokens are stored only as hashes and are single-use.
- Only Organization `owner/admin` can invite external users.
- Workspace `admin` currently does not manage organization members.
- Organization always keeps at least one Owner.
- The last Owner cannot leave, be downgraded, or be removed; ownership must be transferred first.
- After a member is removed, they lose permission on the next request immediately.

### 7.2 Deferred Authorization Features

- Custom roles and permission editor.
- Deny rules and complex permission overrides.
- Field-level and record-level permissions.
- Temporary permission windows.
- Team authorization.

## 8. Decision 05: Tenant Isolation and Authorization Execution

The current design uses a shared database, shared tables, and enforced `workspace_id` isolation; it does not create a database or table per tenant.

Every request establishes server-side context:

```text
RequestContext
- userId
- organizationId
- workspaceId
- organizationRole
- workspaceRole
- requestId
```

Execution chain:

```text
Route / MCP / Background Job
→ Resolve Identity
→ Resolve Organization and Workspace
→ Authorization Policy
→ Authorized Service
→ Repository / Database
```

Mandatory rules:

- Do not trust client-supplied `userId`, Actor, or Workspace ownership.
- All record reads use `WHERE workspace_id = ? AND id = ?`.
- Unique constraints and relationship constraints include `workspace_id` by default.
- Route, MCP, Agent, Webhook, and background jobs follow the same authorization policy.
- Cache keys, event channels, file paths, and async task payloads include Workspace scope.
- User-specific responses must not enter cross-user shared cache.
- Low-level Platform Core data functions must not be treated as public authorization APIs.

Minimum role policy:

| Operation | Required Role |
| --- | --- |
| Read business records | Workspace `viewer` |
| Create or modify business records | Workspace `member` |
| Install Pack / apply Extension | Workspace `admin` |
| Invite members | Organization `admin` |
| Billing / delete organization | Organization `owner` |

## 9. Decision 06: Audit, Security, and API Keys

### 9.1 Audit

Audit logs are separated from application debug logs and user activity summaries.

Audit events must include Organization, Workspace, Actor type/id, action, resource, request ID, before/after, and timestamp. Audit records are append-only and cannot be modified or deleted through ordinary business paths.

Authentication secrets, OTPs, Sessions, API Keys, and sensitive request headers must not enter logs. Sensitive business fields in before/after are redacted according to policy. Default retention is 365 days.

### 9.2 API Keys

Current API Keys target MCP, Personal Agents, and automation:

- Bound to User and Workspace.
- Permissions cannot exceed the creator's current permissions.
- Immediately invalidated when the creator loses Workspace permission.
- Database stores only the hash; the key is shown only once at creation.
- Support name, prefix, revoke, rotate, expiration, and `last_used_at`.
- Only `Authorization: Bearer` is allowed; URL Query transmission is forbidden.
- Default validity is 90 days.

Minimum Scopes:

- `workspace:read`
- `records:write`
- `extensions:manage`

Scope and RBAC are both checked, and the intersection is used. Independent Service Account is not implemented currently; Organization-owned Service Account is added later when non-personal automation lifecycle needs appear.

### 9.3 Security Baseline

- Session, OTP, and API Key store only hashes.
- Mutating operations validate Origin/CSRF protection.
- Auth, invitation, and API have layered rate limits.
- Standard security response headers.
- Production does not expose stack traces or database errors.
- `401/403` and business errors use stable error codes.
- Every request generates a `request_id`.
- Sensitive configuration only comes from Secret/Environment management.

## 10. Decision 07: Entitlement, Quota, and Usage

Plan, Entitlement, and Usage must be separated. Business code checks feature/limit and does not directly check plan names.

The current offering only provides the internal `early_access` plan. It does not require payment, but it sets anti-abuse limits:

| Metric | Initial Limit |
| --- | ---: |
| Workspace | 3 |
| Active members | 10 |
| Business records | 50,000 |
| File storage | 5 GB |
| API requests | 100,000/month |
| Agent operations | 1,000/month |
| Audit retention | 365 days |

Metering uses idempotent usage events plus period rollups. Workspace, member, storage, and high-risk Agent operations are hard limits; API, ordinary records, and audit storage initially use soft limits and alerts.

Downgrade must not delete data or suddenly block read/export; it only blocks continued creation of over-limit resources and provides grace and recovery paths.

## 11. Decision 08: Subscription Billing

Stripe is responsible for payment method, recurring charge, invoice, retry, and subscription lifecycle. Runory is responsible for Organization, Subscription snapshot, Entitlement, and access behavior.

Constraints:

- One Organization maps to one Stripe Customer.
- Currently, one Organization has at most one active Subscription.
- Workspaces are not subscribed independently.
- Only Organization Owner can manage Billing.
- `early_access` users do not create Stripe Customer in advance.
- Use Stripe Billing + Checkout Session + Customer Portal.
- Webhook is the trusted source for subscription state; successful redirect page cannot grant entitlement.
- Webhook must verify raw-body signature, be idempotent by event ID, and tolerate duplicates and out-of-order delivery.

Payment failure enters a grace period. During the grace period, read and export remain available. After the grace period, creation and Agent changes are restricted, but data is not automatically deleted.

Seat Billing, usage overage charging, multi-currency, coupon administration, complex Add-ons, and Stripe Connect are not implemented currently.

## 12. Decision 09: Migration, Backup, Export, and Deletion

### 12.1 Migration

Establish immutable versioned migrations with checksums: Platform Migration, Module Migration, and Workspace Extension Migration are managed separately.

- Production Migration runs through deployment jobs, not ordinary requests.
- Structural changes follow expand → migrate → contract.
- Failure prioritizes forward fixes and does not promise automatic structural rollback.

### 12.2 Backup and Export

Managed database backup is for platform disaster recovery; Workspace Export is for customer data portability. They are separate.

The export package uses a versioned manifest and includes metadata, records, extensions, audit, files, and checksums. It does not include any authentication or Billing secret. Large exports are generated asynchronously, and download links are short-lived.

### 12.3 Deletion

```text
active → archived → pending_deletion → purged
```

- Deletion enters a 30-day recovery period.
- Organization deletion requires the Owner to complete Email OTP again.
- Purge uses idempotent background jobs to clear database, files, cache, and derived data.
- User leaving only removes Membership and does not delete Organization business assets.
- When a User deletes their account, Sessions/API Keys are revoked, and personally identifying display information in retained audit records is anonymized.

## 13. Decision 10: Enterprise-ready, Not Enterprise-complete

Internal User ID is stable, and authentication methods are stored independently as AuthIdentity to reserve extension paths for `email_otp / oidc / saml`. SSO identities must not be automatically merged only because they use the same email.

Future sequence: OIDC → SAML → SSO enforcement → SCIM. SSO is an Organization policy and preserves a strictly protected Owner recovery path.

Current work builds security controls and evidence, but does not claim SOC 2, ISO 27001, or similar certifications. Internal support personnel do not have customer Workspace access by default. Future support access must be customer-authorized, time-limited, least-privilege, and fully audited.

## 14. Definition of SaaS Core Complete

SaaS Core is complete only when all of the following are true:

1. Email OTP, Session, logout, and revocation form a complete authentication loop.
2. Organization/Workspace/Invitation/RBAC behavior passes automated tests.
3. All HTTP, MCP, Agent, and Job data access goes through a unified authorization context.
4. Cross-tenant record, file, cache, event, and export tests all pass.
5. All writes can be linked to Actor, Request, and immutable Audit Event.
6. API Key can be created, used, rotated, and immediately revoked.
7. Entitlement and Quota are enforced server-side, and concurrency cannot break hard limits.
8. Billing webhook is idempotent, and entitlement cannot be forged by the client.
9. Migration can replay from an empty database, and backup completes a real recovery drill.
10. Workspace deletion is recoverable, and Purge leaves no cross-Workspace impact or authentication secret residue.
