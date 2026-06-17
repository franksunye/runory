# Runory POC Execution Plan

Status: Draft v0.1  
Date: 2026-06-17  
Source: original `X POC 技术与产品规格`; product name finalized as Runory.

## 1. Executive Summary

Runory POC validates an agent-native local business application pattern:

> Codex acts as a Personal Agent OS. Runory acts as a local headless business app. Codex changes business data and enables prebuilt business capabilities through MCP tools, while the web UI updates live from the same business engine and persistent state.

The POC should prove two chains only:

1. Data change: user input or uploaded material -> Codex extraction -> MCP tool -> Business Engine -> SQLite -> Business Event -> Web UI live refresh.
2. Capability change: user asks for a new business capability -> Codex installs a prebuilt module -> migrations and manifests are registered -> navigation and route become available -> Codex can operate the new business object.

This is a valid and compelling POC, but only if the scope stays narrow. Runory's product principle is that an agent activates and operates trusted local business capabilities; it does not freely generate production UI, production schema, or arbitrary business modules at runtime. In this POC, "dynamic capability" means dynamic activation of a prebuilt, locally shipped module.

## 2. Naming Decision

The product, repository, CLI, runtime, MCP namespace, skill, and documentation should all use `runory`.

Approved names:

- Product: Runory
- Repository: `franksunye/runory`
- Local command: `runory`
- MCP namespace: `runory.*`
- Skill directory: `skills/runory-smb-poc`
- Local app data: `~/.runory`

Do not use `X`, `x-poc`, `x.*`, `~/.x`, or `x start` in new implementation or documentation except when referring to the historical source material.

## 3. POC Decision

We should proceed.

The idea is technically credible because it relies on known mechanisms:

- MCP tools for agent-to-runtime actions.
- A local Fastify runtime for HTTP and SSE.
- SQLite for durable local state.
- A shared Business Engine for both UI and MCP writes.
- Prebuilt React views controlled by module manifests.
- Server-Sent Events plus query invalidation for live UI changes.

The highest-risk idea is "dynamic UI/function changes." It is reasonable only under Runory's product principle:

- Modules are prebuilt in the repo.
- Migrations are bundled and versioned.
- Views are already compiled into the frontend.
- Module installation registers database state, navigation, route metadata, tools, and events.
- No arbitrary generated React code is loaded at runtime.

That boundary should be treated as non-negotiable for the first POC.

## 4. Product Goal

The demo viewer should immediately understand:

> I can use conversation not only to change records inside software, but also to change which business capabilities the software exposes.

The demo is successful if a small restaurant scenario works end to end:

1. Start a local expense management workspace through Codex.
2. Import three semi-structured receipt-like expense inputs through Codex.
3. See two committed expenses and one review item appear in the UI without manual refresh.
4. Confirm the low-confidence expense from Codex or from the UI.
5. Ask for employee management.
6. See the Employee Lite module appear dynamically.
7. Add an employee through Codex and see the employee list update live.

## 5. Scope

### In Scope

- Local single-user runtime.
- Expense Core module enabled by default.
- Employee Lite module available for installation.
- Semi-structured text inputs that simulate receipts.
- SQLite persistence under local app data.
- MCP tools for workspace, expense, module, employee, and view actions.
- HTTP API used by the web UI.
- Shared Business Engine used by both MCP and UI.
- SSE event stream for live refresh.
- Audit logs for write operations.
- Basic tests covering business rules, module installation, and core flows.

### Out of Scope

- Login, tenants, roles, and permissions.
- Cloud sync.
- Accounting-grade ledger, tax, payroll, bank integration, or month close.
- Remote module marketplace.
- Real image OCR for the first demo version.
- Runtime-generated React code.
- LLM direct database writes.
- LLM-generated production migrations.
- Mobile app, Tauri app, or desktop packaging.
- Multi-agent support.
- WebSocket infrastructure.
- Full audit administration UI.

## 6. Architecture

The POC should be structured around one local runtime process and one browser UI.

```text
Codex
  |
  | MCP stdio
  v
Runory Local Runtime
  - MCP server
  - Fastify HTTP API
  - Business Engine
  - Module Manager
  - Repository layer
  - Event Bus
  - SSE stream
  - SQLite
  |
  | HTTP + SSE
  v
Runory Web UI
  - Dynamic shell/navigation
  - Dashboard
  - Expense list/review
  - Employee list
```

