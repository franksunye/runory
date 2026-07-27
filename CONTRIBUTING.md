# Contributing to Runory

Thank you for helping improve Runory. Runory is a Cloud-first, Agent-native SMB business platform built around governed business Packs, stable runtime contracts, and safe operation by humans and external AI agents.

## Before you start

- Read the [documentation index](docs/README.md) and the relevant product or architecture documents.
- Search existing issues and pull requests before opening a new one.
- For significant product, architecture, data-model, permission, command-contract, migration, or Pack changes, open an issue first so the direction can be discussed before implementation.
- Do not report security vulnerabilities in public issues. Follow [SECURITY.md](SECURITY.md).

## Development setup

Requirements:

- Node.js 20+
- pnpm 9+

```bash
pnpm install
pnpm dev
```

Runory Cloud is available locally at `http://localhost:3000`.

For local development without email OTP, set the following in `apps/cloud/.env.local`:

```bash
PLATFORM_DEV_BOOTSTRAP=true
```

See [docs/getting-started.md](docs/getting-started.md) for the canonical onboarding flow.

## Repository structure

- `apps/cloud` — Next.js Cloud workspace
- `apps/cli` — command-line interface
- `apps/mcp` — MCP server for external agents
- `packages/platform-core` — runtime, metadata, Packs, extensions, audit, and releases
- `packages/contracts` — shared types, constants, and schemas
- `packages/sdk` — module and Pack development SDK
- `packages/sdk-testing` — SDK test utilities
- `catalog` — module, Pack, and Template manifests with demo data
- `docs` — governed product, architecture, operations, and release documentation

## Contribution workflow

1. Fork the repository and create a focused branch.
2. Make the smallest coherent change that solves the stated problem.
3. Add or update tests for behavioral changes.
4. Update authoritative documentation when contracts, workflows, configuration, Packs, permissions, or user-visible behavior change.
5. Run the relevant quality gates.
6. Open a pull request that explains the problem, the solution, validation performed, and any migration or compatibility impact.

## Quality gates

Run the checks relevant to your change before submitting:

```bash
pnpm typecheck
pnpm -r test
pnpm --filter @runory/cloud build
```

Changes affecting database behavior should also verify migration status and, when appropriate, a clean reset:

```bash
pnpm --filter @runory/cloud db:status
pnpm --filter @runory/cloud db:reset
pnpm --filter @runory/cloud bootstrap:demo
```

## Engineering expectations

### Preserve governed execution

Business mutations should flow through named commands and established runtime boundaries. Avoid direct database writes that bypass validation, permissions, audit, idempotency, or rollback behavior.

### Preserve tenant and permission boundaries

Treat workspace isolation, membership, roles, delegated Agent authority, and scoped actions as security boundaries. New operations must define and test their authorization behavior.

### Keep contracts stable

Changes to MCP tools, SDK APIs, schemas, command inputs, events, Pack manifests, or persisted data require explicit compatibility consideration. Prefer additive evolution and document breaking changes clearly.

### Keep Packs declarative and upgradeable

Official Packs, industry Packs, and workspace extensions have different ownership boundaries. Do not place customer-specific behavior into the governed core or official Pack definitions without a reusable product reason.

### Maintain documentation authority

Follow the lifecycle and authority rules in [docs/README.md](docs/README.md). Update the authoritative document rather than creating a competing specification.

## Pull request guidance

A useful pull request description includes:

- Problem and intended outcome
- Scope and notable design decisions
- Screenshots or examples for user-facing changes
- Tests and commands run
- Migration, security, compatibility, or rollback considerations
- Related issue or document links

Keep pull requests reviewable. Separate unrelated refactors, formatting, generated files, and product changes when possible.

## Licensing

By submitting a contribution, you agree that it may be licensed under the [Apache License 2.0](LICENSE), consistent with the repository license.
