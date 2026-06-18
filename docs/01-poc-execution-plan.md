# Runory POC Execution Plan

Status: Draft v0.3  
Date: 2026-06-18  
Change: Cloud-first pivot + tech stack alignment (Vercel + Turso + Cloudflare + GitHub Actions)

## 1. Executive Summary

Runory POC validates one core hypothesis:

> **A metadata-driven object model, combined with Agent-governed Workspace Extensions, can deliver a running business application—without runtime code generation.**

If this holds, Runory's product paradigm is viable. If it doesn't, no amount of UI polish or feature breadth will save it.

The POC proves two loops end to end:

1. **Capability Activation**: Create Workspace → Install Pack → objects, fields, views, navigation appear via metadata → user can create and list records.
2. **Agent Configuration**: User asks for a custom field → Agent generates Extension Plan → Diff Preview → User confirms → field appears in list and form → Audit log records the change → Rollback works.

Everything else (multi-tenant billing, Marketplace, full auth, Private deployment) is deferred.

## 2. Core Hypotheses To Validate

| # | Hypothesis | Why it matters | How we prove it |
|---|-----------|---------------|-----------------|
| H1 | Metadata-driven objects can drive real UI | If ViewDefinition can't render a usable list+form, the whole platform is moot | Pack install creates objects → schema-driven UI renders working list and form |
| H2 | Pack/Module/Template layering works | If installing a Pack doesn't produce a coherent business experience, the composable platform claim fails | CRM Lite Pack install → customer object + views + navigation appear |
| H3 | Managed Extension can safely extend Module-owned schema | If Extension can't add fields without breaking Module upgrades, the "no direct customization" principle fails | Agent adds "客户等级" field → appears in list+form → Module manifest unchanged |
| H4 | Governed Agent flow is practical | If the Permission→Diff→Apply→Audit→Rollback chain is too slow or too complex for real use, Agent-native is just a buzzword | Full flow completes in one session; rollback restores prior state |
| H5 | SQLite (Turso) works as Cloud database for metadata-driven model | If we need PostgreSQL for the metadata runtime, the Portable Runtime story weakens | All platform + business data in Turso/libSQL |
| H6 | Serverless (Vercel) can host the Platform Core | If serverless constraints break the architecture, we need a different deployment strategy | Full POC runs on Vercel API routes + Turso |

## 3. Technical Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Cloud UI** | Vercel + Next.js (App Router) | Serverless, SSR, API routes, team familiarity |
| **Database** | Turso (libSQL/SQLite) | Same engine for Cloud and Local; edge replication; JSON support; eliminates DB adapter complexity |
| **Background Jobs** | Cloudflare Workers (Cron Triggers) | Usage metering, audit cleanup, export generation |
| **Object Storage** | Cloudflare R2 | Pack artifacts, export bundles, attachments |
| **CI/CD** | GitHub Actions | Test on PR; deploy on main; module publish pipeline |
| **Realtime** | Polling (POC) → WebSocket/SSE (post-POC) | Vercel serverless has timeout limits; polling every 3s is sufficient for POC |
| **MCP Server** | Runory API routes (HTTP transport) or local stdio | Standard MCP interface for Personal Agents; HTTP for Cloud, stdio for dev/Portable Runtime |
| **Personal Agent** | Codex / Trae / Cursor / Claude Code | Reads Runory Skill, generates Extension Plan, calls Runory via MCP. Runory does NOT hold LLM keys or call LLM APIs. |

### Why Turso Changes The Architecture

The original plan assumed PostgreSQL for Cloud and SQLite for Portable Runtime, requiring a database adapter layer. **Turso is SQLite at the edge**—Cloud and Local use the same engine, same schema, same migrations. This means:

- No database adapter needed for POC.
- Portable Runtime = same code, self-hosted libSQL or SQLite file.
- Workspace Export = dump schema + data to SQLite file (trivial).
- JSON columns in SQLite handle flexible extension field storage naturally.

### Serverless Constraints And Design Decisions

| Constraint | Decision |
|-----------|----------|
| No long-running process | API routes are request-scoped; no in-process Event Bus |
| SSE timeout | Use polling for POC (3s interval); optimistic UI updates |
| Background work | Cloudflare Workers Cron for async tasks |
| File storage | Cloudflare R2 via S3-compatible API |

## 4. Architecture (POC)