Core rule:

> All writes must pass through the Business Engine. Codex, MCP handlers, UI routes, and modules must not write SQLite directly.

## 7. Recommended Repository Shape

Use a monorepo, but keep it smaller than the original spec for the POC.

```text
runory/
  apps/
    runtime/
    web/
  packages/
    business-engine/
    database/
    events/
    shared/
  modules/
    expense-core/
    employee-lite/
  skills/
    runory-smb-poc/
  docs/
```

Defer separate `apps/mcp-server` unless the runtime process becomes too crowded. For the POC, the MCP server can live inside `apps/runtime` so `runory start` has one thing to supervise.

## 8. Technical Choices

Use the proposed stack with a few scope adjustments:

- Runtime: Node.js, TypeScript, Fastify, better-sqlite3, Zod, Pino.
- UI: React, Vite, React Router, TanStack Query, ECharts.
- Styling: start with Tailwind CSS. Add shadcn/ui only if it speeds up implementation rather than becoming setup overhead.
- Realtime: SSE, not WebSocket.
- Tests: Vitest for business logic and integration; Playwright for the five demo paths.
- Package manager: pnpm.
- Monorepo orchestration: Turborepo is acceptable, but optional for the first skeleton if it slows setup.

## 9. Module Model

Expense Core is installed during workspace initialization.

Employee Lite is shipped with the repo but disabled until installation. Installing it should:

1. Check whether `employee-lite` is already installed.
2. Open a database transaction.
3. Run the employee migration if needed.
4. Write `installed_modules`.
5. Write `navigation_items`.
6. Register view metadata.
7. Register exposed MCP tools.
8. Publish `module.installed`.
9. Return an `openUrl`.

The frontend can contain `EmployeeListView` from the beginning, but it must not appear in navigation or routing until module state says it is installed. This is the intended Runory model: dynamic activation of trusted capabilities, not runtime software generation.

## 10. Data Model

Minimum required tables:

- `expenses`
- `vendors`
- `documents`
- `employees` after Employee Lite migration
- `installed_modules`
- `navigation_items`
- `business_events`
- `audit_logs`

POC status values:

- Expense: `draft`, `needs_review`, `committed`, `archived`
- Employee: `active`, `inactive`
- Source: `codex`, `ui`, `system`

Use repository classes or functions as the only SQL boundary. Direct SQL in route handlers, MCP handlers, or React-facing services should be rejected during review.

## 11. MCP Tool Surface

Start with this minimum set:

- `runory.workspace.start`
- `runory.workspace.status`
- `runory.expense.create`
- `runory.expense.create_draft`
- `runory.expense.confirm`
- `runory.expense.list`
- `runory.module.install`
- `runory.employee.create`
- `runory.employee.list`
- `runory.view.open`

The implementation must use `runory.*`. The original `x.*` namespace is obsolete.

All tool responses should use a consistent envelope:

```json
{
  "success": true,
  "data": {}
}
```

