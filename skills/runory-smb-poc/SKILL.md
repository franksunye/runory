---
name: runory-smb-poc
description: Use when operating Runory Cloud POC through MCP tools. Runory is a headless business platform — Personal Agents (Codex/Trae/Cursor/Claude Code) read this skill, generate Extension Plans, and call Runory MCP tools. Runory does NOT call LLM APIs.
---

# Runory Cloud POC Skill

## Purpose

Operate Runory Cloud POC through standard MCP tools. Runory is a **headless business platform** with metadata-driven objects, governed extensions, and audit/rollback.

**Architecture**: Personal Agent reads this Skill → generates Extension Plan → calls Runory MCP tools → Runory validates and executes.

**Runory does NOT**: hold LLM keys, call LLM APIs, generate plans, or do prompt engineering.

## Operating Principles

1. Always use `runory.*` MCP tool names.
2. Never write database directly — all writes go through Runory MCP tools.
3. Always inspect schema before generating an Extension Plan.
4. Always validate (plan) before preview, and preview before apply.
5. Official Module fields are read-only — only `workspace_extension` fields can be added.
6. Respect `reservedKeys` and `allowedTypes` from module extension points.
7. Report audit log entries after apply/rollback operations.

## Available MCP Tools

### `runory.workspace.status`
Check workspace state: installed modules, extensions, objects.

**Input**: `{ workspaceId: string }`

### `runory.workspace.inspect_schema`
Get full schema: objects, fields, views, extension points. **Call this before generating any Extension Plan.**

**Input**: `{ workspaceId: string }`

**Output**: Array of objects with their fields and views. Use this to understand:
- What objects exist (e.g., `customer`, `contact`)
- What fields are `module_owned` vs `workspace_extension`
- What view slots are available for extension
- What field types are allowed

### `runory.extension.plan`
Submit an Extension Plan for validation. Runory validates it against module extension points.

**Input**: `{ workspaceId: string, plan: string }` (plan is a JSON string)

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
      "label": "客户等级",
      "type": "select",
      "ownership": "workspace_extension",
      "required": false,
      "validation": { "options": ["A", "B", "C"] },
      "ui": {
        "listColumn": true,
        "slot": "customer.form.basic_fields.after",
        "order": 100
      }
    }
  ]
}
```

**Output**: `{ valid: boolean, errors: string[] }`

### `runory.extension.preview`
Preview the diff of an Extension Plan before applying.

**Input**: `{ workspaceId: string, plan: string }`

**Output**: `{ addedFields: [...], affectedViews: [...], riskLevel: string }`

### `runory.extension.apply`
Apply an Extension Plan. Creates field definitions, updates views, creates audit log and rollback point.

**Input**: `{ workspaceId: string, plan: string, createdBy: string }`

**Output**: Applied extension version with ID and version number.

### `runory.extension.rollback`
Rollback the latest version of an extension.

**Input**: `{ workspaceId: string, extensionId: string, rolledBy: string }`

**Output**: Rollback result with new version number.

### `runory.extension.list`
List all extensions in a workspace.

**Input**: `{ workspaceId: string }`

### `runory.record.create`
Create a record in a workspace object.

**Input**: `{ workspaceId: string, objectKey: string, data: string }` (data is a JSON string)

## Standard Workflow: Add Custom Field

When the user asks to add a custom field (e.g., "给客户增加一个客户等级字段"):

1. Call `runory.workspace.inspect_schema` to get current schema.
2. Generate an Extension Plan JSON based on user intent and schema constraints.
3. Call `runory.extension.plan` to validate the plan.
4. If `valid: false`, fix errors and retry.
5. Call `runory.extension.preview` to show the user what will change.
6. Call `runory.extension.apply` with `createdBy` set to your agent identifier.
7. Report the applied extension ID and version.
8. Tell the user the field will appear in the list and form.

## Standard Workflow: Rollback

When the user asks to undo an extension:

1. Call `runory.extension.list` to find the extension ID.
2. Call `runory.extension.rollback` with the extension ID.
3. Report the rollback result.
4. Tell the user the field has been removed.

## MCP Server Configuration

```json
{
  "mcpServers": {
    "runory": {
      "command": "pnpm",
      "args": ["--filter", "@runory/cloud", "mcp"],
      "cwd": "/path/to/runory",
      "env": {
        "RUNORY_API_BASE": "http://localhost:3000"
      }
    }
  }
}
```

The MCP server connects to the Runory Cloud API. Ensure the Next.js dev server is running (`pnpm --filter @runory/cloud dev`) before starting the MCP server.
