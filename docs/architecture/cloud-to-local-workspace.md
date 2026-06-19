# Runory Cloud To Local / Private Deployment

Status: Draft v0.2  
Date: 2026-06-18  
Supersedes: [local-to-cloud-workspace.md](local-to-cloud-workspace.md) (deprecated)  
Change: Cloud-first pivot — see [../04-architecture-pivot-cloud-first.md](../04-architecture-pivot-cloud-first.md)

## 1. Core Position

Runory is **Cloud-first**. Runory Cloud is the default product entry for ordinary SMB users.

Local and Private deployment are **advanced deployment modes**—not the MVP default, not the primary onboarding path.

The architectural requirement is:

> **Cloud-first Product, Portable Runtime Architecture**

Cloud must not create hard coupling that prevents future Private Cloud, VPC, On-premise, or Local Dev deployment.

## 2. Deployment Modes

### Runory Cloud（默认）

```text
Multi-tenant SaaS
Turso/libSQL + Object Storage + Queue
Built-in Agent + Cloud UI Shell
Auth / Billing / Workspace hosting
```

Best for: ordinary SMB, fast onboarding, continuous upgrades, team collaboration.

### Private Cloud / Customer VPC（高级）

```text
Runory Core + Module Runtime in customer-controlled infrastructure
Same Module / Pack / Extension model as Cloud
Customer-managed Auth, Storage, and network boundaries
```

Best for: data residency, private network, large customers with IT teams.

### On-premise / Local Runtime（高级 / 开发）

```text
Portable Runtime（SQLite or customer PostgreSQL）
Adapter-based integration with optional cloud services
MCP / SDK for Agent connection
Export/import from Cloud Workspace
```

Best for: compliance, offline/semi-offline, local database requirement, private LLM, development sandbox.

The repo's existing `experiments/local-v1` is a **Portable Runtime prototype**—valid for historical reference and export validation, not the product default.

## 3. Why Cloud-first

Local-first as default creates problems for SMB commercialization:

* high install friction;
* high support cost;
* slow business validation;
* difficult Agent configuration standardization;
* complex module upgrade and debug across user-modified local installs.

Cloud-first enables:

* instant Workspace creation;
* standardized Pack / Template onboarding;
* governed Built-in Agent experience;
* centralized Module Registry and upgrade;
* faster path to paid SMB usage.

## 4. Portable Runtime Requirements

From day one, Cloud architecture must preserve:

```text
Core runtime can run independently of Cloud-specific services
Module manifest is standardized across Cloud and Portable Runtime
Migrations are standardized
Workspace config is exportable
Extensions are exportable
Audit logs are exportable
Agent skills are declarative
Cloud service dependencies go through adapters
```

### Required Adapters

```text
Auth Adapter
Storage Adapter
Queue Adapter
LLM Adapter
Email Adapter
Payment Adapter
Search Adapter
```

Example: Cloud uses managed Auth and S3; Private Runtime uses local Auth adapter and filesystem storage adapter—with the same Core and Module APIs.

## 5. Cloud To Local Path（非默认，但架构预留）

The preferred advanced path is **controlled export/import**, not bidirectional sync.

```text
Cloud Workspace
    |
    | export
    v
Workspace Export Package
    |
    | import（Private / Local Runtime）
    v
Private / Local Workspace
```

After import:

```text
Private / Local Runtime = primary for that deployment
Cloud Workspace = optionally retained, read-only, or disconnected
```

Bidirectional sync is **deferred**. It requires conflict resolution, delete semantics, concurrent edits, and attachment sync—highest complexity.

### Early Cloud add-ons（post-MVP）

```text
Cloud Backup（retain as service for Cloud users）
One-way Export to Private / Local
Team / Billing upgrade within Cloud
```

## 6. Workspace Export Format

Runory defines a standard Workspace Export Format for Cloud → Private / Local migration.

Draft package:

```text
runory-workspace-export.zip
|-- manifest.json
|-- schema/
|   |-- objects.json
|   |-- fields.json
|   |-- views.json
|   `-- workflows.json
|-- modules.json
|-- extensions/
|-- templates.json
|-- data/（optional, deployment-dependent）
|-- files/
|-- audit/
`-- checksums.json
```

Draft `manifest.json`:

```json
{
  "workspaceId": "ws_001",
  "workspaceName": "我的小饭馆",
  "coreVersion": "1.0.0",
  "templateId": "small-business-crm",
  "packs": [
    {
      "id": "crm-lite-pack",
      "version": "1.0.0"
    }
  ],
  "modules": [
    {
      "id": "runory.customer",
      "version": "1.0.0"
    }
  ],
  "extensionsVersion": 4,
  "schemaVersion": "1.0.0",
  "exportedAt": "2026-06-18T10:00:00Z",
  "exportMode": "config_and_schema"
}
```

POC requirement: prove export of config + schema + extensions (full data migration can follow post-POC).

## 7. Cloud Storage Model

Runory Cloud:

```text
Turso/libSQL（business + metadata + platform objects）
Object Storage（attachments, exports, reports）
Queue / Async Jobs
Cloud API + Agent Operation API
Cloud MCP Server（advanced channel）
Web UI Shell
```

Portable Runtime:

```text
SQLite or PostgreSQL（deployment choice）
Local or customer Object Storage
Optional queue（in-process or external）
HTTP API + MCP
localhost or private-network UI
```

Import Service maps Cloud export into Portable Runtime domain model using **shared schema definitions and stable IDs**.

## 8. Stable IDs And Migration Hooks

Even in Cloud-first development, preserve:

* stable Workspace IDs;
* stable Object and record IDs;
* module and pack versions;
* extension versions;
* schema versions;
* migration records;
* file hashes;
* audit logs;
* deterministic export metadata.

Without these, Cloud → Private / Local migration becomes fragile.

## 9. Agent Experience Across Deployment Modes

### Cloud（默认）

```text
Built-in Agent in Cloud UI
→ Agent Operation API
→ governed apply with Diff / Audit / Rollback
```

### Private / Local（高级）

```text
Built-in Agent（if bundled）or External Agent via MCP
→ same governed APIs and permission model
→ no direct DB or source access
```

Example advanced request:

> 我们需要把 Cloud Workspace 导出到客户私有环境。

Agent explains export scope, generates export package, validates compatibility with target Portable Runtime version—not "install SQLite locally first."

## 10. Non-Goals For POC

POC should not implement:

* full Private / On-premise deployment product;
* bidirectional Cloud ↔ Local sync;
* complete data migration from Cloud to Local;
* enterprise SSO and multi-region;
* Tauri desktop shell or local installer.

POC **should** implement:

* Workspace export prototype（config + schema + extensions）;
* Portable Runtime prototype consumption of exported schema manifest（validation level）;
* adapter interfaces documented and stubbed where Cloud services are used.

## 11. Summary

```text
旧假设：Local 是默认，Cloud 是升级路径
新假设：Cloud 是默认，Private / Local 是高级部署模式

旧路径：Local → Cloud Migration
新路径：Cloud → Export → Private / Local Import

不变原则：Portable Runtime、标准 Manifest、Managed Extension、 governed Agent APIs
```
