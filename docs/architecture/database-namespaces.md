# Database Namespace Architecture

Status: Accepted for Cloud v0.1
Date: 2026-06-22

## Decision

Runory uses table-name namespaces to make ownership visible in SQLite, Turso, exports, diagnostics, and migrations:

| Prefix | Owner | Portable outside Runory? | Examples |
| --- | --- | --- | --- |
| `sys_` | database infrastructure | yes | `sys_schema_migrations` |
| `saas_` | reusable SaaS Core | yes | `saas_users`, `saas_organizations`, `saas_sessions` |
| `runory_runtime_` | Runory capability runtime | no | `runory_runtime_installations`, `runory_runtime_object_definitions` |
| `runory_catalog_` | Runory catalog and release control plane | no | `runory_catalog_items`, `runory_catalog_releases` |
| `runory_business_` | installed Runory business modules | no | `runory_business_customer`, `runory_business_contact` |

`platform_*` is deprecated. It mixed generic tenancy/authentication with Runory-specific metadata runtime and release management, so the prefix did not communicate ownership.

## Boundary Test

Before adding a table, answer these questions in order:

1. Does it only operate the database or deployment itself? Use `sys_*`.
2. Could another SaaS product reuse it without importing Runory's Module/Pack/Template model? Use `saas_*`.
3. Does it execute installed Runory capabilities or store effective metadata? Use `runory_runtime_*`.
4. Does it manufacture, validate, publish, lock, promote, or roll out Module/Pack/Template versions? Use `runory_catalog_*`.
5. Does it contain tenant business records defined by a Module? Use `runory_business_*`.

Source-code package location does not determine the table namespace. Ownership and portability do.

## v0.1 Classification

### SaaS Core

Identity and tenancy: `users`, `auth_identities`, `auth_challenges`, `sessions`, `organizations`, `organization_memberships`, `workspaces`, `workspace_tenants`, `workspace_memberships`, `organization_invitations`, `invitation_workspace_grants`.

Governance and operations: `audit_logs`, `api_keys`, `rate_limit_buckets`, `organization_entitlements`, `usage_events`, `usage_rollups`, `export_jobs`, `deletion_jobs`.

All use the `saas_` prefix. A future Team model, if approved, also belongs here because it is an organization-scoped authorization primitive rather than Runory business data.

### Runory Runtime

`installations`, `object_definitions`, `field_definitions`, `view_definitions`, `navigation_items`, `extension_definitions`, `extension_versions`, `extension_field_values`, and `agent_runs` use `runory_runtime_`.

These tables are generic inside Runory, but they are not generic SaaS Core: they depend on Runory's capability and extension model.

### Catalog And Release

`items`, `versions`, `validation_runs`, `releases`, `pack_version_locks`, `release_rollouts`, `rollout_targets`, and `compatibility_reports` use `runory_catalog_`.

The Catalog is a Runory control-plane subsystem. It is separated from Runtime because authoring/release state and installed/effective state have different lifecycles and permissions.

### Business Modules

Business tables use `runory_business_<object>` in v0.1. Module manifests remain the authoritative owner. If collisions become realistic, a later compatible convention may add a normalized module segment; v0.1 does not add that complexity prematurely.

## Migration And Compatibility

Migration `0011_database_namespaces.sql` renames existing tables in place, preserving rows, indexes, and SQLite foreign-key references. It also repairs the contact-to-customer foreign key introduced by the earlier business-table migration.

Migration files `0001` through `0010` remain historical and continue to describe `platform_*` names. A known pre-release edit produced two checksums for `0008`; the runner explicitly accepts the already-deployed checksum, while unknown checksum changes still fail. Migration `0011` normalizes both variants. The runner first upgrades the ledger to `sys_schema_migrations`, then applies `0011` transactionally. Runtime code references the resolved `TABLES` contract and must not embed physical table names.

Default prefixes can be overridden for embedded deployments:

```text
SYSTEM_TABLE_PREFIX=sys_
SAAS_TABLE_PREFIX=saas_
RUNORY_RUNTIME_TABLE_PREFIX=runory_runtime_
RUNORY_CATALOG_TABLE_PREFIX=runory_catalog_
BUSINESS_TABLE_PREFIX=runory_business_
```

`PLATFORM_TABLE_PREFIX` is retained only to render historical migrations. It must not be used for new tables.

## Review Rules

Every schema change must include its namespace decision, immutable migration, `TABLES` contract update, tenant-isolation review, and migration test from both an empty database and the previous released schema. No application SQL may infer access control from a prefix; authorization and mandatory `workspace_id` scoping remain explicit.
