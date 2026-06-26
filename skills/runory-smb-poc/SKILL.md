---
name: runory-smb-poc
description: Use when operating Runory Cloud through MCP tools. Runory is a headless business platform — Personal Agents (Codex/Trae/Cursor/Claude Code) read this skill, inspect the workspace, generate Extension Plans, and call Runory MCP tools. Runory does NOT call LLM APIs. Stable as of v0.4.4 — 21 operation-family tools.
---

# Runory Cloud Skill (v0.4.4 stable)

## Purpose

Operate Runory Cloud through standard MCP tools. Runory is a **headless business platform** with metadata-driven objects, governed extensions, and audit/rollback.

**Architecture**: Personal Agent reads this Skill → inspects workspace → generates Extension Plan → calls Runory MCP tools → Runory validates and executes.

**Runory does NOT**: hold LLM keys, call LLM APIs, generate plans, or do prompt engineering.

## Operating contract

```text
discover → plan → validate → preview → apply → verify → audit → rollback
```

Every governed change (adding a field, modifying a view) flows through the `extension.plan → extension.preview → extension.apply` pipeline. There are no single-shot mutation tools — every change must be previewable and auditable before it is committed.

## Operating principles

1. Use the **operation-family tool names** (e.g., `workspace.inspect`, not `runory.workspace.status`).
2. Never write to the database directly — all writes go through MCP tools.
3. Always inspect schema (`workspace.inspect` or `object.inspect`) before generating an Extension Plan.
4. Always validate (`extension.plan`) before preview, and preview (`extension.preview`) before apply.
5. Official Module fields are read-only — only `workspace_extension` fields can be added.
6. Respect `reservedKeys` and `allowedTypes` from module extension points.
7. Pass a meaningful `createdBy` (e.g., `"codex"`, `"trae"`, `"user@example.com"`) on every apply so audit attributes the change correctly.
8. Report audit log entries after apply/rollback operations.

## Available MCP tools (21 tools, v0.4.4 stable)

### Workspace operations

#### `workspace.list`
List all workspaces accessible to the authenticated principal.

**Input**: `{}`

#### `workspace.create`
Create a new workspace. An organization and first workspace are auto-provisioned.

**Input**: `{ name: string, templateId?: string, organizationId?: string }`

#### `workspace.inspect`
Unified discovery: workspace metadata, installed packs, extensions, and the full object schema (objects, fields, views). **Call this before proposing any governed change.**

**Input**: `{ workspaceId?: string }` (uses `RUNORY_WORKSPACE_ID` if omitted)

**Output**: `{ workspace, installedPacks, extensions, objects: [{ objectKey, label, moduleId, fields, views }] }`

### Pack operations

#### `pack.list`
List all available packs with installation status, demo-data status, and update availability.

**Input**: `{ workspaceId?: string }`

#### `pack.install`
Install a pack by pack ID, optionally loading demo data in the same call.

**Input**: `{ workspaceId?: string, packId: string, includeDemoData?: boolean }`

**Output**: Installed modules, created objects, and demo record count.

### Object / View inspection

#### `object.inspect`
Inspect a single business object: definition, fields, views, and relations.

**Input**: `{ workspaceId?: string, objectKey: string }`

**Output**: `{ object, views, relations }`

#### `view.inspect`
Inspect the views defined for an object, including columns, filters, sections, and extension points. **Call this before proposing a view.modify change.**

**Input**: `{ workspaceId?: string, objectKey: string }`

### Governed extension pipeline

`object.field.add` and `view.modify` are accomplished through this pipeline.

#### `extension.plan`
Validate an Extension Plan against module extension points without applying it.

**Input**: `{ workspaceId?: string, plan: string }` (plan is a JSON string)

**Extension Plan schema**:
```json
{
  "name": "Customer Tier",
  "description": "Add customer tier field",
  "targetModules": ["runory.customer"],
  "riskLevel": "low",
  "customFields": [
    {
      "targetObject": "customer",
      "fieldKey": "tier",
      "label": "Tier",
      "type": "select",
      "ownership": "workspace_extension",
      "required": false,
      "validation": { "options": ["A", "B", "C"] },
      "ui": { "listColumn": true, "slot": "company.default_list", "order": 100 }
    }
  ],
  "viewModifications": [
    {
      "targetObject": "customer",
      "viewKey": "default_list",
      "modifications": {
        "reorderColumns": ["name", "tier"],
        "addFilters": [{ "field": "tier", "operator": "eq", "value": "enterprise" }],
        "addSection": { "title": "Segmentation", "fields": [{ "field": "tier" }] },
        "pageSize": 50
      }
    }
  ]
}
```

**Output**: `{ valid: boolean, errors: string[] }`

#### `extension.preview`
Preview the diff of an Extension Plan before applying.

