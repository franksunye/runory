# Runory Manual E2E Test Suite

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Applies to | v0.5–v0.9 |
| Owner | Product + Engineering |
| Last reviewed | 2026-07-30 |

## 1. Purpose

This suite defines repeatable, browser-executed manual acceptance tests that
verify Runory's canonical FSM product works end to end through the real UI —
not only through API or database-level code tests.

The existing unit tests and code-level E2E tests (`v05-journey.test.ts`,
`payment-flow.e2e.test.ts`, `data-integrity.test.ts`, etc.) validate business
logic correctness at the API and data layer. This manual suite covers what they
cannot:

- UI rendering and component composition
- User interaction flows (clicks, forms, navigation, selections)
- Visual consistency with design intent
- Cross-surface state coherence (list ↔ detail ↔ planning ↔ my work)
- Real browser behavior (PWA, Service Worker, push)
- Mobile responsive layout
- Role-based access boundaries
- **DB Spot-check** — each test case includes lightweight SQL queries to verify
  that what the UI shows matches what the database stores at key state
  transitions (see [§3.5 of the setup guide](./00-test-environment-setup.md))

## 2. Suite index

| # | Test case | Primary role | Surface | Priority |
| --- | --- | --- | --- | --- |
| 00 | [Test Environment Setup](./00-test-environment-setup.md) | — | — | prerequisite |
| 01 | [FSM Owner Happy Path](./01-fsm-owner-happy-path.md) | Owner | Desktop | P0 |
| 02 | [Quote Commercial Loop](./02-quote-commercial-loop.md) | Sales Rep → Sales Manager → Owner | Desktop | P0 |
| 03 | [Invoice and Payment](./03-invoice-payment.md) | Supervisor → Customer | Desktop + Stripe | P0 |
| 04 | [Customer Access](./04-customer-access.md) | Owner → Customer | Customer portal | P0 |
| 05 | [Mobile Field Work](./05-mobile-field-work.md) | Technician | Mobile `/m` | P1 |
| 06 | [PWA Notifications](./06-pwa-notifications.md) | System user | Mobile PWA | P1 |
| 07 | [Role Permission Boundaries](./07-role-permissions.md) | All roles | Desktop + Mobile | P0 |
| 08 | [Exception Paths](./08-exception-paths.md) | Owner + Supervisor | Desktop | P1 |
| 09 | [Delivery Infrastructure](./09-delivery-infrastructure.md) | Platform operator | Admin console | P1 |

## 3. Execution order

```text
Phase 1 — Foundation (sequential)
  00  Environment setup
  01  FSM Owner Happy Path        ← proves the core loop works

Phase 2 — Commercial loop (sequential, builds on Phase 1 data)
  02  Quote Commercial Loop       ← creates the quote that feeds Phase 3
  03  Invoice and Payment         ← closes the financial loop

Phase 3 — External surfaces (can run in parallel after Phase 2)
  04  Customer Access             ← external user views and pays
  05  Mobile Field Work           ← technician executes on mobile

Phase 4 — Platform capabilities (independent)
  06  PWA Notifications
  07  Role Permission Boundaries  ← can run alongside any phase
  08  Exception Paths
  09  Delivery Infrastructure
```

## 4. Severity and pass criteria

| Severity | Definition | Examples |
| --- | --- | --- |
| P0 Blocker | Path cannot finish safely or business data is corrupted | Cannot create/assign/start/complete; duplicate record; cross-workspace leak |
| P1 Major | Path finishes only by bypassing a core invariant | Generic status edit; missing required-work guard; cross-surface disagreement |
| P2 Product gap | Path is correct but confusing or unnecessarily difficult | Poor copy, hidden next action, raw ID, inconsistent formatting |
| P3 Polish | Cosmetic issue with no material ambiguity | Spacing, minor truncation, non-blocking visual detail |

A test case **passes** only when:

- Every required stage passes.
- There are no P0 or P1 findings.
- P2/P3 findings have an owner and target milestone.
- The path is understandable without explaining internal architecture.

## 5. Run record convention

Each test case file includes a run record template at the end. Copy it for
every execution and store the result in `docs/testing/manual-e2e/run-records/`.

The filename must follow the pattern `<NN>-<test-case-slug>-<YYYYMMDD>.md`.

Each run record must include the following evidence metadata at the top:

