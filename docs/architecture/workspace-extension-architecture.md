# Runory Managed Workspace Extension Architecture Specification

Status: Draft v0.2  
Date: 2026-06-18  
Change: Cloud-first pivot — see [../04-architecture-pivot-cloud-first.md](../04-architecture-pivot-cloud-first.md)

## 1. Definition

**Managed Workspace Extension** is a declarative extension layer bound to a specific Cloud Workspace (or Private / Local Workspace), used to add user-specific capabilities without modifying official Module source.

It is neither an Official Module nor a one-off Agent code change. It is a runtime business configuration layer that Platform Core can validate, version, merge, audit, diff, apply, and roll back.

Core principle:

> Official Modules provide standard capabilities; Managed Workspace Extensions express user-specific differences.

```text
Effective App
=
Official Module
+
Workspace Template Overlays
+
Managed Workspace Extension
```

## 2. Design Principles

* Official Modules are read-only;
* Managed Workspace Extensions are writable (through governed APIs);
* all changes are auditable, versionable, diffable, and rollbackable;
* extensions must pass Schema validation;
* extensions cannot bypass Business Engine;
* official Module upgrades cannot overwrite user extensions;
* **Built-in Agent** (default) and **MCP / SDK** (advanced) use the same Agent Operation API and permission model;
* Agent generates Extension Plans, and Platform Core is the only Apply boundary;
* Cloud-first does not mean Cloud-only: Extension definitions must be exportable to Private / Local Runtime.

## 3. Extension Types

Runory supports the following extension types:

```text
Custom Fields
Custom Objects
Custom Relations
Custom Views
Custom Forms
Custom Workflows
Custom Rules
Custom Dashboards / Metrics
Custom Automations
Custom Actions
Custom Agent Skills
Custom UI Slots (within Module-declared boundaries)
Custom Reports
Custom Notifications
```

### Custom Fields

Add workspace-specific fields to official Objects. Example: add "Customer Tier" to Customer.

Correct Agent path:

```text
Create Workspace Extension:
- add field: customer.tier
- update list view column
- update form section
- update permission if needed
- record audit log
```

Agent **must not** modify the `runory.customer` Module source.

### Custom Workflows

Add workspace-specific workflows. Example: quotes over 100,000 require manager approval.

```text
Identify Quotation Object
→ Create Approval Workflow Extension
→ Add Rule
→ Configure Role
→ Generate test sample
→ Diff Preview → User confirms → Apply
```

## 4. Field Ownership

Field ownership must be explicit:

```text
Core-owned Field       → e.g. created_at (Agent cannot delete or modify the definition)
Module-owned Field     → e.g. Customer.name (Extension cannot override)
Workspace Extension    → e.g. Customer.vip_level (under Extension namespace)
Agent-computed Field   → e.g. Customer.ai_score (Computed; source and refresh policy required)
User-created Field     → created through Extension and managed by Extension lifecycle
```

Ownership affects whether a field is deletable, upgradable, migratable, Agent-mutable, and exposed in standard APIs.

## 5. Data Model

The Cloud version stores Extension state in Turso/libSQL. Portable Runtime uses the same libSQL schema (local SQLite `file:` URL).

### Platform tables (Cloud)

```text
extension_definitions
extension_versions
custom_field_definitions
custom_field_values
custom_view_definitions
custom_form_definitions
custom_workflow_definitions
custom_rule_definitions
extension_audit_logs
agent_runs (Agent apply records)
rollback_points
```

### `extension_definitions`

```text
id / workspace_id / tenant_id
name / description / namespace
target_module_ids
status / current_version
created_at / updated_at / created_by
```

### `extension_versions`

```text
id / extension_id / version
manifest_json
risk_level / change_summary / diff_json
created_at / created_by / approved_by
applied_at / rollback_of_version
```

The full field definitions are specified in the POC implementation phase database design. The Cloud POC must implement at least `extension_definitions`, `extension_versions`, `extension_audit_logs`, and rollback references.

## 6. Runtime Composition

Platform Core merges official Modules, Templates, and Workspace Extensions at runtime:

```text
Official Module Manifest
+ Workspace Template Overlays
+ Managed Workspace Extension Manifest
=
Effective Runtime Model
```

