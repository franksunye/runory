# Troubleshooting

This page covers the most common issues you may hit when running Runory locally or in Cloud Early Access, and the recovery paths for each. If a problem is not listed here, capture the request ID and follow the diagnostics guidance at the bottom.

For the canonical journey that should work end to end, see [Getting Started](./getting-started.md). For governance and audit, see [Admin / Governance](./admin-governance.md).

## Dev database drift

Symptom: the local dev server throws schema errors, migrations appear partially applied, or object pages fail with missing-table/missing-column errors.

Cause: Runory applies migrations lazily on first DB access. If you switched branches, changed manifests, or interrupted a migration, the local SQLite database in `data/` can drift from the code.

Recovery — reset the local database:

```bash
pnpm db:reset
pnpm dev
```

`pnpm db:reset` (script: `apps/cloud/scripts/db-reset.mjs`) deletes the `.db`, `.db-wal`, and `.db-shm` files in `data/`. The next `pnpm dev` (or `pnpm build`) recreates the schema from migrations. **All local workspace data is lost** — this is expected for a dev database.

To inspect the current state first:

```bash
pnpm db:status
```

`pnpm db:status` (script: `apps/cloud/scripts/db-status.mjs`) prints the database files in `data/` and reminds you that migrations are applied lazily on server startup. To see applied-vs-pending migration detail, start the dev server and read the migration logs in the console.

## Migration issues

Symptom: a migration fails on startup, or the dev server cannot replay migrations from an empty database.

Recovery:

1. Run `pnpm db:status` to confirm which database files exist.
2. Run `pnpm db:reset` to start from a clean slate.
3. Run `pnpm dev` and watch the console — migrations log as they apply.
4. If a migration still fails on a clean database, it is a code/manifest issue, not drift. Check that catalog manifests in `catalog/packs/` are valid and that the seed step ran.

The compatibility promise: a failed migration leaves the current runnable version unchanged and does not spread to other workspaces. A migration checksum mismatch blocks deployment.

## Pack install failures

Symptom: installing a pack from `/w/[workspaceId]/modules` fails, or the catalog appears empty.

Causes and fixes:

- **Catalog not seeded (local dev).** After a fresh database, seed the catalog from `catalog/packs/`:
  ```bash
  curl -X POST http://localhost:3000/api/platform/catalog/seed
  ```
- **Dependency resolution failure.** The installer rejects unresolved module ranges or dependency cycles. Check the pack's `modules` list and `coreCompatibility`.
- **Compatibility preflight failure.** The workspace reports an Extension conflict before upgrade. Resolve the conflict or keep the current version.
- **Frozen lock mismatch.** Pack installs use a frozen dependency lock; a tampered lock is rejected.

Capture the request ID from the install error. The error response is supportable and includes a structured message (never a stack trace in production).

## Demo data issues

Symptom: loading demo data fails, or relations show raw IDs instead of labels.

- Demo data load is a separate step from pack install. Make sure the pack is installed first.
- Demo data lives in each pack's `catalog/packs/<pack>/demo-data.json`. If a relation surfaces a raw ID where a label should appear, this is a known current limitation in some preview surfaces — not a bug. Re-loading demo data on a clean workspace is the expected recovery path.
- If demo data load is idempotency-failing, reset and re-seed:
  ```bash
  pnpm db:reset && pnpm dev
  curl -X POST http://localhost:3000/api/platform/catalog/seed
  ```
  Then reinstall the pack and reload demo data.

## Auth and OTP in dev mode

Symptom: you cannot sign in locally because no OTP email arrives.

Recovery — use the dev bootstrap:

```bash
# apps/cloud/.env.local
PLATFORM_DEV_BOOTSTRAP=true
```

With `PLATFORM_DEV_BOOTSTRAP=true`, Runory auto-authenticates you as a local owner and auto-creates the workspace tenant — no email is sent. This is **dev only** and gated on an explicit flag (not `NODE_ENV`), so it will not activate in staging or test. Production must reject dev bootstrap identity.

Notes:

- OTPs are hashed, single-use, expire, and have an attempt limit. In dev, the OTP email is only sent if a mail provider URL is configured (`PLATFORM_MAIL_PROVIDER_URL`).
- If you set `PLATFORM_TRUST_IDENTITY_HEADERS=true`, you must also set `PLATFORM_TRUST_PROXY_VERIFIED=true`, otherwise the server prints a loud startup warning. Trust headers are spoofable by any client unless a verified reverse proxy strips and re-injects them.

## Session issues

Symptom: you appear logged out unexpectedly, or sessions do not persist.

- Runory uses opaque session tokens with hash storage and cookie flags. If you are behind a proxy, confirm the cookie flags and Origin/CSRF protection are correct.
- `logout` and `logout-all` immediately revoke sessions.
- If sessions drop only in dev, check that your browser is not blocking the session cookie and that `PLATFORM_SESSION_COOKIE` (default `platform_session`) is not misconfigured.
- Captured a `403` after a member removal? That is expected — access revocation takes effect on the next request.

## Request IDs and error diagnostics

Every API response includes a request ID (from the `x-request-id` header, or generated server-side via `getOrCreateRequestId`). When something fails:

1. Copy the request ID from the error toast or the raw API response.
2. Note the exact API route (for example `/api/workspaces/[id]/agent/apply`) and the action.
3. Check the audit trail at `/w/[workspaceId]/audit` for the failed operation (applies and rollbacks are recorded).
4. For local dev, read the dev server console — it logs migrations, audit write failures, and `[runory-mcp]` startup lines.

Production never exposes stack traces or SQL details. The request ID is the support handle — include it in any bug report.

## MCP server issues

Symptom: the MCP server starts but tools return `401`, or tools cannot find the workspace.

- Without `RUNORY_API_KEY`, the MCP server runs in dev mode (no auth header). Production returns `401`.
- Set `RUNORY_API_KEY` to a workspace API key (create one at `/w/[workspaceId]/api-keys`).
- Set `RUNORY_WORKSPACE_ID` to default the workspace when a tool omits it; an explicit `workspaceId` argument always takes precedence.
- Confirm `RUNORY_API_BASE` points at the right Cloud URL (`http://localhost:3000` for local dev).
- On startup the server logs `[runory-mcp] Registered 17 tools.` and its auth mode.

See [MCP / Skill Usage](./mcp-skill-usage.md) for the full tool list and connection config.

## Build and typecheck

Symptom: `pnpm typecheck` or `pnpm build` fails locally.

- Run `pnpm typecheck` from the repo root. The v0.4.0 iteration locked the dynamic object route shell as the only default object page path; legacy per-object route wrappers were removed.
- Run `pnpm db:reset` then `pnpm build` to ensure a clean migration replay.
- If the production build fails after a manifest change, re-seed the catalog and retry.

## Known limitations

- The Agent operation and MCP surfaces are **preview** during `v0.4`; the stable MCP interface ships in `v0.4.4`.
- The SDK is private during `v0.4`; third-party module publishing is not yet open.
- No paid billing, Stripe, enterprise SSO, or marketplace monetization yet.
- Some preview surfaces may show raw relation IDs where labels are not yet available.

See [Release Notes](./release-notes.md) for the full per-version status.
