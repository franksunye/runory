# Runory Module Architecture

Status: Draft v0.3
Date: 2026-06-22
Change: Cloud-first pivot — see [../04-architecture-pivot-cloud-first.md](../04-architecture-pivot-cloud-first.md)

## 1. Definition

An Official Business Module is a **complete business capability unit**—not a page, feature toggle, customer-specific form set, provider script, or import script.

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
* `runory.implementation` — Customer Implementation Management

Examples that are **not** modules:

* adding customer tags → standard module feature or Workspace Extension;
* importing Excel → Skill or workflow;
* adding one custom field → Workspace Extension;
* changing display order → view setting or Extension;
* defining one customer's intake form → Template, Form Definition, or Extension;
* binding one provider such as Twilio, Retell, or Stripe → provider adapter;
* combining several modules for sale → **Business Pack**.

## 2. Module / Pack / Template Layering

```text
Runory Core
    ↓
Official Domain Modules (stable domain semantics)
    ↓
Business Packs (commercial and operational composition)
    ↓
Workspace Templates (terminology, navigation, default experience)
    ↓
Metadata-driven Forms / Fields / Views / Rules
    ↓
Provider Adapters
    ↓
Workspace Extensions (customer-specific differences)
```

This layering is mandatory for all Runory domains, including CRM, Sales, FSM, Payment, Voice Intake, Implementation, Expense, Inventory, and future Modules.

### Module

A Module is the technical install unit and the stable domain authority. It declares canonical objects, relations, lifecycle states, Command Contracts, invariants, permissions, events, migrations, extension points, baseline views, forms, workflows, dashboards, and Agent Skills.

A Module must model concepts that remain valid across its supported domain. It must not be forked because customers use different terminology, fields, forms, views, checklists, providers, or optional workflow variants.

### Pack

A Pack is a commercial and operational composition of Modules. Example:

```text
Finance Operations Pack
= runory.expense + runory.approval + runory.budget + runory.payment
```

```text
Runory Product Implementation Pack
= runory.company + runory.contact + runory.crm + runory.sales
+ runory.fsm + runory.payment + runory.implementation
```

A Pack may define dependencies, capability requirements, default workflow composition, role bundles, compatibility locks, and supported provider capabilities. It must not redefine the domain invariants owned by its Modules.

A Pack may reuse modules that are also used by other packs. For example, both `crm-lite-pack` and `fsm-pack` can depend on `runory.company`, `runory.contact`, and `runory.task`.

Shared business modules are still business modules, not SaaS Core. SaaS Core remains responsible for tenancy, auth, workspace, catalog, installation, audit, extension runtime, and usage. A reusable object such as `company` belongs to one Official Business Module and is reused by packs through dependency composition.

### Template

A Workspace Template defines the default experience for an industry, product, customer type, or operating model. Example:

```text
Small Business Finance Workspace Template
= navigation + homepage + terminology + default views + role entry
```

Templates may provide:

* navigation and homepage composition;
* terminology and labels;
* role entry points;
* default views, filters, dashboards, and forms;
* enabled process variants;
* required-input checklists;
* sample data and onboarding guidance.

Installing a Pack runs module migrations, registers manifests, and applies Template overlays.

Module/Pack/Template development and production release do not directly use mutable repository files. Official/Internal source is turned by Git/CI into immutable artifacts, imported into the Cloud Catalog Registry, and only becomes visible to Workspaces after validation, release channel promotion, and rollout. For the full control plane, see [../09-catalog-release-control-plane.md](../09-catalog-release-control-plane.md).

## 3. Standard Domain Boundary

An Official Module owns its baseline domain behavior within the metadata-driven object model:

```text
ObjectDefinitions / FieldDefinitions / RelationDefinitions
Aggregates / Command Contracts / Business Rules
Workflows / Automations / Actions
Agent Skills / Baseline Views / Forms / Dashboards
Migrations / Permissions / Extension Points
Compatibility Contract / Upgrade Policy
```

Governed lifecycle behavior is declared through machine-readable Command Contracts. Workflow and Automation may invoke those Commands but may not reimplement their invariant logic. Shared Runtime capabilities participate through versioned semantic providers, and Pack installation must resolve the complete provider closure. See [Contract-Driven Command Architecture](./contract-driven-command-architecture.md).

An Official Module does **not** own product-, industry-, workspace-, customer-, or provider-specific variation unless that variation represents a stable domain invariant.

Core principle:

> Official Modules provide standard domain capabilities. Packs compose them. Templates and metadata define experience and forms. Provider adapters connect external services. Managed Workspace Extensions express customer-specific differences.

Before adding a field, state, dependency, Command, or workflow to a Module, Product and Engineering must ask:

1. Is this a stable domain concept across the supported market?
2. Is it an authoritative business fact requiring a domain invariant or governed Command?
3. Would placing it in the Module improve reuse without forcing irrelevant complexity on other customers?
4. Could it instead be represented by a Pack, Template, Form Definition, Field Definition, View Definition, policy, provider adapter, or Workspace Extension?

If the fourth answer is yes and no domain invariant requires Module ownership, the concern remains outside the Module core.

### 3.1 Application to `runory.implementation`

`runory.implementation` is a standard implementation-domain Module. It may own:

* Implementation Opportunity and Order linkage;
* Implementation Run;
* versioned Implementation Blueprint;
* Customer Input Request;
* Configuration Package;
* Migration Plan and Batch;
* Test Suite and Test Run;
* Approval Gate;
* Go-live Plan;
* Implementation Issue and Hypercare Case;
* implementation lifecycle, evidence, effort, cost, quality, and productization semantics.