```text
User Browser
  |
  | HTTPS
  v
Vercel (Next.js App Router)
  - Cloud UI Shell (schema-driven)
  - API Routes (Platform Core)
    - Auth (simple token for POC)
    - Workspace API
    - Pack Install API
    - Metadata Runtime (Object/Field/View)
    - Extension Runtime (Plan/Preview/Apply/Rollback)
    - Record CRUD API
    - Audit API
    - Export API
    - MCP HTTP Endpoint (for Personal Agents)
  |
  v
Turso (libSQL/SQLite)
  - Platform tables (metadata)
  - Business tables (module-created)
  - Extension tables (custom field values)
  |
  | Optional (advanced)
  v
Cloudflare Workers
  - Cron: usage metering, audit cleanup
  - Export generation
  |
  | CI/CD
  v
GitHub Actions
  - Test on PR
  - Deploy to Vercel on main
  - Module publish pipeline (future)
```

Personal Agents connect from outside:

```text
Personal Agent (Codex / Trae / Cursor / Claude Code)
  - Reads Runory Skill (SKILL.md)
  - Calls Runory MCP tools (runory.extension.plan, runory.extension.apply, etc.)
  - Runory validates and executes; does NOT call LLM APIs
```

Core rule (unchanged):

> All writes must pass through the Platform Core / Business Engine. Agents, UI, MCP handlers, and modules must not write databases directly.

## 5. POC Scope

### In Scope

- Single workspace (no multi-tenant for POC; add `workspace_id` column for future).
- Simple auth (token-based; no OAuth/SSO).
- Metadata-driven Object/Field/View/Form definitions.
- Module Manifest parser and installer.
- One Business Pack: **CRM Lite** (customer + contact objects).
- One Workspace Template: **Small Business CRM**.
- Managed Workspace Extension: Custom Field + Custom View column.
- MCP tools: extension.plan, extension.preview, extension.apply, extension.rollback (for Personal Agents).
- Diff Preview, Audit Log, Rollback Point.
- Schema-driven UI Shell (list view + form view + navigation).
- Workspace Export (JSON bundle).
- Portable Runtime prototype (existing `apps/runtime` retained as reference).

### Out Of Scope

- Multi-tenant isolation and billing.
- Full auth (OAuth, SSO, password reset).
- Marketplace UI and third-party modules.
- Custom Workflow runtime (deferred—focus on Custom Field first).
- Real-time SSE/WebSocket (use polling).
- Private/On-premise deployment product.
- Tauri desktop shell.
- Runtime-generated React code.
- Real image OCR.
- Accounting-grade features.

### Scope Reduction From v0.2

The previous plan included Workflow creation (V3) and full Export validation (V4) in POC. This version **defers Workflow to post-POC** and reduces Export to a JSON dump. Rationale: Custom Field extension is the highest-risk, highest-value proof point. Workflow adds complexity without proving a new hypothesis—the governed apply flow is the same.

## 6. Minimal Demo Scenario

The demo viewer should immediately understand:

> I opened a URL, created a workspace, clicked "Install CRM Lite Pack", and got a working customer list. Then I typed "add a 客户等级 field to customers" in a chat box, saw a diff, clicked confirm, and the field appeared. No code was written. No local install was needed.

### Demo Steps

1. User opens `https://runory.vercel.app` (or preview URL).
2. User creates a Workspace (name only, no auth for POC).
3. User selects "Small Business CRM" Template.
4. User clicks "Install CRM Lite Pack".
5. Pack install runs migrations, registers objects/fields/views/navigation.
6. UI shows: left navigation (Dashboard, Customers), customer list page, "Add Customer" form.
7. User creates a customer record (name, email, phone) → appears in list.
8. User opens Personal Agent (e.g., Trae), which has Runory Skill installed.
9. User tells Personal Agent: "给客户增加一个「客户等级」字段，选项为 A/B/C".
10. Personal Agent reads Runory Skill, calls `runory.extension.plan` MCP tool with the request.
11. Runory returns current schema; Personal Agent generates Extension Plan JSON.
12. Personal Agent calls `runory.extension.preview` → UI shows Diff Preview (new field: tier, type: select, options: A/B/C, added to customer.list.columns and customer.form.basic_fields.after).
13. User clicks "Confirm" (in Personal Agent or Runory UI).
14. Personal Agent calls `runory.extension.apply` → Extension is applied → customer list now shows "客户等级" column → form shows dropdown.
15. User creates a customer with tier = "A" → record saved with extension field.
16. User opens Audit Log → sees the full change record.
17. Personal Agent calls `runory.extension.rollback` → field disappears → list and form revert.
18. User clicks "Export Workspace" → downloads JSON bundle (schema + extensions + config).

