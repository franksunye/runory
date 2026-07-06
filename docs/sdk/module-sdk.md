# Runory Module SDK

Status: Draft v0.3
Date: 2026-06-22
Change: Cloud-first pivot — see [../04-architecture-pivot-cloud-first.md](../04-architecture-pivot-cloud-first.md)

## 1. Purpose

The Module SDK defines how Official Modules expose stable capabilities to Platform Core, Built-in Agent, MCP / SDK clients, schema-driven UI, and Managed Workspace Extensions.

This document defines the Module contract. The SDK as a developer product—including packages, CLI, testing harness, local/Cloud boundary, Agent Skill, and v0.1 delivery plan—is defined in [../10-runory-sdk-product.md](../10-runory-sdk-product.md).

Modules are **technical install units**. Business Packs combine modules; Workspace Templates define experience entry.

Workspace Extension architecture: [../architecture/workspace-extension-architecture.md](../architecture/workspace-extension-architecture.md).
Catalog and release lifecycle: [../09-catalog-release-control-plane.md](../09-catalog-release-control-plane.md).

## 2. Module Manifest (Complete Example)

```yaml
id: runory.expense
name: Expense Management
version: 1.0.0
manifestSchemaVersion: "1.0"
coreCompatibility: ">=1.0.0 <2.0.0"

dependencies:
  - runory.organization
  - runory.approval

objects:
  - key: expense
    label: Expense
    fields:
      - key: amount
        type: currency
        ownership: module_owned
      - key: expense_date
        type: date
        ownership: module_owned
  - key: expense_category
    label: Expense Category

relations:
  - from: expense
    to: expense_category
    type: many_to_one

permissions:
  - expense.read
  - expense.create
  - expense.approve
  - expense.admin

workflows:
  - expense_approval

events:
  publishes:
    - expense.created
    - expense.approved
  subscribes:
    - project.closed

agentSkills:
  - key: create_expense
    description: Create expense from structured input
  - key: summarize_expenses
    description: Summarize expenses by period and category
  - key: detect_abnormal_expense
    description: Flag unusual expense patterns

migrations:
  install: migrations/install.sql
  upgrade: migrations/1.0.0_to_1.1.0.sql
  uninstallPolicy: retain_data

ui:
  navigation:
    - group: Finance
      label: Expenses
      route: /finance/expenses
      icon: receipt
  slots:
    - id: expense.form.basic_fields.after
      type: field_group
      allowedExtensions: [customField]
    - id: expense.list.columns
      type: column_group
      allowedExtensions: [customField]
    - id: dashboard.finance.widgets
      type: widget_group
      allowedExtensions: [customMetric]

extensionPoints:
  entities:
    - entity: expense
      customFields:
        enabled: true
        allowedTypes: [text, number, date, select, boolean, relation]
        maxFields: 50
      customRelations:
        enabled: true

upgradePolicy:
  supportsWorkspaceExtensions: true
  breakingChangePolicy: manual_review

marketplace:
  category: finance
  license: runory_official
  publisher: runory

releaseCompatibility:
  previousStable: 0.9.0
  automaticUpgrade: patch_only
```

## 3. Pack Manifest (Example)

```yaml
id: crm-lite-pack
name: CRM Lite Pack
version: 1.0.0
coreCompatibility: ">=1.0.0 <2.0.0"

modules:
  - runory.organization: "^1.0.0"
  - runory.customer: "^1.0.0"
  - runory.contact: "^1.0.0"
  - runory.approval: "^1.0.0"

defaultTemplate: small-business-crm

permissions:
  - pack.crm.install

agentSkills:
  - recommend_crm_setup
  - import_customers

marketplace:
  category: crm
  license: runory_official
```

## 4. Template Manifest (Example)

```yaml
id: small-business-crm
name: Small Business CRM
version: 1.0.0

terminology:
  customer: Customer
  contact: Contact

navigation:
  - dashboard
  - customers
  - contacts
  - approvals

homepage:
  layout: crm_overview
  widgets:
    - customer_count
    - recent_activity
    - pending_approvals

roleEntry:
  owner: /dashboard
  sales: /customers
  manager: /approvals

mobile:
  density: comfortable
  primaryRoutes: [customers, contacts]
```

## 5. Extension Surface (Module Side)

Each Official Module should declare in `extensionPoints`:

* entities allowing custom fields and relations;
* views exposing UI Extension Slots;
* workflows allowing Extension rules;
* hooks for automations;
* tools accepting extension field namespaces;
* metrics and dashboard widget slots;
* reserved field keys;
* compatible extension manifest schema versions.

## 6. Entity Extension Declaration

```json
{
  "entity": "customer",
  "customFields": {
    "enabled": true,
    "allowedTypes": ["text", "number", "date", "select", "boolean", "relation"],
    "maxFields": 50,
    "reservedKeys": ["id", "name", "email", "phone"]
  },
  "customRelations": {
    "enabled": true,
    "allowedTargets": ["project", "deal"]
  }
}
```

## 7. View Extension Slot Declaration

```json
{
  "view": "customer.form",
  "slots": [
    {
      "id": "customer.form.basic_fields.after",
      "type": "field_group",
      "allowedExtensions": ["customField"],
      "risk": "low"
    },
    {
      "id": "customer.detail.actions",
      "type": "action_group",
      "allowedExtensions": ["customAction"],
      "risk": "medium"
    }
  ]
}
```

## 8. Tool And Agent Skill Support

Module agent skills declare inputs, outputs, permission requirements, and whether they accept extension fields.

```json
{
  "skill": "create_expense",
  "permissions": ["expense.create"],
  "customFields": {
    "enabled": true,
    "targetObject": "expense",
    "validation": "business_engine"
  }
}
```

Built-in Agent and MCP clients invoke skills through Agent Operation API—not by modifying module code.

## 9. Compatibility Declaration

```json
{
  "moduleId": "runory.expense",
  "moduleVersion": "1.0.0",
  "extensionCompatibility": {
    "manifestVersions": [">=0.2 <0.3"],
    "deprecatedSlots": [],
    "removedSlots": [],
    "reservedFieldKeys": ["id", "date", "amount", "currency", "vendor"]
  }
}
```

## 10. Field Ownership And Collision Rules

Modules declare field ownership in object definitions. Workspace Extensions create fields only in their namespace.

If a module upgrade introduces a field conflicting with an Extension field, Core produces a compatibility report—never silent overwrite.

## 11. Cloud And Portable Runtime

Module manifests are **identical** across Cloud and Portable Runtime. Storage, Auth, and Queue differences are handled by Platform Core adapters—not by forking module definitions.

## 12. Marketplace Hooks

Manifests should reserve:

```text
marketplace.category / license / publisher
dependency resolution metadata
security review status (third-party)
billing hook references (future)
data ownership declarations
```

Even MVP modules should populate official marketplace fields for forward compatibility.

## 13. Build and Release Contract

The SDK source manifest is build input, not the production Registry record. CI packages Manifest, migrations, schemas, assets, documentation, and provenance into an immutable artifact with SHA-256 checksum.

```text
source manifest
→ SDK validation
→ immutable artifact
→ Cloud Registry candidate
→ validation + Sandbox
→ Internal / Beta / Stable release
```

After a Catalog Version reaches `ready`, the artifact and Manifest cannot be replaced. Any fix requires a new SemVer version. Pack release resolves dependency ranges once and stores a frozen lock; Workspace install uses that lock rather than resolving current latest versions.

Platform release commands and Workspace installation commands are governed APIs. Agent tools may generate plans, diffs, validation explanations, and release notes, but Stable release requires an authorized human Release Manager.
