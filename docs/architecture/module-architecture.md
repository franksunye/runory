# Runory Module Architecture

Status: Draft v0.2  
Date: 2026-06-18  
Change: Cloud-first pivot — see [../04-architecture-pivot-cloud-first.md](../04-architecture-pivot-cloud-first.md)

## 1. Definition

An Official Business Module is a **complete business capability unit**—not a page, feature toggle, or import script.

A standard Module at minimum contains:

```text
Schema / Objects / Fields / Relations
Views / Forms / Permissions
Workflows / Actions / Rules / Events
Agent Skills / Dashboards
Migrations / Seed Data / Upgrade Policy / Documentation
```

Examples:

* `runory.customer` — Customer Management
* `runory.expense` — Expense Management
* `runory.approval` — Approval Workflow
* `runory.organization` — Organization baseline

Examples that are **not** modules:

* adding customer tags → standard module feature or Workspace Extension;
* importing Excel → Skill or workflow;
* adding one custom field → Workspace Extension;
* changing display order → view setting or Extension;
* combining several modules for sale → **Business Pack**.

## 2. Module / Pack / Template Layering

```text
Runory Core
    ↓
Modules（technical install units）
    ↓
Business Packs（commercial delivery units）
    ↓
Workspace Templates（experience entry）
    ↓
Workspace Extensions（workspace customization）
```

### Module

Technical unit installed by Runory Core. Declares objects, migrations, permissions, UI slots, agent skills.

### Pack

Commercial bundle. Example:

```text
Finance Operations Pack
= runory.expense + runory.approval + runory.budget + runory.payment
```

### Template

Workspace experience overlay. Example:

```text
Small Business Finance Workspace Template
= navigation + homepage + terminology + default views + role entry
```

Installing a Pack runs module migrations, registers manifests, and applies Template overlays.

## 3. Module Boundary

An Official Module owns its baseline domain behavior within the metadata-driven object model:

```text
ObjectDefinitions / FieldDefinitions / RelationDefinitions
Business Rules / Workflows / Actions
Agent Skills / Views / Forms / Dashboards
Migrations / Permissions / Extension Points
Compatibility Contract / Upgrade Policy
```

An Official Module does **not** own workspace-specific customization.

Core principle:

> 官方 Module 提供标准能力；Managed Workspace Extension 表达用户差异。

## 4. Module Manifest

Modules declare capabilities through a versioned manifest. Runory Core reads the manifest and registers:

* object and field definitions;
* view and form definitions;
* workflow and action definitions;
* navigation entries and UI slots;
* event types and subscriptions;
* migrations and seed data;
* permission scopes;
* agent skill declarations;
* extension points and compatibility metadata.

Draft manifest shape — see [../sdk/module-sdk.md](../sdk/module-sdk.md).

Example:

```yaml
id: runory.expense
name: Expense Management
version: 1.0.0
coreCompatibility: ">=1.0.0 <2.0.0"

dependencies:
  - runory.organization
  - runory.approval

objects:
  - Expense
  - ExpenseCategory

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
  - create_expense
  - summarize_expenses
  - detect_abnormal_expense

migrations:
  install: migrations/install.sql
  upgrade: migrations/1.0.0_to_1.1.0.sql
  uninstallPolicy: retain_data

ui:
  navigation:
    - Finance > Expenses
  slots:
    - object.customer.sidebar
    - dashboard.finance.widgets

upgradePolicy:
  supportsWorkspaceExtensions: true
  breakingChangePolicy: manual_review
```

## 5. Runtime Contract

All write operations exposed by a module must pass through the Business Engine. Route handlers, MCP handlers, Agent apply endpoints, and Skills must not write directly to databases.

Module installation:

1. Check compatibility with Core and dependencies.
2. Open transaction.
3. Run install migration.
4. Register manifest in Module Registry.
5. Write `installations` record for Workspace.
6. Register navigation, views, permissions, agent skills.
7. Publish `module.installed` event.
8. Recompute Effective Runtime Model.

Duplicate install returns success with `alreadyInstalled: true`.

## 6. Metadata-Driven Objects

Modules define objects through metadata—not ad-hoc undocumented tables only.

Field ownership within a module:

```text
Core-owned fields（created_at, updated_at, id）
Module-owned fields（expense.amount, customer.name）
Extension-compatible slots（declared in extensionPoints）
```

Modules must declare which entities support Extension fields, relations, views, and workflows.

## 7. Extension Contract

Official Modules must explicitly declare extensibility:

* entities allowing custom fields and relations;
* views exposing UI Extension Slots;
* workflows allowing Extension rules or steps;
* metrics and dashboards allowing widgets;
* tools accepting extension field namespaces;
* reserved field keys and namespaces;
* compatible extension manifest versions.

If a capability is not declared extensible, Workspace Extensions cannot modify it.

## 8. Upgrade Contract

Module upgrades must preserve compatible Workspace Extensions.

Each upgrade declares:

* added, changed, deprecated, removed objects and fields;
* changed UI Extension Slots;
* field namespace changes;
* migration requirements;
* extension reapply strategy;
* known incompatibilities.

If upgrade may break active Extensions, Core blocks automatic upgrade and requires user confirmation with compatibility report.

## 9. Prohibited Module Behavior

Official Modules must not:

* store user customization inside module source;
* mutate Workspace Extension definitions outside Core extension APIs;
* bypass Business Engine or audit logging;
* dynamically load arbitrary user-generated React code;
* silently remove Extension Slots used by active workspaces;
* assume Local-only or Cloud-only storage（must use adapters when touching storage services）.

## 10. Marketplace Readiness

Even before Marketplace launch, every module manifest must support:

```text
id / version / coreCompatibility / dependencies
permissions / data ownership declarations
migration and uninstall policies
upgrade and breaking change policies
security and marketplace metadata hooks
```

Third-party modules follow the same manifest contract as official modules.