Effective Runtime Model includes:

```text
effective objects / fields / relations
effective rules / workflows / actions
effective views / forms / navigation
effective metrics / permissions
effective event subscriptions / agent skills
```

The merge must be deterministic. The same Core version, Module version, Template version, and Extension version set should produce the same Effective Runtime Model.

## 7. Agent Workflow (shared by Built-in Agent and MCP)

Managed Workspace Extension is assisted by the Agent and executed by Platform Core.

```text
User proposes change
→ Agent parses need
→ Query current Schema and Extension Points
→ Generate Extension Plan
→ Diff Preview
→ Permission Check
→ User confirms (medium/high risk)
→ Agent Operation API Apply
→ Business Engine validates and writes
→ Create Rollback Point
→ Audit Log
→ Event publish
→ UI updates
```

Agent can:

* explain feasible options;
* recommend Pack or Extension paths;
* query Module, Object, Field, View, Workflow;
* generate Extension Plans and Workflow Plans;
* call preview, validate, apply, and rollback APIs.

Agent cannot:

* directly modify the database;
* directly modify official Module source;
* directly write production React code;
* bypass Agent Operation API permissions;
* skip Diff or user confirmation (medium/high risk);
* modify Core, Billing, cross-tenant Runtime, or Module Dependency Resolver.

## 8. Agent Operation API

Extension management is exposed through governed APIs (mirrored by Built-in Agent and MCP):

```text
runory.schema.inspect
runory.extension.plan
runory.extension.validate
runory.extension.preview      # returns diff
runory.extension.apply
runory.extension.rollback
runory.extension.list_versions
runory.extension.audit
runory.workflow.plan
runory.workflow.preview
runory.workflow.apply
```

All `apply` and `rollback` operations must: write audit log, create rollback point, publish business event, and trigger Effective Runtime Model recomposition.

Apply flow:

```text
Permission Check → Diff → Approval (if needed) → Apply → Validate → Audit
```

## 9. Risk Levels

### Low Risk

Can be auto-applied (still audited): non-required fields, column display, read-only widgets, saved filter views.

### Medium Risk

Requires Diff Preview + user confirmation: required fields, relations, business rules, automation, workflow steps, form validation changes.

### High Risk

Requires impact analysis + rollback plan + explicit confirmation: deleting fields, changing field types, batch migrations, permission changes, overriding main view structure, affecting historical reporting metrics.

## 10. Upgrade and Conflict

### Namespace

```text
workspace.{workspaceId}.{extensionKey}
```

### Module Upgrade Compatibility

During Module upgrade, Core checks whether Extension Slots exist, target objects exist, field types are compatible, Workflow references are valid, and Agent Skill parameters are compatible.

On conflict: block silent overwrite, generate a report, and provide rename, map, preserve, or cancel-upgrade options.

### Extension Reapply

After Module upgrade, Core recomputes Effective Runtime Model and reapplies compatible Extensions.

### Rollback

Create a Rollback Point before every Apply. Rollback restores the extension manifest and related field/view/workflow definitions. Whether historical business data is rolled back is confirmed separately according to risk level.

## 11. UI Merge Rules

Module declares extensible positions through **UI Slots**:

```text
customer.form.basic_fields.after
customer.list.columns
customer.detail.sidebar
dashboard.crm.widgets
```

Workspace Template determines navigation, homepage, and role entry; Extension adds content inside Slots.

By default, Workspace Extensions can only extend views and cannot fully override official views. Full View Override is High Risk and requires explicit permission from the Module.

## 12. Security Boundaries

Explicitly forbidden:

* directly modifying official Module files;
* directly modifying database Schema (bypassing metadata runtime);
* directly writing React code;
* bypassing Tool / API permissions;
* bypassing Audit;
* overriding official MCP Tool or Agent Operation API;
* high-risk Automation without audit;
* injecting UI where no Extension Point is declared;
* cross-tenant access or modification.

## 13. Cloud Export

Workspace Extension must be included in Workspace Export to support the Cloud → Private / Local path. See [cloud-to-local-workspace.md](cloud-to-local-workspace.md).
