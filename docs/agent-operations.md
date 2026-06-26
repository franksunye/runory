# Agent Operations

Agent Operations are how Runory changes a workspace safely. The Built-in Agent and external Agents (via MCP/SDK) propose changes through governed APIs; Runory validates, previews, applies, audits, and can roll them back.

This page covers the operation flow, the safety model, and the exact API routes. For connecting an external Agent, see [MCP / Skill Usage](./mcp-skill-usage.md). For the in-product Customize page, see the [Workspace Guide](./workspace-guide.md).

## The operation contract

Every Agent-facing operation follows:

```text
discover → plan → validate → preview → apply → verify → audit → rollback where possible
```

1. **Discover** — the Agent inspects the workspace schema and extension points.
2. **Plan** — the Agent proposes an Extension Plan (custom fields, view modifications).
3. **Validate** — Runory validates the plan against the module's extension points.
4. **Preview** — Runory returns a diff (added fields, affected views, before/after, risk level).
5. **Apply** — on approval, Runory writes a new extension version, updates the runtime schema, and records a rollback point.
6. **Verify** — the Agent inspects the resulting schema to confirm the change.
7. **Audit** — every apply produces an append-only audit event.
8. **Rollback** — the latest extension version can be reverted, restoring prior state.

## What Agent operations can and cannot do

**Can:**

- Inspect workspace schema, objects, fields, views, and extension points.
- Propose and apply custom fields (`ownership: workspace_extension`).
- Propose and apply view modifications: reorder columns, add filters, add form sections, add actions, change page size.
- Create, read, update, and delete business records through governed APIs.
- Install packs from the catalog.
- List audit events and workspace extensions.

**Cannot:**

- Directly operate the database.
- Modify official module source code.
- Bypass the Business Engine or Platform Core.
- Override official module files.
- Generate arbitrary production React code.

These boundaries are non-negotiable. Cloud Agents and MCP/SDK Agents share the **same permission model** and the same governed APIs.

## The plan / preview / apply / rollback flow

Runory exposes four Agent API routes per workspace. All require workspace admin context and return a request ID.

### Plan — `POST /api/workspaces/[id]/agent/plan`

Validates an Extension Plan against the module's extension points. Returns `{ valid, errors }`.

```jsonc
// Request body — an Extension Plan
{
  "name": "Add customer tier field",
  "description": "Add a tier dropdown to company",
  "targetModules": ["runory.company"],
  "riskLevel": "low",
  "customFields": [
    {
      "targetObject": "company",
      "fieldKey": "tier",
      "label": "Tier",
      "type": "select",
      "ownership": "workspace_extension",
      "required": false,
      "ui": { "listColumn": true, "slot": "main", "order": 10 }
    }
  ],
  "viewModifications": [
    {
      "targetObject": "company",
      "viewKey": "default_list",
      "modifications": {
        "reorderColumns": ["name", "tier", "createdAt"],
        "addFilters": [{ "field": "tier", "operator": "eq", "value": "enterprise" }]
      }
    }
  ]
}
```

### Preview — `POST /api/workspaces/[id]/agent/preview`

Returns the diff of a plan before applying: added fields, affected views, view modifications with before/after state, and the risk level.

### Apply — `POST /api/workspaces/[id]/agent/apply`

Applies a validated plan. Requires `plan` and `createdBy`. Runory:

- enforces the organization's `agent_operations` quota;
- writes a new extension version;
- records an audit event (`action: extension.apply`) with actor, before/after, and rollback point.

```jsonc
// Request body
{
  "plan": { /* the Extension Plan from above */ },
  "createdBy": "user@example.com"
}
```

### Rollback — `POST /api/workspaces/[id]/agent/rollback`

Reverts the latest version of an extension. Removes extension-created fields from definitions and views, reverses view modifications, and writes an audit entry. Requires `extensionId` and `rolledBy`.

```jsonc
// Request body
{
  "extensionId": "ext_...",
  "rolledBy": "user@example.com"
}
```

## The Customize page

`/w/[workspaceId]/customize`

The in-product Customize page is the human-facing surface for the same flow:

- **Add Field wizard** — guides you through proposing a custom field.
- **Diff Preview** — shows exactly what will change before you approve.
- **Extension List** — lists installed extensions and their versions.
- **Rollback** — reverts the latest extension version.

Everything on Customize routes through the same `/agent/plan`, `/agent/preview`, `/agent/apply`, and `/agent/rollback` APIs. There is no separate privileged path for the UI.

## Governed changes and Workspace Extensions

Agent applies produce **Managed Workspace Extensions** — versioned, auditable, schema-validated definitions bound to the workspace. Extensions:

- add fields, views, workflows, rules, dashboards, and agent skills;
- never modify official module source;
- are preserved across compatible module upgrades;
- report conflicts before a breaking upgrade auto-executes.

Field ownership is explicit: `core-owned`, `module-owned`, `workspace_extension`, or `agent-computed`. Ownership affects deletability, upgrade safety, Agent mutability, and API exposure.

## Safety model

Operations are risk-classified:

| Risk | Examples | Behavior |
| --- | --- | --- |
| Low | query, non-required custom field, display settings | Apply proceeds; audit recorded |
| Medium | required field, workflow, module install, automation | Apply proceeds; audit + rollback point |
| High | delete, permission change, batch migration, field type change, payment | Requires explicit confirmation; full audit + rollback point |

Every apply records: who, through which entry, which API, what changed, before/after, confirmation status, and the rollback point. Audit never contains OTP, session, or API key secrets.

## Request IDs and errors

Every API response includes a request ID (from the `x-request-id` header, or generated server-side). Error responses are supportable — they include the request ID and a structured error, but never expose stack traces or SQL details in production. If an operation fails, capture the request ID and check [Troubleshooting](./troubleshooting.md).

## Current limitations

- The Agent operation surface is **preview** during `v0.4`. The stable MCP interface ships in `v0.4.4`.
- View modifications support a fixed, approved component set (table, form, metric, chart, review queue, timeline, detail panel, empty state, action bar). Arbitrary generated UI is not supported.
- Rollback reverts the latest extension version; multi-step rollback chains are not yet first-class.

See [Release Notes](./release-notes.md) for what is stable versus preview.
