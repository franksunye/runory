# MCP / Skill Usage

Runory can be driven by external Agents — Codex, Trae, Cursor, Claude Code, or any MCP-compatible client — through a Model Context Protocol (MCP) server and a Runory Skill. This page explains what MCP is for in Runory, what the Skill is, what Agent operations can and cannot do, and how to run safe customization end to end.

For the operation contract and API routes, see [Agent Operations](./agent-operations.md). For SDK-based module development, see [SDK / Module Development](./sdk-module-development.md).

## What MCP is for in Runory

MCP (Model Context Protocol) is the channel through which a personal Agent reads the Runory Skill and then calls Runory tools to operate a workspace. The Agent runs in your environment (your laptop, your IDE, your CI); Runory only validates and executes governed operations.

Runory does **not** call LLM APIs. The MCP server exposes tools that return structured data; the Agent decides what to propose. All operations route through the same governed APIs the Cloud UI uses — MCP and the Cloud UI share one permission model.

```text
Personal Agent (Codex / Trae / Cursor / Claude Code)
  │  reads the Runory Skill
  ▼
Runory MCP Server (stdio)  →  Runory Cloud API  →  Platform Core
```

## What the Runory Skill is

The Runory Skill is the instructions an Agent reads to understand how to operate Runory correctly: which tools to call, in what order, what a valid Extension Plan looks like, and how to keep changes safe. The Skill is loaded by the Agent; the MCP server provides the executable tools.

The Skill + MCP combination is the external operations surface. The Built-in Agent in the Cloud UI uses the same governed APIs internally.

## What Agent operations can and cannot do

**Can:**

- Inspect workspace status, schema, objects, fields, and views.
- List and search the catalog; install packs.
- Create, read, update, delete records.
- Propose, preview, apply, and roll back Workspace Extensions (custom fields and view modifications).
- List audit events and extensions.

**Cannot:**

- Directly operate the database.
- Modify official module source.
- Bypass the Business Engine or Platform Core.
- Generate arbitrary production UI code.

See [Agent Operations](./agent-operations.md) for the full safety model.

## The Runory MCP server

The MCP server lives in `apps/mcp` and uses stdio transport. It is started from the Cloud app:

```bash
pnpm --filter @runory/cloud mcp
```

### Environment

| Variable | Purpose | Default |
| --- | --- | --- |
| `RUNORY_API_BASE` | Base URL of the Runory Cloud API | `http://localhost:3000` |
| `RUNORY_API_KEY` | API key sent as `Authorization: Bearer <key>`. When unset, requests are sent without auth (dev only — production returns 401). | unset |
| `RUNORY_WORKSPACE_ID` | Optional default workspace ID used when a tool does not supply one. An explicit `workspaceId` always takes precedence. | unset |

### Available tools

The MCP server registers **21 tools** (v0.4.4 stable operation surface). The tool names follow the operation-family convention — no `runory.*` prefix. Every governed change flows through the plan / preview / apply pipeline.

#### Workspace operations

| Tool | What it does |
| --- | --- |
| `workspace.list` | List workspaces accessible to the authenticated principal |
| `workspace.create` | Create a new workspace (optionally from a template) |
| `workspace.inspect` | Unified discovery: workspace metadata, installed packs, extensions, and the full object schema (objects, fields, views). **Call this before proposing any governed change.** |

#### Pack operations

| Tool | What it does |
| --- | --- |
| `pack.list` | List all available packs with installation status, demo-data status, and update availability |
| `pack.install` | Install a pack by pack ID, optionally loading demo data in the same call |

#### Object / View inspection

| Tool | What it does |
| --- | --- |
| `object.inspect` | Inspect a single business object: definition, fields, views, and relations |
| `view.inspect` | Inspect the views defined for an object, including columns, filters, sections, and extension points |

#### Governed extension pipeline (plan / preview / apply / rollback)

`object.field.add` and `view.modify` are accomplished through this pipeline — they are not single-shot tools because every governed change must be previewable and auditable before it is committed.

| Tool | What it does |
| --- | --- |
| `extension.plan` | Validate an Extension Plan against module extension points. Returns `{ valid, errors }` |
| `extension.preview` | Preview the diff of a plan: added fields, affected views, view modifications (before/after), risk level |
| `extension.apply` | Apply a validated plan (creates field definitions, updates views, writes audit + rollback point). Requires `createdBy` |
| `extension.rollback` | Roll back the latest version of an extension. Requires `extensionId` and `rolledBy` |
| `extension.list` | List all extensions in a workspace with their current versions |

#### Workflow / Automation inspection

| Tool | What it does |
| --- | --- |
| `workflow.inspect` | List state-machine workflows (states and transitions), or fetch a single workflow by ID |
| `automation.inspect` | List event-triggered automations, or fetch a single automation by ID |

#### Operation history / Audit

