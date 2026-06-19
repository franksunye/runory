# Next Steps: Post-POC Roadmap

Status: Draft  
Date: 2026-06-18  
Prerequisite: Cloud-first POC completed (14/14 acceptance criteria passed)

## 1. Current State

The Cloud-first POC proves the core hypothesis: metadata-driven objects + Agent-governed extensions = running business app without code generation. The full loop works: Workspace → Pack install → Schema-driven UI → Agent Extension (plan/preview/apply/rollback) → Audit → Export.

However, the POC is a local dev prototype. The following gaps must be addressed before it becomes a usable product.

## 2. Immediate Next Steps (Week 1-2)

### 2.1 Deploy to Vercel + Turso

**Goal**: POC running on real cloud infrastructure.

- [ ] Create Turso database, get connection string
- [x] Replace `better-sqlite3` with `@libsql/client` (Turso's HTTP client)
- [x] Use one async libSQL persistence path for local SQLite and Cloud Turso
- [ ] Configure Vercel environment variables (`LIBSQL_URL`, `LIBSQL_AUTH_TOKEN`)
- [ ] Deploy to Vercel
- [ ] Verify all 14 acceptance criteria pass on deployed URL

**Resolved risk**: the runtime now uses the async `@libsql/client` path throughout.

### 2.2 Authentication (Minimal)

**Goal**: Prevent anonymous access; identify who did what.

- [ ] Add Vercel-compatible auth (NextAuth.js or custom token)
- [ ] Single-user mode for POC (no multi-tenant yet)
- [ ] Add `created_by` tracking to all write operations
- [ ] Audit log shows real user identity

### 2.3 MCP Server on Cloudflare Workers

**Goal**: Personal Agents can connect to Cloud Runory via HTTP MCP.

- [ ] Create Cloudflare Worker that proxies MCP requests to Runory API
- [ ] Use MCP HTTP transport (not stdio) for cloud
- [ ] Add API key authentication for MCP endpoints
- [ ] Update SKILL.md with cloud MCP configuration

## 3. Short-term (Week 3-4)

### 3.1 Multi-tenant Isolation

**Goal**: Each workspace is isolated; `workspace_id` enforced everywhere.

- [ ] Add `workspace_id` to ALL queries (currently only on most)
- [ ] Implement Row-Level Security pattern (application-level for SQLite/Turso)
- [ ] Workspace-scoped API keys
- [ ] User → Workspace membership table

### 3.2 Real-time Updates

**Goal**: UI updates without manual refresh after extension apply/rollback.

- [ ] Replace polling with SSE (Vercel supports streaming)
- [ ] Or use Vercel's `useSWR` with revalidation hooks
- [ ] Event bus pattern: write operation → publish event → SSE stream → UI re-fetch

### 3.3 Extension: Custom View (Beyond Custom Field)

**Goal**: Prove extension points beyond fields.

- [ ] Allow Agent to add a new view section (not just a field in existing section)
- [ ] Allow Agent to reorder columns
- [ ] Allow Agent to add a filter to list view
- [ ] Update Extension Plan schema to support view operations

### 3.4 Contact Module Full CRUD

**Goal**: Prove the pattern works for multiple objects.

- [ ] Contact list page (schema-driven, already works)
- [ ] Contact form (create/edit)
- [ ] Contact detail page
- [ ] Customer → Contact relationship (foreign key navigation)

## 4. Medium-term (Week 5-8)

### 4.1 Workflow Runtime (V2 Feature)

**Goal**: Agent can create simple approval workflows.

- [ ] Workflow definition table (trigger, steps, approvers)
- [ ] Workflow execution engine
- [ ] Agent MCP tool: `runory.workflow.create`
- [ ] UI: pending approvals widget
- [ ] Audit log for workflow actions

### 4.2 Marketplace Foundation

**Goal**: Third-party modules can be published and installed.

- [ ] Module packaging format (tarball with manifest + migrations)
- [ ] Module registry (GitHub-based or simple API)
- [ ] Install from URL
- [ ] Version compatibility checking
- [ ] Module dependency resolution

### 4.3 Template System

**Goal**: Templates provide complete business experience out of the box.

- [ ] Template application on workspace creation
- [ ] Template-driven navigation ordering
- [ ] Template-driven dashboard layout
- [ ] Template terminology mapping (e.g., "customer" → "客户")
- [ ] Template role-based entry pages

### 4.4 Cloudflare Workers Integration

**Goal**: Background jobs and scheduled tasks.

- [ ] Usage metering (record count, API calls per workspace)
- [ ] Audit log cleanup (retain 90 days)
- [ ] Export bundle generation (async, stored in R2)
- [ ] Workspace backup to R2

## 5. Long-term (Month 3+)

### 5.1 Private / Local Deployment

**Goal**: Runory can be self-hosted with cloud export/import.

- [ ] Workspace export package format (JSON + SQLite dump)
- [ ] Local Runtime (based on the archived `experiments/local-v1` prototype and shared Platform Core)
- [ ] Import workspace package to local
- [ ] Sync conflict resolution (cloud as source of truth)

### 5.2 Module SDK

**Goal**: Developers can build and publish Runory modules.

- [ ] Module scaffolding CLI (`npx create-runory-module`)
- [ ] Module test framework
- [ ] Module documentation generator
- [ ] Module publishing pipeline (GitHub Actions → registry)

### 5.3 Advanced Extension Types

**Goal**: Extensions beyond custom fields.

- [ ] Custom relations (link objects)
- [ ] Custom actions (buttons that trigger workflows)
- [ ] Custom validation rules
- [ ] Custom UI widgets (within governed slots)
- [ ] Computed fields (formula-based)

### 5.4 Enterprise Features

- [ ] SSO (SAML, OIDC)
- [ ] Role-based access control (RBAC)
- [ ] Audit log export and compliance reporting
- [ ] Data residency options
- [ ] API rate limiting

## 6. Technical Debt To Address

| Item | Priority | Description |
|------|----------|-------------|
| Async DB layer | Completed | All active Cloud paths use `@libsql/client` for Turso/local SQLite |
| Error handling | High | Standardize error codes and messages across all API routes |
| Test coverage | High | Add unit tests for installer, extension runtime, metadata |
| Type safety | Medium | Strengthen TypeScript types in metadata.ts (currently uses `any` in places) |
| API validation | Medium | Add request body validation (Zod) to all POST/PUT routes |
| UI polish | Medium | Loading states, error states, empty states need improvement |
| MCP auth | High | MCP server currently has no authentication |
| Migration system | Medium | No versioned migration system; schema is created on first run |

## 7. Decision Points

### D1: Database Driver Abstraction

Should we create a `DatabaseDriver` interface now, or wait until we need to support both SQLite and Turso?

**Recommendation**: Do it now. The async migration is inevitable, and abstracting early prevents touching every file twice.

### D2: Auth Strategy

NextAuth.js (full-featured, heavier) vs custom token (minimal, lighter)?

**Recommendation**: Custom token for POC. NextAuth.js when we need OAuth/SSO.

### D3: Real-time Strategy

SSE (Vercel native, unidirectional) vs WebSocket (needs external service, bidirectional)?

**Recommendation**: SSE for now. WebSocket only if we need real-time collaboration.

### D4: Module Distribution

GitHub-based registry (simple, free) vs custom registry API (flexible, costly)?

**Recommendation**: GitHub-based for v1. Custom registry when Marketplace launches.

## 8. Success Metrics for Next Phase

| Metric | Target | How to measure |
|--------|--------|----------------|
| Deployed on Vercel + Turso | Yes | URL accessible, all tests pass |
| Auth working | Yes | Cannot access without token |
| MCP cloud endpoint | Yes | Personal Agent can connect remotely |
| Multi-tenant safe | Yes | Cross-workspace data leak test passes |
| Real-time UI update | < 2s | Extension apply → field visible in < 2s |
| Contact CRUD complete | Yes | Create, edit, view, delete contacts |
| Unit test coverage | > 60% | `vitest --coverage` |