## 7. Data Model (Turso)

### Platform Tables

```sql
-- Workspace (single for POC, multi-tenant ready)
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  template_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Module installations
CREATE TABLE installations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  module_version TEXT NOT NULL,
  pack_id TEXT,
  status TEXT NOT NULL DEFAULT 'installed',
  installed_at TEXT NOT NULL,
  UNIQUE(workspace_id, module_id)
);

-- Metadata: Object definitions
CREATE TABLE object_definitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  label TEXT NOT NULL,
  module_id TEXT,
  ownership TEXT NOT NULL DEFAULT 'module_owned',
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, object_key)
);

-- Metadata: Field definitions
CREATE TABLE field_definitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  ownership TEXT NOT NULL DEFAULT 'module_owned',
  required INTEGER NOT NULL DEFAULT 0,
  default_value TEXT,
  validation_json TEXT,
  module_id TEXT,
  extension_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, object_key, field_key)
);

-- Metadata: View definitions
CREATE TABLE view_definitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  view_key TEXT NOT NULL,
  view_type TEXT NOT NULL,
  label TEXT NOT NULL,
  config_json TEXT NOT NULL,
  module_id TEXT,
  extension_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(workspace_id, object_key, view_key)
);

-- Metadata: Navigation
CREATE TABLE navigation_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  label TEXT NOT NULL,
  route TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'file',
  sort_order INTEGER NOT NULL DEFAULT 100,
  module_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1
);

-- Extension management
CREATE TABLE extension_definitions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  namespace TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE extension_versions (
  id TEXT PRIMARY KEY,
  extension_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  diff_json TEXT,
  risk_level TEXT NOT NULL DEFAULT 'low',
  change_summary TEXT,
  created_by TEXT NOT NULL,
  approved_by TEXT,
  applied_at TEXT,
  rollback_of_version INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE(extension_id, version)
);

-- Audit
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  extension_version_id TEXT,
  created_at TEXT NOT NULL
);

-- Agent runs
CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  input_json TEXT,
  output_json TEXT,
  status TEXT NOT NULL,
  extension_version_id TEXT,
  created_at TEXT NOT NULL
);
```

### Business Tables (created by Module migrations)

```sql
-- Created by runory.customer module install
CREATE TABLE customer (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Created by runory.contact module install
CREATE TABLE contact (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customer(id)
);
```

### Extension Field Storage

```sql
-- Extension-created field values (JSON-based, keyed by record + field)
CREATE TABLE extension_field_values (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  record_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  extension_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, object_key, record_id, field_key)
);
```

### Design Decision: Hybrid Storage

- **Module-owned fields** → real columns in business tables (e.g., `customer.name`).
- **Extension-owned fields** → stored in `extension_field_values` as JSON.
- **Read-time merge**: API joins business table + extension field values to produce complete records.
- **Why not pure EAV**: Module fields need type safety, indexing, and foreign keys.
- **Why not JSON column on business table**: Keeps Module schema clean; Extension data is isolated and auditable.

## 8. Module Manifest (CRM Lite Pack)

### Pack Manifest

```yaml
# packs/crm-lite-pack/manifest.yaml
id: crm-lite-pack
name: CRM Lite Pack
version: 1.0.0
coreCompatibility: ">=0.1.0"

modules:
  - runory.customer: "^1.0.0"
  - runory.contact: "^1.0.0"

defaultTemplate: small-business-crm

marketplace:
  category: crm
  license: runory_official
  publisher: runory
```

### Module Manifest: runory.customer

