# Admin / Governance

Runory is built around governed change. This page covers the governance model: audit trail, members and roles, API keys, billing (free plan), export, trash/restore, and permission groups. It references the real admin and governance pages.

For the operation safety model, see [Agent Operations](./agent-operations.md). For day-to-day workspace use, see the [Workspace Guide](./workspace-guide.md).

## Governance principles

All Agent-operated actions are risk-classified and auditable. Every apply records: who, through which entry, which API, what changed, before/after, confirmation status, and a rollback point. Boundaries are non-negotiable:

```text
Agents never directly operate the database.
Agents never modify official module source.
Modules/Extensions never bypass the Platform Core.
Extensions never overwrite official module files.
All writes go through the Business Engine / governed APIs.
Cloud Agents and MCP/SDK Agents share one permission model.
```

## Audit trail

`/w/[workspaceId]/audit` (UI) and `GET /api/workspaces/[id]/audit` (API)

The audit trail is append-only. Every governed mutation produces an audit event. Audit events record the actor (user or agent), the entry point (HTTP/MCP/Agent/Job), the API called, the entity, before/after state, confirmation status, and the rollback point.

- Filter by action (for example `extension.apply`) or actor.
- Audit never stores OTP, session, or API key secrets.
- Production errors never expose stack traces or SQL details.
- Audit events are also available to MCP clients via `runory.audit.list`.

## Members and roles

`/w/[workspaceId]/members`

Membership and RBAC operate at the Organization and Workspace level:

- **Organization** is the tenant, ownership, membership, and (future) billing boundary.
- **Workspace** is the business data and configuration boundary.
- Fixed RBAC roles are assigned per membership.
- The first user becomes the Organization Owner.
- The last Owner cannot leave, be downgraded, or be removed.
- Invitations support accept, expire, revoke, and replay protection.
- Access revocation takes effect on the next request — a removed member gets `403` immediately.
- Platform roles and Organization roles are separated; a Platform role cannot implicitly read customer business data.

Team is **not** a current product requirement. It is reserved as a future Organization-scoped permission group and will not become a tenant, billing, or business-data ownership boundary.

## API keys

`/w/[workspaceId]/api-keys` (UI)
`/api/workspaces/[id]/api-keys` and `/api/workspaces/[id]/api-keys/[keyId]/rotate` (API)

Workspace API keys authenticate external Agents and MCP clients against the governed APIs. Keys support:

- creation with explicit scope and expiry;
- rotation (rotate a key without dropping the caller);
- revocation;
- immediate invalidation when the key creator loses access.

A key is sent as `Authorization: Bearer <key>`. The Runory MCP server reads it from `RUNORY_API_KEY`. See [MCP / Skill Usage](./mcp-skill-usage.md).

## Permission groups

Permission groups are pack-aware. A pack can declare `permissionGroups` (for example the CRM Lite Pack declares `sales_admin`, `sales_agent`, `sales_viewer`), each with a set of permissions like `company.read`, `deal.create`. Assignments are managed through the workspace permission-group assignment surface.

Permission groups were added in v0.3.6 and let you scope members to a pack's capabilities without custom roles. Custom roles, field ACL, and record ACL are **not** available yet.

## Billing (free plan)

`/w/[workspaceId]/billing`

During `v0.4` Runory ships **only a free plan**:

- No paid plan, no Stripe integration, no payment method required.
- No surprise paywall.
- Fair-use limits may apply; if limits are not yet technically enforced, the website and docs say so honestly.
- Paid plans will be announced before enforcement, and user data will not be locked behind future payment.

Free plan boundaries (workspace/member limits, pack availability, operation limits, MCP/API access, storage posture, support expectations) are surfaced in the UI and docs. See [Release Notes](./release-notes.md).

## Export

`/w/[workspaceId]/export` (UI)
`/api/workspaces/[id]/export` and `/api/workspaces/[id]/export-jobs` (API)

Export packages workspace data — configuration, modules, extensions, schema, and business records.

- Exports **never** include authentication or billing secrets.
- Export is the preferred path between Cloud and Private/Local runtimes. Runory does not rely on bidirectional sync as the default.
- Export jobs are tracked and retrievable via the export-jobs API.

## Trash and restore

`/w/[workspaceId]/trash` (UI)
`/api/workspaces/[id]/restore` (API)

- Deleted records are retained for restore.
- Uninstall retains data by default unless you explicitly choose deletion.
- Workspace archive/restore/purge are idempotent and isolated.

## Lifecycle

Workspaces support archive, restore, and purge. Lifecycle operations are idempotent and tenant-isolated. A failed migration in one workspace does not spread to others.

## Platform admin console

`/admin` (restricted to platform admin emails set via `PLATFORM_ADMIN_EMAILS`)

The platform admin console covers the catalog, releases, and rollouts control plane:

- `/admin/catalog` and `/admin/catalog/[itemId]` — catalog items and versions.
- `/admin/catalog/[itemId]/versions/[versionId]/validation` — structured validation runs.
- `/admin/releases` and `/admin/releases/[releaseId]` — releases and rollout control.
- `/admin/rollouts` and `/admin/rollouts/[rolloutId]` — allowlisted rollout with pause/resume/cancel.
- Catalog version actions: `validate`, `freeze`, `lock`, `promote`, `reject`, `withdraw`, `deprecate`.

Stable promotion requires a human Release Manager approval. The CLI can only publish to `internal`. See [SDK / Module Development](./sdk-module-development.md).

## Request IDs and diagnostics

Every API response includes a request ID (from the `x-request-id` header or generated server-side). When something fails:

1. Capture the request ID from the error toast or API response.
2. Check [Troubleshooting](./troubleshooting.md) for the matching symptom.
3. For governance issues, inspect the audit trail for the failed operation.

Production never exposes stack traces or SQL details in errors — the request ID is the support handle.

## Current limitations (honest)

- No custom roles, field ACL, or record ACL yet (fixed RBAC + pack permission groups only).
- No enterprise SSO (OIDC/SAML/SCIM).
- No Team entity.
- No paid billing, Stripe, or marketplace monetization.
- No data residency, per-tenant database, or customer-managed encryption keys.
- No SOC 2 / ISO 27001 certification claims.

See [Release Notes](./release-notes.md) for what is available now versus planned.
