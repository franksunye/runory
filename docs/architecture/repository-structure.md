# Runory Repository Structure

Status: Approved v1.0
Date: 2026-06-19

## Purpose

The repository mirrors Runory's product boundaries. Deployable entry points live in
`apps/`; reusable deterministic capabilities live in `packages/`; official business
content lives in `catalog/`; database bootstrap definitions live in `schema/`.

```text
apps/
  cloud/                 Next.js Cloud UI and HTTP adapters
  mcp/                   Advanced stdio MCP adapter
packages/
  contracts/             Manifest schemas and API contracts
  platform-core/         Metadata, module, extension, audit and persistence runtime
catalog/
  modules/               Official technical install units
  packs/                 Commercial module bundles
  templates/             Workspace experience definitions
schema/                   libSQL/Turso bootstrap schema and table contract
experiments/
  local-v1/              Historical Portable Runtime POC, excluded from workspaces
```

## Dependency Rules

```text
apps/cloud -> contracts + platform-core
apps/mcp   -> Runory HTTP API
platform-core -> contracts + libSQL/Turso
catalog -> contracts
experiments -> no production dependency
```

`apps/cloud` must not own business rules. API routes translate HTTP requests into
Platform Core calls. UI code consumes exported contracts and view models.

Turso is the Cloud database. Local development uses the same `@libsql/client`
interface with a `file:` URL, preserving the Portable Runtime path without a second
business implementation.

## Deployment Boundary

Vercel uses `apps/cloud` as Root Directory. Its prebuild step snapshots `schema/`
and `catalog/` into `.resources/`, following the proven deployment pattern used by
the sibling `fs-aol` project. The snapshot is build output and is never committed.