The first Runory reference implementation is composed separately:

```text
runory.implementation
= standard implementation domain Module

Runory Product Implementation Pack
= Runory-specific module composition and delivery policy

Runory Implementation Workspace Template
= Runory-specific terminology, navigation, roles, dashboards, forms, and checklists

Twilio / Retell / Stripe adapters
= provider-specific execution

Workspace Extensions
= exceptional customer-specific differences
```

Therefore, mandatory dependence on Twilio, Retell, Stripe, Voice Intake, or Runory-only Workspace provisioning must not be embedded in the permanent core of `runory.implementation`. Those capabilities belong to the first Pack, Template, and provider adapters.

This same separation applies to every other Official Module.

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

A manifest must distinguish:

* Module-owned canonical definitions;
* reusable baseline defaults;
* Template-overridable presentation and terminology;
* metadata extension points;
* optional provider capability requirements;
* Pack-level dependencies and compatibility constraints.

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

extensionPoints:
  fields:
    - expense.custom.*
  forms:
    - expense.create
    - expense.review
  workflows:
    - expense.pre_approval
    - expense.post_approval

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

The steps above describe Workspace Runtime installation semantics. Production installation manifests, migrations, and dependencies must come from a specific Catalog Version and its artifact checksum. Packs must use the dependency lock frozen at release time and must not re-resolve the "latest version" on every install.

Duplicate install returns success with `alreadyInstalled: true`.

## 6. Metadata-Driven Objects and Customer Variation

Modules define objects through metadata—not ad-hoc undocumented tables only.

Field ownership within a module:

```text
Core-owned fields (created_at, updated_at, id)
Module-owned fields (expense.amount, implementation_run.status)
Template defaults (labels, default views, default forms)
Extension-compatible slots (declared extension namespaces)
Customer-owned data (record values)
```

Modules must declare which entities support custom fields, relations, forms, views, workflows, rules, dashboards, and Agent Skills.

Customer differences should normally be expressed through:

* Form Definitions;
* Field Definitions;
* View Definitions;
* Workflow Definitions;
* validation and visibility rules;
* terminology and labels;
* approval policies;
* notification templates;
* governed Workspace Extensions.

A form or field difference is not a reason to fork or duplicate a Module.

## 7. Provider Adapter Boundary

External systems must remain behind provider-neutral capability contracts.

Examples include Twilio telephony, Retell Voice Agent, Stripe payment, accounting, calendar, email, storage, and future providers.

Provider adapters:

* translate provider APIs into Runory semantic capabilities;
* declare versions, readiness, supported environments, and compensation behavior;
* use the Secret boundary for credentials;
* expose provider-neutral results to Modules and Commands;
* must not place raw provider payloads or credentials into canonical domain objects.

A Module may require a semantic capability through a Pack or optional dependency. It must not hard-code one provider unless the Module's domain is explicitly that provider product.

## 8. Extension Contract

Official Modules must explicitly declare extensibility:

* entities allowing custom fields and relations;
* views exposing UI Extension Slots;
* forms allowing Template or Extension composition;
* workflows allowing Extension rules or steps;
* metrics and dashboards allowing widgets;
* tools accepting extension field namespaces;
* reserved field keys and namespaces;
* compatible extension manifest versions.

If a capability is not declared extensible, Workspace Extensions cannot modify it.

Extensions may add customer-specific differences, but must not replace or contradict a shared domain invariant that belongs in the Official Module.

## 9. Upgrade Contract

Module upgrades must preserve compatible Workspace Templates and Workspace Extensions.

Each upgrade declares:

* added, changed, deprecated, removed objects and fields;
* changed UI and Form Extension Slots;
* field namespace changes;
* migration requirements;
* Template and Extension reapply strategy;
* provider-capability compatibility;
* known incompatibilities.

If upgrade may break active Templates or Extensions, Core blocks automatic upgrade and requires user confirmation with compatibility report.

Before upgrade, a structured Compatibility Report must be generated. It must cover at least Core, dependencies, permissions, schema, Packs, Templates, Workspace Extensions, provider capabilities, and migration risk. Rollout pause only stops new targets; it must not pretend that already-executed database migrations can be generically and automatically rolled back.

## 10. Prohibited Module Behavior

Official Modules must not:

* store user customization inside module source;
* fork the Module because one customer's forms or fields differ;
* encode customer-specific terminology in canonical object or Command keys;
* embed one provider's API model in canonical domain objects;
* make an optional provider or product capability a hard dependency for all installations;
* mutate Workspace Extension definitions outside Core extension APIs;
* allow a Pack or Template to redefine Module invariants;
* bypass Business Engine or audit logging;
* dynamically load arbitrary user-generated React code;
* silently remove Extension Slots used by active workspaces;
* assume Local-only or Cloud-only storage when adapters are required.

## 11. Marketplace Readiness

Even before Marketplace launch, every module manifest must support:

```text
id / version / coreCompatibility / dependencies
permissions / data ownership declarations
migration and uninstall policies
upgrade and breaking change policies
security and marketplace metadata hooks
Template / Extension compatibility
provider capability requirements
```

Third-party modules follow the same manifest contract as official modules.

Marketplace readiness does not mean building the third-party Marketplace now. The current priority is Official/Internal Catalog & Release Control Plane: immutable artifacts, validation, Internal/Beta/Stable release, Sandbox, Workspace upgrade, and rollout governance.
