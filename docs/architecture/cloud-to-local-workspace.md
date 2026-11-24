# Runory Self-hosted and Cloud Deployment Contract

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `architecture` |
| Applies to | Current Agent-first direction; bounded Self-hosted candidate and managed Cloud |
| Owner | Architecture / Engineering |
| Last reviewed | 2026-11-24 |
| Supersedes | Cloud-to-Local draft v0.2 (2026-06-18) deployment priority |
| Superseded by | — |

This document supports the canonical [Product Definition](../product/product-definition.md), [Architecture Overview](overview.md), and [Agent-first Product Strategy](../product/agent-first-product-strategy.md). It replaces the earlier deployment-priority interpretation in [Cloud-first pivot](../04-architecture-pivot-cloud-first.md); the prior decision remains history. It does not certify a distribution, a deployment mode, or migration feature as implemented.

## 1. One product, two deployment forms

**Agent-first product; portable Runtime; first-class Self-hosted and Cloud.**

- Self-hosted: an owner or authorized Agent can download a verified Runory release, install it in a supported environment, initialize a local administrative identity and Workspace, install compatible Packs, and use the included role applications and governed interfaces without a mandatory Runory Cloud account, subscription, or proprietary Cloud runtime dependency.
- Cloud: Runory provides managed hosting, accounts, billing, upgrades, operations, and applicable provider connections. It may remain the convenient default for users who prefer managed service.
- Private / VPC / on-premise are potential configurations of the same Self-hosted product, supported only within explicitly validated deployment profiles. Local developer mode is not production self-hosting.

Both forms must share the same business objects, Command Contracts, authorization semantics, Module/Pack/Template artifacts, Workspace Extensions, UI components, business tests and maintained release lineage. Deployment mode is not a reason to fork Core or official Modules.

## 2. First independent distribution

Start with one bounded, reproducible server deployment profile; a version-pinned Linux container/Compose distribution using the existing application and supported persistence is the initial implementation candidate. Confirm the exact supported platform, database, storage, and scheduler through the technical audit before committing a distribution. Do not require a source checkout, a development server, or manual database creation for normal installation.

A supported release must provide:

- official download and immutable version, source/license and dependency metadata, checksum/integrity verification, release notes, compatibility and documented limits;
- deterministic preflight, generated runtime secrets and safe initial owner enrollment, persistent database and attachments, explicit data directory, normal authorization, and a non-destructive repeatable initialization path;
- an installable initial FSM Pack/reference configuration from local release artifacts or another documented trusted source; no mandatory online Catalog or SaaS entitlement check for the included self-hosted core;
- browser access, role applications and Agent CLI/API/MCP access using explicit credentials/scopes; safe defaults, loopback/LAN restrictions where appropriate, TLS and network guidance before exposing the instance;
- functioning timers, workflow jobs, outbox and failure diagnostics without depending on Vercel Cron or another managed-only service; offline or absent provider features must be reported as unavailable, not silently simulated;
- install, start/stop, health/doctor, backup/restore, versioned upgrade and recovery instructions; verify restart, permissions, domain outcomes and attachment persistence.

The ten-minute clean install is an engineering target on a documented ready environment, not a published SLA. Measure first usable business task separately from image pull, provider approval, data migration and customer waiting time.

## 3. Deployment adapters and independence

Preserve existing interfaces and implement only the adapter gaps required by the first supported profile: persistence (existing SQLite/libSQL path where validated), identity/session and setup, attachment storage, job scheduling/queue, secrets, email, payments and voice. Optional integrations may require owner-authorized provider accounts or network access; core business use must not require those integrations. Do not introduce a second runtime, database model, authorization path or proprietary Agent.

Cloud entitlement and billing must remain separate from the self-hosted entitlement policy and merchant payment settlement. Local ownership does not mean permissionless operational writes; normal use by Agents and humans goes through the same governed business actions. A deployment Agent may execute authorized infrastructure tasks, but cannot use raw database mutation as a business or configuration shortcut. Production initialization must never enable development OTP/bootstrap bypasses.

Use immutable released artifacts, version-pinned Pack locks, migration records, supported extension points and verified backup/recovery. Retain the existing release safety and compatibility requirements; no claim that an arbitrary destructive migration can always be rolled back without restoring data.

## 4. Portability and migration

The goal is **controlled migration in either direction** between supported deployments, not live bidirectional synchronization. New Self-hosted installations do not require originating in Cloud. A customer can start in either form, and migration to the other is a separately validated capability.

Preserve stable workspace/object/record identifiers, schema and module/pack/extension versions, migration history, file hashes, audit lineage, provider references, and compatible contracts. Configuration exports alone do not establish full business-data portability.

A future full Workspace export/import contract should include:

```text
manifest / release and schema compatibility
module and Pack locks / metadata / extensions
business records and relationships
files and attachment integrity / relevant audit history
checksums / migration and reconciliation report
```

Never include plaintext secrets in portable exports; rebind provider credentials at the target. Prove backup and restore including attachment bytes, business data and configuration before migrating a real customer. Use explicit source/target ownership, preview, approved cutover and reconciliation; after migration exactly one deployment remains the authoritative writer unless a separately designed synchronization protocol exists. Cloud ↔ Self-hosted import/export directions are individually proven; neither is promised by this decision alone.

## 5. Boundaries and acceptance

One supported independent deployment comes first. Defer desktop wrappers, every OS/database/provider, Kubernetes automation, arbitrary private-network topology, broad migration automation, multi-master sync, and a full public marketplace. Do not delay the bounded Self-hosted candidate until all Cloud GA requirements pass, and do not substitute a successful install for those requirements. The [Agent-first delivery contract](../product/agent-first-product-strategy.md) specifies the independent Agent installation, adaptation, operation, upgrade and recovery evidence. The [release hardening runbook](../operations/release-hardening-2026-11-24.md) and existing GA gates remain applicable to their declared production scope.