**Input**: `{ workspaceId?: string, plan: string }`

**Output**: `{ addedFields: [...], affectedViews: [...], viewModifications: [...], riskLevel: string }`

#### `extension.apply`
Apply a validated Extension Plan. Creates field definitions, updates views, creates an extension version (rollback point), and writes an audit event.

**Input**: `{ workspaceId?: string, plan: string, createdBy: string }`

**Output**: Applied extension version with ID and version number.

#### `extension.rollback`
Roll back the latest version of an extension.

**Input**: `{ workspaceId?: string, extensionId: string, rolledBy: string }`

**Output**: Rollback result with new version number.

#### `extension.list`
List all extensions in a workspace with their current versions.

**Input**: `{ workspaceId?: string }`

### Workflow / Automation inspection

#### `workflow.inspect`
List state-machine workflows (states and transitions), or fetch a single workflow by ID.

**Input**: `{ workspaceId?: string, workflowId?: string }`

#### `automation.inspect`
List event-triggered automations, or fetch a single automation by ID.

**Input**: `{ workspaceId?: string, automationId?: string }`

### Operation history / Audit

#### `agent_operation.history`
List the history of governed agent operations (extension applies and rollbacks) in a workspace.

**Input**: `{ workspaceId?: string, limit?: number }`

**Output**: `{ extensions, extensionAuditEvents }`

#### `audit.search`
Search the workspace audit trail by action, actor, entity type, and pagination.

**Input**: `{ workspaceId?: string, action?: string, actorId?: string, entityType?: string, limit?: number, offset?: number }`

### Record CRUD

#### `record.create`
Create a record in a workspace object.

**Input**: `{ workspaceId?: string, objectKey: string, data: string }` (data is a JSON string)

#### `record.list`
List records with optional pagination and search.

**Input**: `{ workspaceId?: string, objectKey: string, limit?: number, offset?: number, search?: string }`

#### `record.get`
Get a single record by ID.

**Input**: `{ workspaceId?: string, objectKey: string, recordId: string }`

#### `record.update`
Update a record by ID.

**Input**: `{ workspaceId?: string, objectKey: string, recordId: string, data: string }` (data is a JSON string)

#### `record.delete`
Delete a record by ID.

**Input**: `{ workspaceId?: string, objectKey: string, recordId: string }`

## Standard workflow: add a custom field

When the user asks to add a custom field (e.g., "add a customer tier field"):

1. Call `workspace.inspect` to get the current schema.
2. Call `object.inspect` for the target object to see fields and extension points.
3. Generate an Extension Plan JSON based on user intent and schema constraints.
4. Call `extension.plan` to validate the plan.
5. If `valid: false`, fix errors and retry.
6. Call `extension.preview` to show the user what will change.
7. Call `extension.apply` with `createdBy` set to your agent identifier.
8. Call `agent_operation.history` to verify the operation was recorded.
9. Report the applied extension ID and version.

## Standard workflow: modify a view

When the user asks to change a view (e.g., "add a filter for enterprise customers"):

1. Call `view.inspect` for the target object to see current view columns and extension points.
2. Generate an Extension Plan with `viewModifications`.
3. Call `extension.plan` to validate.
4. Call `extension.preview` to show the before/after diff.
5. Call `extension.apply` with `createdBy`.
6. Call `audit.search` with `action: "extension.apply"` to verify the audit event.

## Standard workflow: rollback

When the user asks to undo an extension:

1. Call `extension.list` to find the extension ID.
2. Call `extension.rollback` with the extension ID and `rolledBy`.
3. Call `agent_operation.history` to verify the rollback was recorded.
4. Tell the user the field/view has been reverted.

## MCP server configuration

```json
{
  "mcpServers": {
    "runory": {
      "command": "pnpm",
      "args": ["--filter", "@runory/mcp", "start"],
      "cwd": "/path/to/runory",
      "env": {
        "RUNORY_API_BASE": "http://localhost:3000",
        "RUNORY_API_KEY": "rk_live_...",
        "RUNORY_WORKSPACE_ID": "ws_..."
      }
    }
  }
}
```

For local development, omit `RUNORY_API_KEY` (dev mode sends no auth header) and point `RUNORY_API_BASE` at `http://localhost:3000`. Ensure the Next.js dev server is running (`pnpm --filter @runory/cloud dev`) before starting the MCP server.

## Safety model

| Risk | Examples | Behavior |
| --- | --- | --- |
| Low | query, non-required custom field, display settings | Apply proceeds; audit recorded |
| Medium | required field, workflow, module install, automation | Apply proceeds; audit + rollback point |
| High | delete, permission change, batch migration, field type change | Requires explicit confirmation; full audit + rollback point |

Every apply records: who, through which entry, which API, what changed, before/after, confirmation status, and the rollback point.