```yaml
# modules/runory.customer/manifest.yaml
id: runory.customer
name: Customer Management
version: 1.0.0
coreCompatibility: ">=0.1.0"

objects:
  - key: customer
    label: Customer
    fields:
      - key: name
        label: 客户名称
        type: text
        ownership: module_owned
        required: true
      - key: email
        label: 邮箱
        type: email
        ownership: module_owned
      - key: phone
        label: 电话
        type: phone
        ownership: module_owned

views:
  - object: customer
    key: customer_list
    type: list
    label: 客户列表
    config:
      columns:
        - field: name
          label: 客户名称
        - field: email
          label: 邮箱
        - field: phone
          label: 电话
      actions:
        - create
        - view
      pageSize: 20

  - object: customer
    key: customer_form
    type: form
    label: 客户表单
    config:
      sections:
        - title: 基本信息
          fields:
            - field: name
              required: true
            - field: email
            - field: phone

permissions:
  - customer.read
  - customer.create
  - customer.update
  - customer.delete

migrations:
  install: migrations/install.sql
  uninstallPolicy: retain_data

ui:
  navigation:
    - label: 客户
      route: /customers
      icon: users
      sortOrder: 20

extensionPoints:
  entities:
    - entity: customer
      customFields:
        enabled: true
        allowedTypes: [text, number, date, select, boolean]
        maxFields: 50
        reservedKeys: [id, name, email, phone, created_at, updated_at]
      customRelations:
        enabled: false
  views:
    - view: customer_list
      slots:
        - id: customer.list.columns
          type: column_group
          allowedExtensions: [customField]
          risk: low
    - view: customer_form
      slots:
        - id: customer.form.basic_fields.after
          type: field_group
          allowedExtensions: [customField]
          risk: low

upgradePolicy:
  supportsWorkspaceExtensions: true
  breakingChangePolicy: manual_review
```

### Module Manifest: runory.contact

```yaml
# modules/runory.contact/manifest.yaml
id: runory.contact
name: Contact Management
version: 1.0.0
coreCompatibility: ">=0.1.0"

dependencies:
  - runory.customer

objects:
  - key: contact
    label: Contact
    fields:
      - key: name
        label: 联系人姓名
        type: text
        ownership: module_owned
        required: true
      - key: email
        label: 邮箱
        type: email
        ownership: module_owned
      - key: phone
        label: 电话
        type: phone
        ownership: module_owned
      - key: role
        label: 角色
        type: text
        ownership: module_owned

views:
  - object: contact
    key: contact_list
    type: list
    label: 联系人列表
    config:
      columns:
        - field: name
        - field: email
        - field: phone
        - field: role

permissions:
  - contact.read
  - contact.create
  - contact.update
  - contact.delete

migrations:
  install: migrations/install.sql
  uninstallPolicy: retain_data

ui:
  navigation:
    - label: 联系人
      route: /contacts
      icon: contact
      sortOrder: 30

extensionPoints:
  entities:
    - entity: contact
      customFields:
        enabled: true
        allowedTypes: [text, number, date, select, boolean]
        maxFields: 30
        reservedKeys: [id, name, email, phone, role, created_at, updated_at]
```

### Template Manifest: small-business-crm

```yaml
# templates/small-business-crm/manifest.yaml
id: small-business-crm
name: Small Business CRM
version: 1.0.0

terminology:
  customer: 客户
  contact: 联系人

navigation:
  - dashboard
  - customers
  - contacts

homepage:
  layout: crm_overview
  widgets:
    - customer_count
    - recent_activity

roleEntry:
  owner: /dashboard
  sales: /customers
```

## 9. API Surface (POC)

### Workspace

```
POST   /api/workspaces                          # Create workspace
GET    /api/workspaces/:id                      # Get workspace
GET    /api/workspaces/:id/navigation           # Get navigation items
```

### Pack Install

```
POST   /api/workspaces/:id/packs/:packId/install   # Install pack
GET    /api/workspaces/:id/installations            # List installations
```

### Metadata

```
GET    /api/workspaces/:id/objects                   # List object definitions
GET    /api/workspaces/:id/objects/:objectKey        # Get object with fields
GET    /api/workspaces/:id/objects/:objectKey/views  # Get views for object
```

### Records

```
GET    /api/workspaces/:id/objects/:objectKey/records          # List records
POST   /api/workspaces/:id/objects/:objectKey/records          # Create record
GET    /api/workspaces/:id/objects/:objectKey/records/:recordId  # Get record
PUT    /api/workspaces/:id/objects/:objectKey/records/:recordId  # Update record
```

### MCP Tools (for Personal Agents)

```
runory.workspace.status          # Get workspace state
runory.workspace.inspect_schema  # Get current objects/fields/views/extension points
runory.extension.plan            # Submit Extension Plan JSON (generated by Personal Agent)
runory.extension.preview         # Compute diff for a plan
runory.extension.apply           # Apply extension (permission check, audit, rollback point)
runory.extension.rollback        # Rollback to prior extension version
runory.extension.list            # List extensions and versions
```

