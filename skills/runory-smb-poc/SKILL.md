---
name: runory-smb-poc
description: Use when operating the Runory Portable Runtime prototype (local dev) through MCP tools, or when Cloud POC Agent/MCP tools are unavailable. Product default is Runory Cloud + Built-in Agent; see docs/0004-architecture-pivot-cloud-first.md. Runory uses trusted prebuilt capabilities and Managed Workspace Extensions, not runtime-generated production software.
---

# Runory SMB POC

> **Note (2026-06-18):** Runory product direction is **Cloud-first**. This skill covers the **Portable Runtime prototype** in `apps/runtime` for local dev. Cloud POC flows (Workspace → Pack install → Agent Extension) are defined in `docs/0001-poc-execution-plan.md`.

## Purpose

Use Runory Portable Runtime as a local development sandbox. The V1 prototype proves the data-change loop:

```text
semi-structured expense text
-> runory.expense.create
-> Business Engine
-> SQLite
-> Business Event/SSE
-> Dashboard and Expense Intake UI update
```

## Operating Principles

- Use `runory.*` names only.
- Prefer MCP tools over raw HTTP or CLI when an MCP client is available.
- Never write SQLite directly.
- Treat Runory modules as trusted prebuilt capabilities. Do not generate production React code, migrations, or arbitrary modules at runtime.
- V1 accepts only high-confidence committed expenses. Low-confidence review flows belong to V2.
- Real image OCR is out of scope for V1; use semi-structured text that simulates extracted receipt data.

## Available V1 Tools

### `runory.workspace.status`

Use first to check local workspace state.

Expected result:

```json
{
  "success": true,
  "data": {
    "running": true,
    "port": 4310,
    "workspaceInitialized": true,
    "installedModules": ["expense-core"]
  }
}
```

### `runory.expense.create`

Create a committed expense from semi-structured text.

Input shape:

```json
{
  "text": "Vendor: Restaurant Depot\nDate: 2026-06-16\nAmount: 286.40\nCurrency: USD\nCategory: ingredients\nDescription: 食材采购\nConfidence: 0.95"
}
```

Required fields:

- `Vendor`
- `Date` in `YYYY-MM-DD`
- `Amount` greater than 0
- `Currency`
- `Category`
- `Description`
- `Confidence` >= `0.85`

## User-Facing Workflow

When the user asks to record expenses:

1. Convert the user's provided receipt-like information into semi-structured text.
2. Call `runory.expense.create`.
3. Report the created vendor, date, amount, and category.
4. Tell the user the Dashboard and Expense Intake UI should update automatically.

If confidence is below `0.85`, do not call the V1 create tool. Ask the user for confirmation or say that this requires the V2 review flow.

## Local Development Commands

When MCP is not available, use the local commands only as a fallback:

```bash
pnpm dev
pnpm runory status
pnpm runory expense:create --text "Vendor: Restaurant Depot
Date: 2026-06-16
Amount: 286.40
Currency: USD
Category: ingredients
Description: 食材采购
Confidence: 0.95"
```

MCP server command for local clients:

```bash
pnpm --filter @runory/runtime runory mcp
```

The MCP server expects the Runory runtime API to be running at `http://127.0.0.1:4310`. This keeps MCP writes inside the runtime process so Business Events can update the web UI live.

## Verification

After creating an expense, verify at least one of:

- `GET /api/dashboard` shows updated `monthExpenseTotal` and `monthExpenseCount`.
- `GET /api/expenses` includes the new vendor.
- Browser UI at `http://127.0.0.1:5173/dashboard` or `/expense/intake` updates without manual refresh.