Errors:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_EXPENSE_DATE",
    "message": "费用日期格式无效"
  }
}
```

## 12. Business Rules

Implement these rules before polishing UI:

- `validateExpenseAmount`: amount must be greater than 0.
- `validateExpenseDate`: date must be a valid ISO date when committing.
- `decideExpenseStatus`: confidence >= 0.85 commits; 0.60-0.84 needs review; below 0.60 should ask user before writing.
- `findOrCreateVendor`: normalize vendor names enough to avoid obvious duplicates.
- `canConfirmExpense`: only `needs_review` and `draft` can become `committed`.
- `validateEmployeePhone`: enforce a simple POC phone rule, not global phone correctness.
- `canInstallModule`: only known local modules can be installed.
- `isModuleInstalled`: duplicate install returns success with `alreadyInstalled: true`.

## 13. HTTP API

Expose only what the UI needs:

- `GET /api/health`
- `GET /api/workspace`
- `GET /api/navigation`
- `GET /api/dashboard`
- `GET /api/expenses`
- `POST /api/expenses`
- `POST /api/expenses/:id/confirm`
- `GET /api/employees`
- `POST /api/employees`
- `POST /api/modules/:moduleId/install`
- `GET /api/events/stream`

MCP handlers and HTTP handlers should call the same service layer.

## 14. UI Requirements

The first UI should be an operational app, not a landing page.

Required views:

- App shell with dynamic navigation, runtime status, current page title, SSE status, and agent activity.
- Dashboard with monthly expense total, review count, monthly record count, trend chart, and recent activity.
- Expense list with status and source.
- Expense review drawer.
- Employee list with a clear empty state.

Required live behavior:

- New rows appear without manual refresh.
- KPI values update after events.
- Chart changes after events.
- Review badge updates after events.
- Employee navigation appears after module installation.
- App navigates to `/employees` after install.

## 15. Version Plan

### V0: Repository And Runtime Skeleton

Purpose: create the technical base without trying to prove the full product idea yet.

Capabilities:

- pnpm workspace.
- Runtime app with Fastify.
- SQLite bootstrap under `~/.runory`.
- Health, workspace, navigation, and empty dashboard APIs.
- Web app shell and empty dashboard.
- `runory.workspace.start` and `runory.workspace.status`.

Acceptance:

- Runory can start locally.
- Browser opens `/dashboard`.
- Dashboard shows an empty state.
- No expense, receipt, review, or module-install work is included.

### V1: First Demonstrable POC - Data Change Loop

Purpose: prove the smallest valuable version of the core idea.

V1 statement:

> Codex uses Runory MCP tools to create expense records from semi-structured text. Runory writes through the Business Engine into SQLite. The dashboard and expense list update without manual refresh.

Capabilities:

- Semi-structured receipt text parser at the Codex/skill layer.
- Real MCP stdio server exposing `runory.workspace.status` and `runory.expense.create`.
- `runory.expense.create`.
- Expense, vendor, document-lite repositories.
- Expense Business Engine validation.
- Expense list API and UI.
- Dashboard KPI and recent activity.
- SSE event stream and frontend query invalidation.
- Persistence across runtime restart.

Example V1 input:

```text
Vendor: Restaurant Depot
Date: 2026-06-16
Amount: 286.40
Currency: USD
Category: ingredients
Description: 食材采购
Confidence: 0.95
```

Acceptance:

- Codex can create at least one committed expense from semi-structured text.
- Expense writes go through Business Engine, not direct SQL.
- SQLite contains the expense after restart.
- Expense list updates without manual refresh.
- Dashboard KPI and recent activity update without manual refresh.

Explicitly deferred from V1:

- Real receipt image OCR.
- Low-confidence review drawer.
- Employee Lite module installation.
- Dynamic navigation changes.
- Full Codex skill polish.

### V2: Human Review Loop

Purpose: prove that uncertain agent output can enter a human-in-the-loop business state.

Capabilities:

- `runory.expense.create_draft`.
- Confidence rules: `>= 0.85` committed, `0.60-0.84` needs review, `< 0.60` ask before writing.
- Review drawer.
- `runory.expense.confirm`.
- UI confirmation using the same Business Engine.
- Audit logs with `source`.

Acceptance:

- Low-confidence input creates `needs_review`.
- Codex confirmation and UI confirmation produce equivalent state transitions.
- Dashboard and list update after confirmation.

### V3: Trusted Capability Activation Loop

Purpose: prove that Runory can change available business capabilities without generating software at runtime.

Capabilities:

- Employee Lite manifest.
- Module installer.
- Employee migration.
- Dynamic navigation registration.
- Employee API, UI, and MCP tools.
- Automatic open of `/employees` after install.

Acceptance:

- `runory.module.install` installs `employee-lite` idempotently.
- Navigation shows "店员" after installation without frontend rebuild.
- `runory.employee.create` adds an employee.
- Employee list updates without manual refresh.
- Restart preserves installed module, navigation, and employee data.

### V4: Demo Hardening

Purpose: make the full story repeatable.

Capabilities:

- Runory Codex skill.
- Scripted demo fixtures.
- Reset/dev command.
- Playwright smoke flows.
- Clear logs and error messages.

Acceptance:

- Full demo passes three times from a clean local workspace.

## 16. Development Plan

### Phase 1: Runtime Skeleton

Goal: Codex or CLI can start a local runtime and open an empty dashboard.

Deliverables:

- pnpm workspace.
- Runtime app with Fastify.
- SQLite initialization.
- Base migrations.
- Health and workspace APIs.
- Web app shell.
- Empty dashboard.
- `runory.workspace.start` and `runory.workspace.status`.

Exit criteria:

- `runory.workspace.start` returns a localhost URL.
- Browser opens `/dashboard`.
- Dashboard shows empty state.

### Phase 2: Expense Data Loop

Goal: Codex-created expenses appear in the UI without refresh.

Deliverables:

- Expense, vendor, document repositories.
- Expense Business Engine rules.
- Expense MCP tools.
- Expense HTTP API.
- Dashboard summary and trend.
- SSE event stream.
- Query invalidation on business events.

Exit criteria:

- Creating a committed expense updates list, KPI, trend, and activity.
- Creating a low-confidence expense increments review count.

### Phase 3: Human Review Loop

Goal: Codex and UI confirm the same low-confidence expense through the same engine.

Deliverables:

- Review drawer.
- `runory.expense.confirm`.
- UI confirm endpoint.
- Audit log entries with source.
- Tests for status transitions.

Exit criteria:

- Confirming through Codex and confirming through UI produce equivalent database state and events.

### Phase 4: Dynamic Module Loop

Goal: Employee Lite dynamically appears and works.

Deliverables:

- Module manifest format.
- Module installer.
- Employee migration.
- Dynamic navigation registration.
- Employee view and API.
- Employee MCP tools.

Exit criteria:

- Installing `employee-lite` adds navigation without a rebuild.
- `/employees` opens automatically.
- Creating an employee through Codex updates the list live.

### Phase 5: Demo Hardening

Goal: The full scripted demo runs reliably.

Deliverables:

- Codex skill.
- Demo data fixtures.
- Playwright scenarios.
- Error messages and logs.
- Reset/dev utility.

Exit criteria:

- The final demo script passes three times from a clean local workspace.

## 17. Test Plan

Unit tests:

- Expense amount validation.
- Expense date validation.
- Confidence-to-status decision.
- Module duplicate install.
- Employee phone validation.
- Business event creation.
- Navigation registration.

Integration tests:

- MCP tool -> Business Engine -> SQLite -> Business Event.
- HTTP route -> Business Engine -> SQLite -> Business Event.
- Module install transaction rollback on failure.

E2E tests:

1. Start runtime -> open dashboard -> empty state.
2. Create expense -> expense list row and dashboard KPI update.
3. Create low-confidence expense -> review count increases -> UI confirm commits it.
4. Install Employee Lite -> navigation appears -> employee page opens.
5. Create employee -> employee list row appears.

## 18. Risks And Adjustments

### Risk: "Dynamic capability" is misunderstood as runtime code generation

Decision: do not implement runtime-generated UI or migrations. This is not merely a POC shortcut; it is a Runory product principle. Demonstrate trusted prebuilt module activation through manifest and state.

### Risk: MCP server and HTTP runtime process management becomes complicated

Decision: keep MCP server inside the local runtime for POC. Split later only if needed.

### Risk: Turborepo and shadcn setup consumes POC time

Decision: use them only if they accelerate development. The architecture does not depend on them.

### Risk: receipt OCR distracts from the core POC

Decision: V1 uses semi-structured text that simulates receipts. Real image OCR can be added after the data loop works and should not block the core proof.

### Risk: SSE reliability masks data bugs

Decision: every event-driven UI update must be backed by refetching canonical API data. Do not mutate UI state as the source of truth.

### Risk: local data path is hard to reset during demo development

Decision: provide a dev reset command before hardening the demo.

## 19. POC Acceptance Criteria

The POC passes when:

1. Codex can start Runory without the user manually running commands.
2. A localhost dashboard opens.
3. Three expense inputs produce at least two committed expenses and one review item.
4. UI updates without manual refresh.
5. Codex confirmation and UI confirmation use the same Business Engine.
6. Employee Lite installs dynamically.
7. Employee navigation and page appear without rebuilding the frontend.
8. Codex can add an employee.
9. Runtime restart preserves expenses, employees, module state, and navigation.
10. Codex never writes SQLite directly.

## 20. Immediate Next Step

Create the repository skeleton and implement Phase 1 only:

- pnpm workspace.
- `apps/runtime`.
- `apps/web`.
- shared TypeScript types.
- SQLite bootstrap.
- health/workspace/navigation/dashboard APIs.
- empty app shell.
- first smoke test.

Do not start with image OCR, dynamic modules, or visual polish. The first milestone should prove that a local runtime, persistent workspace, HTTP API, and web shell can boot cleanly. The first externally meaningful demo is V1: semi-structured expense text -> `runory.expense.create` -> Business Engine -> SQLite -> live dashboard/list update.
