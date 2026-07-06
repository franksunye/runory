# Runory Architecture and Technical Direction Change Note

Status: Approved v1.0  
Date: 2026-06-18  
Supersedes: Local-first assumptions in docs dated 2026-06-17

## 0. Core Conclusion

Runory's technical direction changes from the previous:

> **Local-first: users run Runory Core locally, use Codex / Agent to modify business modules, and consider Cloud later.**

To:

> **Cloud-first: Runory Cloud is the default product entry point, providing a stable Core, official business modules, Workspace configuration, Agent configuration, and managed runtime capabilities; Local / Private Deployment is preserved as an advanced deployment form.**

This does not abandon Local; it changes priority:

```text
Old direction:
Local Runtime → Local Customization → Cloud Sync / Cloud Service

New direction:
Runory Cloud → Managed Workspace → Agent-driven Configuration → Private / Local Deployment
```

Runory's long-term form should no longer be defined as vertical-industry software, but as:

> **A composable business operations platform for SMBs, close to WordPress for the SMB era.**

```text
Runory Core
+ Official Modules
+ Workspace Templates
+ Business Packs
+ Agent Configuration Layer
+ Marketplace
+ Cloud / Private / Local Deployment
```

## 1. Old vs New Direction

| Dimension | Old Direction: Local to Cloud | New Direction: Cloud to Local |
| --- | --- | --- |
| Default entry | Local runtime | Runory Cloud |
| Default user | Technical users / advanced users | Ordinary SMB business users |
| Agent role | Local code modification assistant | Workspace configuration and operations assistant |
| Core role | Modifiable business substrate | Stable platform kernel |
| Module logic | User-modifiable modules | Official modules + Managed Workspace Extension |
| Customization method | Code/module modification | Governed extension |
| Commercialization path | Slow, developer-oriented | Fast, SaaS-oriented |
| Local role | Default product form | Advanced deployment form |
| Marketplace | Consider later | Reserved architecturally from day one |
| Long-term form | Locally runnable software substrate | SMB Business Platform |

## 2. Default Product Entry

The new default users are SMB business owners, operations leads, finance leads, and service leads. They do not care about local deployment, Git, MCP configuration, code modification, or database connections.

The product entry must be:

```text
Sign up for Runory Cloud
→ Create Workspace
→ Select business Pack / Template
→ Import data
→ Agent helps configure
→ Business starts running
```

## 3. Target Architecture

```text
┌───────────────────────────────────────┐
│              Runory Cloud              │
│  Auth / Billing / Workspace / Hosting  │
└───────────────────────────────────────┘
                    ↓
┌───────────────────────────────────────┐
│              Runory Core               │
│ Object / Field / View / Workflow / ACL │
│ Event / Audit / Module Lifecycle       │
└───────────────────────────────────────┘
                    ↓
┌───────────────────────────────────────┐
│          Runory Module System          │
│ Schema / UI / Forms / Actions / Skills │
│ Migration / Dependency / Permissions   │
└───────────────────────────────────────┘
                    ↓
┌───────────────────────────────────────┐
│        Business Packs / Templates      │
│ CRM / Finance / Field Service / etc.   │
└───────────────────────────────────────┘
                    ↓
┌───────────────────────────────────────┐
│       Agent Configuration Layer        │
│ Configure / Extend / Analyze / Verify  │
└───────────────────────────────────────┘
                    ↓
┌───────────────────────────────────────┐
│      Private Cloud / Local Runtime     │
│ For enterprise / compliance / offline  │
└───────────────────────────────────────┘
```

## 4. Seven Architecture Principles

1. **Cloud-first, Portable-runtime** — Cloud is the default entry point; runtime architecture must be portable.
2. **Core must stay small** — Core only handles platform capabilities; business capabilities belong to Modules; business composition belongs to Packs; user differences belong to Workspace Extensions.
3. **No direct customization of official modules** — official Modules remain upgradable; Workspace Extensions handle personalization.
4. **Agent must operate through governed APIs** — Agent Action → Permission Check → Diff → Approval → Apply → Validate → Audit.
5. **Marketplace readiness from day one** — even if the MVP has no Marketplace, it must have Manifest, version, dependency, permission, and migration models.
6. **Templates are product experience, not just UI theme** — Templates determine the business experience, not only color skins.
7. **Local is deployment mode, not product starting point** — Local is an advanced deployment path, not the default path for ordinary SMBs.

## 5. Direct Impact on POC / MVP

Do not build the MVP as "a locally runnable business system modified by Codex."

Build it as:

> **An SMB business operations platform where users can create Workspaces in Cloud, install business Packs, and have Agents configure and extend them in a governed way.**

Minimum success criteria:

```text
1. User can create a Workspace in Cloud
2. System can install an official Pack
3. Pack can declare objects, fields, views, forms, permissions, workflows
4. User can add fields, views, and simple workflows through Agent
5. All changes have Diff, Audit, Rollback
6. Standard Pack is not directly modified by users
7. Workspace Extension is separated from official Module
8. Workspace configuration can be exported, preserving a future Local path
```

## 6. Documentation Index

This change has been synchronized into the following documents:

* [02-vision.md](02-vision.md)
* [03-architecture.md](03-architecture.md)
* [01-poc-execution-plan.md](01-poc-execution-plan.md)
* [product/product-definition.md](product/product-definition.md)
* [architecture/overview.md](architecture/overview.md)
* [architecture/cloud-to-local-workspace.md](architecture/cloud-to-local-workspace.md)
* [architecture/architecture-decision-record.md](architecture/architecture-decision-record.md)
* [architecture/module-architecture.md](architecture/module-architecture.md)
* [architecture/workspace-extension-architecture.md](architecture/workspace-extension-architecture.md)
* [specifications/extension-manifest-spec.md](specifications/extension-manifest-spec.md)
* [sdk/module-sdk.md](sdk/module-sdk.md)
* [07-saas-core-boundaries.md](07-saas-core-boundaries.md)
* [08-saas-core-implementation-plan.md](08-saas-core-implementation-plan.md)
* [09-catalog-release-control-plane.md](09-catalog-release-control-plane.md)
* [10-runory-sdk-product.md](10-runory-sdk-product.md)

The **Local Runtime POC code** in the current repository has been archived to `experiments/local-v1`. It is retained as a Portable Runtime prototype and development sandbox, and no longer represents the default product form. See [01-poc-execution-plan.md](01-poc-execution-plan.md).
