# Runory Extension Manifest Spec

Status: Draft v0.2  
Date: 2026-06-18  
Change: Cloud-first pivot — see [../04-architecture-pivot-cloud-first.md](../04-architecture-pivot-cloud-first.md)

## 1. Purpose

An Extension Manifest is the canonical declaration of a **Managed Workspace Extension** version.

It is generated through Agent Operation APIs or controlled Runory tools, validated by Platform Core, stored in `extension_versions.manifest_json`, composed with Official Module manifests at runtime, and included in Workspace Export packages.

## 2. Manifest Shape

Draft shape:

```json
{
  "schemaVersion": "0.2",
  "extensionId": "ext_customer_tier",
  "workspaceId": "ws_acme_001",
  "tenantId": "ten_acme",
  "namespace": "workspace.ws_acme_001.customer_tier",
  "name": "Customer Tier",
  "description": "Add customer tier field and list column.",
  "targetModules": [
    {
      "moduleId": "runory.customer",
      "versionRange": ">=1.0.0 <2.0.0"
    }
  ],
  "riskLevel": "low",
  "fieldOwnership": "workspace_extension",
  "customFields": [],
  "customObjects": [],
  "customRelations": [],
  "customViews": [],
  "customForms": [],
  "customWorkflows": [],
  "customMetrics": [],
  "customRules": [],
  "customAutomations": [],
  "customActions": [],
  "customSkills": [],
  "createdBy": "agent:builtin",
  "changeSummary": "Add tier field to Customer"
}
```

## 3. Required Fields

* `schemaVersion`: manifest schema version.
* `extensionId`: stable extension ID.
* `workspaceId`: workspace binding.
* `tenantId`: tenant binding (Cloud multi-tenant).
* `namespace`: stable namespace for generated keys.
* `name`: human-readable name.
* `targetModules`: official modules extended by this manifest.
* `riskLevel`: highest risk level across all manifest changes.
* `fieldOwnership`: default ownership for new fields (`workspace_extension`).

## 4. Risk Levels

Allowed values:

```text
low / medium / high
```

Risk is computed by Platform Core and **cannot** be downgraded by Agent or MCP client.

## 5. Custom Field Entry

Draft shape:

```json
{
  "id": "workspace.ws_acme_001.customer_tier.field.tier",
  "targetModuleId": "runory.customer",
  "targetObject": "customer",
  "fieldKey": "tier",
  "label": "Customer Tier",
  "type": "select",
  "ownership": "workspace_extension",
  "required": false,
  "defaultValue": null,
  "validation": {
    "options": ["A", "B", "C"]
  },
  "ui": {
    "slot": "customer.form.basic_fields.after",
    "listColumn": true,
    "order": 100
  }
}
```

Field `ownership` must be `workspace_extension` for Extension-created fields. Agent-computed fields require explicit `ownership: "agent_computed"` and computation metadata.

## 6. Custom Workflow Entry (POC)

Draft shape:

```json
{
  "id": "workspace.ws_acme_001.approval_high_value.workflow.quotation_approval",
  "targetModuleId": "runory.approval",
  "targetObject": "quotation",
  "workflowKey": "high_value_quotation_approval",
  "trigger": "quotation.before_commit",
  "condition": {
    "field": "amount",
    "operator": "gt",
    "value": 100000
  },
  "action": {
    "type": "require_approval",
    "role": "manager"
  },
  "riskLevel": "medium"
}
```

## 7. Validation Requirements

Platform Core must validate:

* manifest JSON shape;
* tenant and workspace ownership;
* target module existence and version compatibility;
* target object existence;
* target UI Extension Slot existence;
* field key uniqueness within namespace;
* field type support and ownership rules;
* workflow trigger and action availability;
* permission scope for applying actor;
* risk level;
* no modification of module-owned or core-owned reserved fields.

## 8. Application Rules

Only validated manifests can be applied via Agent Operation API.

Applying a manifest must:

* run permission check;
* produce Diff Preview (stored in `diff_json`);
* create Rollback Point;
* create new `extension_versions` record;
* update effective extension definitions;
* write audit logs and `agent_runs` record;
* publish business events;
* trigger Effective Runtime Model recomposition;
* notify UI through SSE or query invalidation.

Rollback restores prior `extension_versions` manifest and recomputes Effective Runtime Model.

## 9. Export Rules

Extension manifests must serialize into Workspace Export packages for Cloud → Private / Local portability. Export includes all active extension versions and rollback metadata references.

## 10. Prohibited Manifest Content

Extension manifests must not contain:

* raw SQL;
* executable JavaScript or TypeScript;
* React component source code;
* arbitrary shell commands;
* unscoped network calls;
* direct file system mutation instructions;
* permissions broader than target module allows;
* instructions to modify official module source or Core internals.
