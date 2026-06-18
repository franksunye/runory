# Runory

Runory is a **Cloud-first, Agent-native SMB business platform**—a composable business runtime for small and medium businesses, operated primarily through a Built-in Agent with governed configuration, Module/Pack installation, and Managed Workspace Extensions.

> **Tell it. Run it.**

## Documentation

| Document | Description |
| --- | --- |
| [docs/0004-architecture-pivot-cloud-first.md](docs/0004-architecture-pivot-cloud-first.md) | **Architecture pivot** — Cloud-first / Cloud to Local |
| [docs/0002-vision.md](docs/0002-vision.md) | Product vision and roadmap |
| [docs/0003-architecture.md](docs/0003-architecture.md) | Architecture overview |
| [docs/0001-poc-execution-plan.md](docs/0001-poc-execution-plan.md) | POC execution plan（Cloud-first） |
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

## Development（Portable Runtime prototype）

```bash
pnpm install
pnpm dev
```

Runtime API: `http://127.0.0.1:4310`  
Web UI: `http://127.0.0.1:5173/dashboard`

```bash
pnpm runory start    # runtime only
pnpm runory mcp      # MCP stdio server
```

See [docs/0001-poc-execution-plan.md](docs/0001-poc-execution-plan.md) for Cloud POC priorities.