These MCP tools mirror the HTTP API. Personal Agents (Codex / Trae / Cursor / Claude Code) read the Runory Skill, call these tools, and Runory executes governed operations. Runory does NOT call LLM APIs.

### Audit & Export

```
GET    /api/workspaces/:id/audit             # Audit log
POST   /api/workspaces/:id/export            # Export workspace config
```

### Health

```
GET    /api/health                           # Health check
```

## 10. Personal Agent Integration

### Architecture Principle

Runory is a **headless business platform**. It does NOT:
- Hold LLM API keys
- Call LLM APIs
- Generate Extension Plans
- Do prompt engineering

LLM intelligence lives in the **Personal Agent** (Codex / Trae / Cursor / Claude Code). Runory exposes governed MCP tools and HTTP APIs. The Personal Agent reads the Runory Skill, understands user intent, generates the Extension Plan, and submits it to Runory for validation and execution.

### Operation Flow

```text
User tells Personal Agent: "给客户增加一个「客户等级」字段，选项为 A/B/C"
  |
  v
Personal Agent reads Runory Skill (SKILL.md)
  - Knows available MCP tools and their input shapes
  - Knows the governed flow: plan → preview → apply
  |
  v
Personal Agent calls runory.workspace.inspect_schema
  - Runory returns current objects, fields, views, extension points
  |
  v
Personal Agent generates Extension Plan JSON
  - Uses its own LLM capability to translate intent → structured plan
  - Plan conforms to Runory Extension Manifest spec
  |
  v
Personal Agent calls runory.extension.plan
  - Submits Extension Plan JSON to Runory
  - Runory validates plan against Module extension points
  - Runory returns validation result (accepted / rejected with reasons)
  |
  v
Personal Agent calls runory.extension.preview
  - Runory computes Diff (before/after)
  - Returns: diff summary, risk level, affected views
  - Personal Agent shows diff to user (or user sees it in Runory UI via polling)
  |
  v
User confirms (in Personal Agent or Runory UI)
  |
  v
Personal Agent calls runory.extension.apply
  - Runory: permission check → create extension version → insert field definitions → update view definitions → audit log → rollback point
  - Runory returns: applied extension with version
  |
  v
Runory UI polls metadata API → sees new field → re-renders list and form
```

### Runory Skill (SKILL.md)

The Skill file is the contract between Runory and Personal Agents. It declares:
- Available MCP tools and their input shapes
- The governed flow (plan → preview → apply → rollback)
- Extension Manifest format
- Validation rules (field ownership, reserved keys, extension points)
- When to use each tool

The Skill does NOT contain LLM prompts. It contains operational instructions that any Personal Agent can follow.

### Extension Plan Format

The Personal Agent generates this JSON and submits via `runory.extension.plan`:

```json
{
  "name": "Customer Tier",
  "description": "Add customer tier field with options A/B/C",
  "targetModules": ["runory.customer"],
  "riskLevel": "low",
  "customFields": [
    {
      "targetObject": "customer",
      "fieldKey": "tier",
      "label": "客户等级",
      "type": "select",
      "ownership": "workspace_extension",
      "required": false,
      "validation": {
        "options": ["A", "B", "C"]
      },
      "ui": {
        "listColumn": true,
        "slot": "customer.form.basic_fields.after",
        "order": 100
      }
    }
  ]
}
```

Runory validates this against the Module's `extensionPoints` declaration. If the plan violates constraints (e.g., reserved key, unsupported type, slot not declared), Runory rejects it with a structured error.

### Fallback: Direct API

The same operations can be performed via HTTP API (for testing or non-MCP clients). MCP tools and HTTP API share the same permission model and validation logic.

## 11. UI Requirements

### Pages

| Page | Route | Description |
|------|-------|-------------|
| Landing | `/` | Workspace creation form |
| Dashboard | `/w/:workspaceId/dashboard` | Overview (customer count, recent activity) |
| Customer List | `/w/:workspaceId/customers` | Schema-driven list from `customer_list` view definition |
| Customer Form | `/w/:workspaceId/customers/new` | Schema-driven form from `customer_form` view definition |
| Customer Detail | `/w/:workspaceId/customers/:id` | Record detail with extension fields |
| Contact List | `/w/:workspaceId/contacts` | Schema-driven list |
| Agent Panel | (modal/drawer) | Diff preview display, confirm/rollback buttons (reflects MCP tool results) |
| Audit Log | `/w/:workspaceId/audit` | Chronological list of changes |
| Settings | `/w/:workspaceId/settings` | Pack install, export, extensions list |

