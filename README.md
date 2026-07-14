# Runory

> **Tell it. Run it.**

Runory is a **Cloud-first, Agent-native SMB business platform** — a composable business runtime where teams install governed business Packs, adapt the model through a previewed-and-audited Agent, and operate a stable Cloud workspace without a long implementation project.

Runory Cloud is **free during public preview** (v0.4). There is no Stripe, no billing, and no hidden paid tier today.

## What is in this repository

| Area | Path | Description |
| --- | --- | --- |
| Cloud app | `apps/cloud` | Next.js 15 App Router web app — the default entry to Runory |
| CLI | `apps/cli` | Runory CLI for local and scripted operations |
| MCP server | `apps/mcp` | MCP stdio adapter exposing Runory operations to agents |
| Platform core | `packages/platform-core` | Metadata runtime, packs, extensions, audit, catalog, releases |
| Contracts | `packages/contracts` | Shared types, constants, and zod schemas |
| SDK | `packages/sdk` | Module SDK for building, validating, and publishing packs |
| SDK testing | `packages/sdk-testing` | Test harness for SDK and module development |
| Catalog | `catalog/` | Module, Pack, and Template manifests + demo data |

## Business Packs

Runory ships business capabilities as **Packs** — declarative, versioned delivery units that bundle objects, fields, views, navigation, permissions, and dashboard widgets.

| Pack | Category | Status |
| --- | --- | --- |
| CRM Lite Pack | CRM | Available (recommended) |
| Field Service Management Pack | Field Service | Available (recommended) |
| After-sales Service Pack | After Sales | Available |
| Customer Service Pack | Customer Service | Available |
| Marketing Capture Pack | Marketing | Available |
| Sales Quote Pack | Sales | Available |
| AI Visibility / GEO Seed Pack | AI Visibility | Exploratory |

See [catalog/packs/](catalog/packs/) for manifests and demo data, or visit the public [Packs page](https://runory.dev/packs) for the product-facing overview.

## Documentation

Start with the governed [Documentation Index](docs/README.md). It identifies each topic's authoritative source, current specifications, supporting material, historical plans, and release evidence. Public documentation is also surfaced on the [Docs page](https://runory.dev/docs).

| Document | Description |
| --- | --- |
| [docs/README.md](docs/README.md) | Documentation governance, topic index, lifecycle, and authority matrix |
| [docs/getting-started.md](docs/getting-started.md) | Getting Started — the canonical journey |
| [docs/concepts.md](docs/concepts.md) | Concepts — SaaS Core, Module, Pack, Template, Extension, Agent Operation, Catalog |
| [docs/workspace-guide.md](docs/workspace-guide.md) | Workspace Guide — operating the workspace day to day |
| [docs/packs-and-modules.md](docs/packs-and-modules.md) | Packs and Modules — install, demo data, catalog |
| [docs/agent-operations.md](docs/agent-operations.md) | Agent Operations — plan / preview / apply / rollback |
| [docs/mcp-skill-usage.md](docs/mcp-skill-usage.md) | MCP / Skill Usage |
| [docs/sdk-module-development.md](docs/sdk-module-development.md) | SDK / Module Development |
| [docs/admin-governance.md](docs/admin-governance.md) | Admin / Governance — audit, members, RBAC, export |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Troubleshooting — common issues and recovery |
| [docs/release-notes.md](docs/release-notes.md) | Release Notes and changelog |
| [docs/architecture/overview.md](docs/architecture/overview.md) | Architecture overview |
| [docs/product/product-definition.md](docs/product/product-definition.md) | Product definition |
| [docs/product/v0.4-public-free-launch-plan.md](docs/product/v0.4-public-free-launch-plan.md) | v0.4 public free launch plan |

## Local development

Requirements: Node.js 20+, pnpm 9+.

```bash
pnpm install
pnpm dev
```

Runory Cloud runs at `http://localhost:3000`.

Set `PLATFORM_DEV_BOOTSTRAP=true` in `.env.local` to auto-authenticate as a local dev owner without email OTP. See [docs/getting-started.md](docs/getting-started.md) for the full dev onboarding flow.

### Dev database

The Cloud app uses SQLite (libsql). Migrations apply lazily on first DB access. If migration drift occurs:

```bash
pnpm --filter @runory/cloud db:status   # inspect current migration state
pnpm --filter @runory/cloud db:reset    # reset dev DB and re-run all migrations
pnpm --filter @runory/cloud bootstrap:demo  # seed catalog and create a demo workspace
```

### MCP server

```bash
pnpm mcp             # MCP stdio adapter
```

See [docs/mcp-skill-usage.md](docs/mcp-skill-usage.md) for configuration and operation details.

## Quality gates

```bash
pnpm typecheck       # TypeScript typecheck across all workspaces
pnpm -r test         # Run all test suites
pnpm --filter @runory/cloud build   # Production build
```

## License status

The source repository is public. A formal open-source license file has not yet been committed. Until the license is finalized, the code should be treated as public source, not as a licensed open-source release. See [docs/product/v0.4-public-free-launch-plan.md](docs/product/v0.4-public-free-launch-plan.md) for the current launch posture.

## Project direction

Runory develops its core code, architecture decisions, and product evolution in public. Cloud provides a managed experience while the open runtime preserves long-term deployment and data choices.

- **Default entry**: Runory Cloud → create Workspace → install Pack → adapt with Agent
- **Advanced entry**: CLI / MCP / SDK, Private Cloud, Local Portable Runtime

See [docs/product/v0.4-public-free-launch-plan.md](docs/product/v0.4-public-free-launch-plan.md) for the current iteration plan and [docs/release-notes.md](docs/release-notes.md) for version history.