| Tool | What it does |
| --- | --- |
| `agent_operation.history` | List the history of governed agent operations (extension applies and rollbacks) with actor, action, and timestamp |
| `audit.search` | Search the workspace audit trail by action, actor, entity type, and pagination |

#### Record CRUD

| Tool | What it does |
| --- | --- |
| `record.create` | Create a record in a workspace object |
| `record.list` | List records with optional pagination and search |
| `record.get` | Get a single record by ID |
| `record.update` | Update a record by ID |
| `record.delete` | Delete a record by ID |

## How plan / preview / apply / rollback works

The flow is identical to the in-product Customize page — MCP tools wrap the same `/agent/*` API routes.

```text
1. workspace.inspect          → understand current schema (objects, fields, views, extensions)
2. extension.plan             → validate the proposed plan ({ valid, errors })
3. extension.preview          → review the diff and risk level
4. extension.apply            → apply (writes audit + rollback point)
5. extension.list             → confirm the new extension version
6. agent_operation.history    → inspect the operation trail
7. audit.search               → inspect the raw audit event
```

### Extension Plan shape

The `plan` argument is a JSON string with this shape (supports both `customFields` and `viewModifications`):

```jsonc
{
  "name": "Add customer tier field",
  "description": "Tier dropdown on company",
  "targetModules": ["runory.company"],
  "riskLevel": "low",            // "low" | "medium" | "high"
  "customFields": [
    {
      "targetObject": "company",
      "fieldKey": "tier",
      "label": "Tier",
      "type": "select",          // text|email|phone|number|date|select|boolean
      "ownership": "workspace_extension",
      "required": false,
      "validation": {},
      "ui": { "listColumn": true, "slot": "company.default_list", "order": 10 }
    }
  ],
  "viewModifications": [
    {
      "targetObject": "company",
      "viewKey": "default_list",
      "modifications": {
        "reorderColumns": ["name", "tier"],
        "addFilters": [{ "field": "tier", "operator": "eq", "value": "enterprise" }],
        "addSection": { "title": "Segmentation", "fields": [{ "field": "tier" }] },
        "addAction": "export_segment",
        "pageSize": 50
      }
    }
  ]
}
```

`extension.apply` also requires a `createdBy` string (e.g. `"codex"`, `"trae"`, `"user@example.com"`). `extension.rollback` requires `extensionId` and `rolledBy`.

## How to run safe customization

1. **Inspect first.** Call `workspace.inspect` so the Agent knows the current objects, fields, and views before proposing anything.
2. **Plan before preview.** Submit the plan to `extension.plan` and confirm `valid: true`. Fix any `errors` before continuing.
3. **Preview before apply.** Call `extension.preview` and review the diff and risk level. High-risk changes require explicit human confirmation.
4. **Apply with an identity.** Pass a meaningful `createdBy` so audit attributes the change correctly.
5. **Verify.** Call `extension.list` and `agent_operation.history` to confirm the new version and the operation trail.
6. **Roll back if needed.** Call `extension.rollback` with the `extensionId` to revert.

## How to inspect operation results

- **Schema result:** `workspace.inspect` shows the new fields and modified views.
- **Extension versions:** `extension.list` shows each extension and its current version.
- **Operation trail:** `agent_operation.history` shows the structured history of agent applies and rollbacks.
- **Audit trail:** `audit.search` (filter by `action: extension.apply`) shows who applied what, when, and the rollback point.
- **In-product:** open `/w/[workspaceId]/audit` and `/w/[workspaceId]/customize` to see the same data in the UI.

## Connecting a client

A typical MCP client config points at the Runory MCP server with the Cloud API base and a workspace API key (create one at `/w/[workspaceId]/api-keys`):

```jsonc
{
  "mcpServers": {
    "runory": {
      "command": "pnpm",
      "args": ["--filter", "@runory/cloud", "mcp"],
      "env": {
        "RUNORY_API_BASE": "https://your-runory-cloud.example.com",
        "RUNORY_API_KEY": "rk_live_...",
        "RUNORY_WORKSPACE_ID": "ws_..."
      }
    }
  }
}
```

For local development, omit `RUNORY_API_KEY` (dev mode sends no auth header) and point `RUNORY_API_BASE` at `http://localhost:3000`.

## The Runory CLI

The CLI lives in `apps/cli` and is focused on module development, not workspace operation. It exposes `validate`, `test`, `build`, and `publish --channel internal`. See [SDK / Module Development](./sdk-module-development.md).

## Current limitations (honest)

- The MCP interface is **stable as of v0.4.4**. The 21-tool surface is the committed operation contract; breaking changes require a version bump.
- The MCP server authenticates with a workspace API key (`RUNORY_API_KEY`). Without a key, it only works in local dev.
- `object.field.add` and `view.modify` are accomplished through the `extension.plan → extension.preview → extension.apply` pipeline. They are not single-shot tools because every governed change must be previewable and auditable.
- Rollback reverts the latest extension version; multi-step rollback chains are not yet first-class.

See [Release Notes](./release-notes.md) for the version roadmap.