### Schema-Driven Rendering

The UI does NOT hardcode customer fields. Instead:

1. Fetch `GET /api/workspaces/:id/objects/customer` → get field definitions.
2. Fetch `GET /api/workspaces/:id/objects/customer/views` → get view definitions.
3. Render list: read `customer_list` config → map columns to field definitions → render `<SchemaTable>`.
4. Render form: read `customer_form` config → map sections to field definitions → render `<SchemaForm>`.
5. When extension is applied → poll returns new field definitions → UI re-renders automatically.

### Component Registry (POC)

```text
SchemaTable    → renders list from view definition
SchemaForm     → renders form from view definition
SchemaField    → renders single field by type (text, email, phone, select, date, number, boolean)
DiffPreview    → shows extension diff before apply (reflects runory.extension.preview result)
AuditTimeline  → chronological audit entries
NavigationShell → left sidebar from navigation_items
```

### Live Behavior

- Navigation updates after Pack install (re-fetch navigation API).
- List and form update after Extension apply (poll metadata API).
- Diff preview before apply for all risk levels (POC simplification).
- Audit log updates after each operation.

## 12. Repository Shape

```text
runory/
  apps/
    cloud/                 # Next.js app (Vercel)
      app/                 # App Router pages
      api/                 # API routes
      lib/                 # Platform Core (engine, metadata, extension, agent)
      components/          # Schema-driven UI components
    web/                   # Legacy V1 web (retained as reference, not deployed)
    runtime/               # Portable Runtime prototype (retained as reference)
  packages/
    shared/                # Shared types (existing)
    manifest-types/        # Module/Pack/Template/Extension manifest TypeScript types
  modules/
    runory.customer/       # Customer module
      manifest.yaml
      migrations/
        install.sql
    runory.contact/        # Contact module
      manifest.yaml
      migrations/
        install.sql
  packs/
    crm-lite-pack/         # CRM Lite Pack
      manifest.yaml
  templates/
    small-business-crm/    # Workspace template
      manifest.yaml
  skills/
    runory-smb-poc/        # Skill (evolving)
  docs/
  .github/
    workflows/
      ci.yml               # Test on PR
      deploy.yml           # Deploy to Vercel on main
```

## 13. Version Plan

### V0: Cloud Skeleton (Days 1-3)

- Vercel + Next.js + Turso setup.
- Workspace create API + landing page.
- Health check.
- Turso schema (platform tables).
- GitHub Actions CI (lint + typecheck).

**Acceptance**: `vercel dev` runs locally; `POST /api/workspaces` creates a workspace; landing page renders.

### V1: Pack Install Loop (Days 4-8)

- Module Manifest parser (YAML → typed object).
- Pack installer: read manifest → run migrations → insert object/field/view definitions → insert navigation items.
- CRM Lite Pack + Small Business CRM Template defined in repo.
- Schema-driven list view (`SchemaTable`).
- Schema-driven form view (`SchemaForm`).
- Record CRUD API.
- Navigation shell.

**Acceptance**: Install CRM Lite Pack → customer list and form appear → user can create and view customers. No hardcoded field rendering.

### V2: Agent Extension Loop (Days 9-14)

- Extension runtime: plan, preview, apply, rollback.
- MCP tools: `runory.extension.plan/preview/apply/rollback`, `runory.workspace.inspect_schema`.
- Runory Skill (SKILL.md) updated for Cloud POC.
- Diff Preview UI (reflects MCP preview result).
- Extension field storage (`extension_field_values`).
- Read-time merge (module fields + extension fields).
- Audit log.
- Rollback.

**Acceptance**: Personal Agent reads Skill → calls `runory.extension.plan` with generated Extension Plan → preview shows diff → apply → field appears in list and form → audit log records change → rollback removes field.

### V3: Export & Polish (Days 15-18)

- Workspace export (JSON bundle: schema + extensions + config).
- Audit log viewer.
- Extension version history.
- Error handling and loading states.
- Demo fixtures (seed data for clean demo).

**Acceptance**: Export produces valid JSON; demo runs cleanly from scratch 3 times.

### Post-POC (Deferred)

- Multi-tenant isolation.
- Auth (OAuth/password).
- Custom Workflow runtime.
- Marketplace UI.
- MCP HTTP server on Cloudflare Workers.
- Real-time (WebSocket/SSE).
- Private deployment.

