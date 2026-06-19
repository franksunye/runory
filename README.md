# Runory

Runory is a **Cloud-first, Agent-native SMB business platform**—a composable business runtime for small and medium businesses, operated primarily through a Built-in Agent with governed configuration, Module/Pack installation, and Managed Workspace Extensions.

> **Tell it. Run it.**

## Documentation

| Document | Description |
| --- | --- |
| [docs/04-architecture-pivot-cloud-first.md](docs/04-architecture-pivot-cloud-first.md) | **Architecture pivot** — Cloud-first / Cloud to Local |
| [docs/02-vision.md](docs/02-vision.md) | Product vision and roadmap |
| [docs/03-architecture.md](docs/03-architecture.md) | Architecture overview |
| [docs/01-poc-execution-plan.md](docs/01-poc-execution-plan.md) | POC execution plan（Cloud-first） |
| [docs/product/product-definition.md](docs/product/product-definition.md) | Product definition |
| [docs/architecture/overview.md](docs/architecture/overview.md) | Architecture entry point |

## Product Direction（2026-06-18）

Default entry: **Runory Cloud** → create Workspace → install Business Pack → Agent configures extensions.

Advanced entry: Codex / MCP / SDK, Private Cloud, Local Portable Runtime.

The repo currently contains a **Portable Runtime prototype**（V1 expense loop）used for development reference—not the product default:

```text
semi-structured expense text
→ runory.expense.create（MCP）
→ Business Engine
→ SQLite
→ Business Event
→ live dashboard
```

Cloud POC target loop:

```text
Register → Cloud Workspace → Install Pack
→ Agent adds field / workflow（Diff / Audit / Rollback）
→ Schema-driven UI updates
```

## Development

```bash
pnpm install
pnpm dev
```

Runory Cloud: `http://localhost:3000`

```bash
pnpm mcp             # MCP stdio adapter
```

The historical Local V1 prototype lives under `experiments/local-v1` and is not part of the active workspace.

See [docs/01-poc-execution-plan.md](docs/01-poc-execution-plan.md) for Cloud POC priorities.
