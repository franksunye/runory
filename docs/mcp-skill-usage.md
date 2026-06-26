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

The MCP server registers 17 tools. The core Extension flow mirrors the Agent API routes:

| Tool | What it does |
| --- | --- |
| `runory.workspace.list` | List workspaces accessible to the authenticated user |
| `runory.workspace.create` | Create a workspace (optionally from a template) |
| `runory.workspace.status` | Get workspace status: installed modules, extensions, objects |
| `runory.workspace.inspect_schema` | Get full schema (objects, fields, views) — call before generating a plan |
| `runory.extension.plan` | Submit an Extension Plan for validation |
| `runory.extension.preview` | Preview the diff of a plan |
| `runory.extension.apply` | Apply a validated plan (creates fields, updates views, writes audit + rollback point) |
| `runory.extension.rollback` | Roll back the latest version of an extension |
| `runory.extension.list` | List all extensions and their current versions |
| `runory.catalog.search` | Search the catalog for modules, packs, or templates |
| `runory.module.install` | Install a pack by pack ID |
| `runory.record.create` / `list` / `get` / `update` / `delete` | CRUD on workspace records |
| `runory.audit.list` | List audit events with optional pagination and action filter |

## How plan / preview / apply / rollback works

The flow is identical to the in-product Customize page — MCP tools wrap the same `/agent/*` API routes.

```text
1. runory.workspace.inspect_schema   → understand current schema
2. runory.extension.plan             → validate the proposed plan ({ valid, errors })
3. runory.extension.preview          → review the diff and risk level
4. runory.extension.apply            → apply (writes audit + rollback point)
5. runory.extension.list             → confirm the new extension version
6. runory.audit.list                 → inspect the audit event
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
      "ui": { "listColumn": true, "slot": "main", "order": 10 }
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

`runory.extension.apply` also requires a `createdBy` string (e.g. `"codex"`, `"trae"`, `"user@example.com"`). `runory.extension.rollback` requires `extensionId` and `rolledBy`.

## How to run safe customization

1. **Inspect first.** Call `runory.workspace.inspect_schema` so the Agent knows the current objects, fields, and views before proposing anything.
2. **Plan before preview.** Submit the plan to `runory.extension.plan` and confirm `valid: true`. Fix any `errors` before continuing.
3. **Preview before apply.** Call `runory.extension.preview` and review the diff and risk level. High-risk changes require explicit human confirmation.
4. **Apply with an identity.** Pass a meaningful `createdBy` so audit attributes the change correctly.
5. **Verify.** Call `runory.extension.list` and `runory.audit.list` to confirm the new version and the audit event.
6. **Roll back if needed.** Call `runory.extension.rollback` with the `extensionId` to revert.

## How to inspect operation results

- **Schema result:** `runory.workspace.inspect_schema` shows the new fields and modified views.
- **Extension versions:** `runory.extension.list` shows each extension and its current version.
- **Audit trail:** `runory.audit.list` (filter by `action: extension.apply`) shows who applied what, when, and the rollback point.
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

- The MCP interface is **preview** during `v0.4`. The **stable MCP interface ships in `v0.4.4`**.
- Tool names and shapes may evolve before the stable release. Pin to a version if you automate against it.
- The MCP server authenticates with a workspace API key (`RUNORY_API_KEY`). Without a key, it only works in local dev.
- The full operation family set (e.g. `workflow.inspect`, `automation.inspect` as dedicated tools) is still being completed; the core Extension and record flows are available now.

See [Release Notes](./release-notes.md) for the version roadmap.