## 14. Business Rules (Must Implement Before UI Polish)

1. **Field ownership**: `module_owned` fields cannot be created/modified by Extensions.
2. **Field key uniqueness**: within `(workspace_id, object_key)`, no duplicate field keys.
3. **Reserved keys**: Extension cannot use keys in Module's `reservedKeys` list.
4. **Extension point validation**: Extension can only add fields to entities with `customFields.enabled: true`.
5. **View slot validation**: Extension can only add columns/fields to declared UI Slots.
6. **Pack install idempotency**: duplicate install returns `{ alreadyInstalled: true }`.
7. **Rollback safety**: rollback restores prior `extension_version` and recomputes effective field/view definitions.
8. **Audit completeness**: every apply/rollback creates an audit log entry with before/after JSON.
9. **Extension plan validation**: Plan submitted by Personal Agent is validated against extension points before preview is shown. Runory does not generate plans—it only validates and executes them.

## 15. Test Plan

### Unit Tests (Vitest)

- Manifest parser: YAML → typed object, validation.
- Pack installer: idempotent install, migration execution.
- Metadata runtime: object/field/view CRUD, ownership rules.
- Extension runtime: plan validation, apply, rollback, field key collision detection.
- Field ownership enforcement: Extension cannot modify module-owned fields.
- View slot validation: Extension column rejected if slot not declared.

### Integration Tests

- Pack install → metadata tables populated → API returns objects/fields/views.
- Agent plan → preview → apply → field_definitions updated → record API includes extension field. (Plan submitted via MCP tool, not generated by Runory)
- Rollback → extension version reverted → field removed from API.
- Export → JSON bundle contains correct schema + extension versions.

### E2E Tests (Playwright, post-POC)

1. Create workspace → install pack → see customer list.
2. Personal Agent submits extension plan via MCP → diff → confirm → field visible.
3. Rollback → field disappears.
4. Export → download JSON.

## 16. Risks And Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Metadata-driven UI feels clunky vs hardcoded | High | Invest in SchemaTable/SchemaForm quality early; use CRM Lite as benchmark |
| Personal Agent generates invalid Extension plans | Medium | Runory validates against extension points before preview; returns structured errors; Personal Agent can retry |
| Turso performance for metadata joins | Low | SQLite is fast for POC scale; add indexes if needed |
| Serverless timeout for complex operations | Low | Keep operations request-scoped; move heavy work to CF Workers |
| Scope creep into Workflow/Multi-tenant | High | Strict POC scope; defer Workflow to post-POC |
| Polling feels laggy | Low | 3s interval + optimistic UI for POC; upgrade to WebSocket later |

## 17. POC Acceptance Criteria

The POC passes when:

1. User can create a Workspace via web UI (no local install).
2. User can install CRM Lite Pack from the UI.
3. Pack install creates objects, fields, views, and navigation via metadata—no code deploy.
4. Schema-driven UI renders a working customer list and form from view definitions.
5. User can create, view customer records.
6. Personal Agent can submit an Extension Plan ("客户等级" field) via MCP tool.
7. Diff Preview is shown before apply.
8. After confirm, the field appears in list and form without page reload (polling).
9. Audit log records the full change.
10. Rollback removes the field and restores prior state.
11. Official Module manifest is not modified by the Extension.
12. Workspace config can be exported as JSON.
13. Runory never calls LLM APIs—Personal Agent generates plans, Runory only validates and executes.
14. The entire demo runs on Vercel + Turso.

## 18. Immediate Next Steps

1. **Scaffold `apps/cloud`** (Next.js + Turso client).
2. **Define CRM Lite Pack manifests** (YAML files in `modules/` and `packs/`).
3. **Implement Turso schema** (platform tables).
4. **Build Pack installer** (manifest parser + migration runner).
5. **Build Schema-driven UI** (SchemaTable + SchemaForm).
6. **Implement Extension runtime** (plan/preview/apply/rollback).
7. **Implement MCP tools** (`runory.extension.*`, `runory.workspace.*`).
8. **Update Runory Skill** (SKILL.md) for Cloud POC MCP tools.
9. **Set up GitHub Actions** (CI + deploy).

The first externally meaningful demo is **V1 + V2**: Cloud Workspace → Pack install → schema-driven customer list → Personal Agent submits extension plan via MCP → Diff / Audit / Rollback.