```markdown
- Date/time:
- Reviewer:
- Branch/commit:
- Workspace slug/id:
- Environment: (dev / staging / prod)
- Browser:
- Roles used:
- Key record IDs:
- Evidence layer: (see §8 Evidence hierarchy)
```

```markdown
### <Test Case Name> — <Run ID>

| Stage | Result | Evidence | Finding |
| --- | --- | --- | --- |
| ... | PASS / FAIL / BLOCKED / N/A | | |

Final decision: PASS / FAIL

Findings:
1. [P0/P1/P2/P3] <title>
   - Expected:
   - Actual:
   - Reproduction:
   - Owner / milestone:

Run integrity:
- No direct API/SQL mutation: YES / NO
- No identity switching beyond documented role changes: YES / NO
- No database reset during run: YES / NO
```

Allowed stage results:

```text
PASS     all required assertions and evidence are present
FAIL     behavior or invariant is wrong
BLOCKED  external prerequisite unavailable; never release-passing
N/A      explicitly outside this Scenario's binding scope
```

`SKIPPED` is not a passing result for a required stage. Conditional PASS is
not an allowed final release decision.

Automated runs must also emit a JSON artifact conforming to
[`e2e-result.schema.json`](./e2e-result.schema.json). Validate an artifact with:

```bash
pnpm e2e:validate-result -- <path-to-result.json>
```

The API business walkthrough writes its artifact under
`apps/cloud/test-results/e2e/` by default, or to `RUNORY_E2E_RESULT_PATH` when
set. A `PASS` that is binding for this evidence layer requires an exact
40-character commit SHA, a clean working tree, only declared result values,
every required Scenario passing, and fresh IDs for the complete Quote → Work
Order → Visit → Form Submission trace. It does not replace the browser,
device/provider, or real-customer evidence layers required for release sign-off.

The automated browser layer consumes that validated, clean-commit API artifact
and reopens the same fresh Quote, Work Order, Visit, Form Submission, dashboard,
and planning surfaces as the relevant personas at desktop and mobile viewports:

```bash
pnpm --filter @runory/cloud exec playwright install chromium
RUNORY_E2E_RESULT_PATH=<api-result.json> pnpm e2e:browser
```

The suite refuses stale, failed, dirty-tree, or commit-mismatched API evidence.
It emits a JSON report, HTML report, screenshots, video-on-failure, and traces
under `apps/cloud/test-results/e2e/` and `apps/cloud/playwright-report/`.

## 6. Test data convention

Create fresh records for every run. Do not reuse seeded records — a
pre-existing relation or completion artifact can hide a broken creation path.

```text
Run ID: <SUITE>-<YYYYMMDD>-<HHMM>
Examples:
  FSM-20260730-1400
  QUOTE-20260730-1430
  PAY-20260730-1500
```

Use the Run ID consistently in record titles, descriptions, and completion
reasons so results are traceable across surfaces.

## 7. Related documents

- [FSM Owner Single-Role E2E Acceptance Runbook](../../product/fsm-owner-single-role-e2e-acceptance-runbook.md) — predecessor of test case 01
- [v0.5.1 Local Commercial Acceptance Checklist](../../product/v0.5.1-local-commercial-acceptance-checklist.md) — automated gate context
- [Stripe Local Development Guide](../../operations/stripe-local-development.md) — payment environment setup
- [v0.9 Repeatable Delivery Execution Plan](../../product/v0.9-repeatable-delivery-execution-plan.md) — delivery infrastructure scope
- [Product Roadmap](../../product/product-roadmap.md) — version scope and primary questions

## 8. Evidence hierarchy

No lower layer may be reported as satisfying a higher layer. Each run record
must declare its evidence layer.

```text
contract/integration test       unit and integration tests (e.g., v05-journey.test.ts)
API business walkthrough         automated multi-role API journey (run-business-walkthrough.mjs)
automated browser E2E            real UI actions through a browser automation tool
manual device/provider acceptance  manual testing on real devices with real providers
real-customer release evidence   production customer cohort data and metrics
```

Layer relationships:

- Contract/integration tests prove code correctness but not UI or interaction.
- API walkthrough proves API-level business flows but not UI discoverability,
  visual feedback, or Service Worker behavior.
- Automated browser E2E proves UI interaction but may not cover real provider
  delivery (Stripe, Web Push) or real device behavior.
- Manual device/provider acceptance proves real-world delivery but is not
- repeatable on every PR.
- Real-customer release evidence proves production repeatability and is the
  binding gate for v0.9 completion.
