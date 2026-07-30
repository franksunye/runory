# Test Case 07 — Role Permission Boundaries

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Priority | P0 |
| Primary roles | All business roles + workspace admin/viewer |
| Surface | Desktop browser + Mobile browser |
| Prerequisite | [00 — Environment Setup](./00-test-environment-setup.md), records from [01 — FSM Owner Happy Path](./01-fsm-owner-happy-path.md) and [02 — Quote Commercial Loop](./02-quote-commercial-loop.md) |

## 1. Purpose

Verify Runory's three-layer role model and pack-level business permission groups
enforce least-privilege boundaries consistently across the desktop UI, the
mobile `/m` surface, and the API layer — without leaking governed actions to
unauthorized roles and without hiding authorized actions from the roles that
need them.

This is the permission-boundary acceptance run. It answers:

> Does every business role see exactly the navigation and actions its permission
> group grants — no more, no less — across desktop, mobile, and API?

## 2. Scope

### 2.1 What this run proves

- Each business permission group resolves to a bounded set of available
  actions and visible navigation on the desktop surface.
- Workspace admin short-circuits all permission checks (universal pass).
- A member with no permission groups also passes all checks (transition mode).
- The desktop navigation filters by module `presentation.audience` and by
  pack `workspaceSurfaces[].audience` resolved through
  `resolveWorkspaceSurfaces()`.
- `hidden` surfaces never appear (e.g. quote-approval).
- `management` surfaces are visible only to workspace admin/owner.
- `contextual` surfaces (e.g. service_visit, service_report) do not appear in
  top-level navigation.
- `top_level` surfaces are always visible.
- The mobile `/m` surface does not filter navigation by role — all roles see
  the same bottom navigation — and the API layer intercepts unauthorized
  actions through `requireBusinessPermission()`.
- Each role can perform its granted actions and is blocked from its
  non-granted actions at the API level.

### 2.2 What this run does not prove

- Full happy-path execution of the FSM loop (see test case 01).
- Quote commercial lifecycle depth (see test case 02).
- Invoice and payment completion (see test case 03).
- Mobile field execution quality (see test case 05).
- Customer portal external access (see test case 04).
- Cross-workspace tenant isolation (covered in test case 04, Stage 9).

## 3. Role model reference

Runory uses a three-layer role system. Business permission groups are
pack-level and are the primary mechanism for action-level authorization.

### 3.1 Organizational and workspace roles

```text
Organization roles:  owner > admin > member
Workspace roles:     admin > member > viewer
```

### 3.2 Business permission groups (pack-level)

| Permission group | Granted permissions |
| --- | --- |
| `workspace_administrator` | `*` (all permissions) |
| `dispatcher` | `work_order.triage`, `assignment.manage`, `schedule.manage`, `schedule.conflict.override`, `work_order.create`, `work_order.start` |
| `field_technician` | `visit.execute`, `assignment.respond`, `forms.submission.edit`, `forms.submission.submit` |
| `service_supervisor` | `work_order.complete`, `work_order.reopen`, `payment.refund`, `invoice.issue`, `invoice.void`, `forms.submission.review`, `workflow.approval.decide` |
| `sales_representative` | `quote.read`, `quote.create`, `quote.edit_draft`, `quote.submit`, `company.read`, `company.create`, `company.update`, `contact.read`, `contact.create`, `contact.update`, `deal.read`, `deal.create`, `deal.update`, `payment.view`, `payment.request` |
| `sales_manager` | `quote.*` (read, create, edit_draft, submit, approve, reject, accept, convert), `product_service.*` (all CRUD), `price_book.*` (all CRUD), `payment.refund`, `workflow.approval.decide`, `work_order.read` |
| `sales_viewer` | `company.read`, `contact.read`, `deal.read`, `task.read` |
| `voice_intake_operator` | `voice_intake.read`, `voice_intake.review` |

### 3.3 Permission resolution logic

```text
1. If the actor is a workspace admin  → PASS all permission checks.
2. Else if the actor is a member with NO permission groups → PASS all checks
   (transition mode, intended to avoid locking out early workspaces).
3. Else → resolve the actor's permission groups and check whether the set
   contains `*` or the specific permission required by the action.
```

### 3.4 Desktop navigation audience resolution

```text
Module level:    presentation.audience filters each navigation item.
Platform level:  resolveWorkspaceSurfaces() resolves my_work / planning /
                 activity per pack workspaceSurfaces[].audience.

Audience values:
  hidden      → never shown (e.g. quote-approval)
  management  → visible only to workspace admin / owner
  contextual  → never in top-level nav (e.g. service_visit, service_report)
  top_level   → always visible
```

### 3.5 Mobile navigation

```text
The /m surface does NOT filter navigation by role.
All roles see the same bottom navigation assembled from installed Packs.
Permission differences are enforced only at the API layer through
requireBusinessPermission().
```

## 4. Preconditions

- [ ] Dev server running at `http://localhost:3000`
- [ ] Demo workspace created with CRM Lite, Sales Quote, and FSM Packs
      installed
- [ ] At least one Price Book with seeded items exists (or is created during
      the run)
- [ ] Test users provisioned with each business permission group assigned:
  - User A: `sales_representative`
  - User B: `sales_manager`
  - User C: `dispatcher`
  - User D: `field_technician`
  - User E: `service_supervisor`
  - User F: `sales_viewer`
  - User G: workspace `viewer` (no business permission group)
  - User H: workspace `member` with NO permission groups (transition mode)
  - User I: workspace `admin` (no specific business group — tests admin
    short-circuit)
- [ ] Owner identity available for seed data and cross-surface verification
- [ ] A Quote in `sent` status and a Work Order in `planned` or
      `in_progress` status exist (from test case 01 or 02) to exercise
      boundary actions against real records
- [ ] An Invoice in `issued` status exists for refund/void testing
- [ ] Chrome with mobile device emulation available for Stage 9

## 5. Test data

```text
Run ID: ROLE-<YYYYMMDD>-<HHMM>

Workspace slug/id: <demo-workspace-slug>

Test users (one per role):
  User A — sales_representative
  User B — sales_manager
  User C — dispatcher
  User D — field_technician
  User E — service_supervisor
  User F — sales_viewer
  User G — workspace viewer (no business group)
  User H — workspace member, no permission groups (transition mode)
  User I — workspace admin (no business group)

Seed records (created by Owner before the run):
  Quote (draft):      <Run ID> Boundary-test quote
  Quote (sent):       <quote-sent-id>
  Work Order (planned): <work-order-planned-id>
  Work Order (in_progress): <work-order-progress-id>
  Invoice (issued):   <invoice-issued-id>
  Service Visit (scheduled): <visit-scheduled-id>
  Price Book:         <price-book-id>

Note: each stage logs in as a different user. Record the observed behavior
for that user only. Do not leave one user logged in while testing another.
```

## 6. Execution procedure

### Stage 0 — Establish role identities and baseline

1. Log in as Owner.
2. Open the workspace member/role management area and confirm each test user
   (A–I) exists with the intended permission group assignment.
3. Confirm the seed records (Quote, Work Order, Invoice, Visit, Price Book)
   exist and are in the expected status.
4. Log out.

**Expected:**

- All nine test users are visible with their assigned roles.
- Seed records are in the correct status for boundary testing.
- No permission group is accidentally assigned to a user who should not have
  it.

**Fail when:** A test user is missing, has the wrong permission group, or a
seed record is in the wrong status.

### Stage 1 — Sales Representative: create and submit, cannot approve

1. Log in as User A (`sales_representative`).
2. Navigate to Quotes. Confirm the Create action is visible.
3. Create a Quote titled `<Run ID> Boundary-test quote` with at least one
   line item. Save as draft.
4. Edit the draft (change a quantity). Save. Confirm the edit succeeds.
5. Choose `Submit for approval`. Confirm the status moves to `review`.
6. On the submitted Quote, look for an `Approve` action.

**Expected:**

- `quote.create` succeeds and the Quote is saved as `draft`.
- `quote.edit_draft` succeeds while the Quote is in `draft`.
- `quote.submit` moves `draft → review`.
- The `Approve` action is not visible or is disabled for
  `sales_representative`.
- The Sales Rep cannot approve their own submitted Quote by any UI path.
- CRM record actions (`company.create`, `contact.update`, `deal.create`) are
  available.
- `payment.request` is available; `payment.refund` is not.

**Fail when:** A Sales Representative can approve a Quote (P0); the Rep
cannot create or submit a Quote; CRM create/update actions are missing.

### Stage 2 — Sales Manager: approve, reject, accept, convert, manage price book

1. Log in as User B (`sales_manager`).
2. Navigate to Quotes. Open the Quote submitted by User A in Stage 1.
3. Choose `Approve`. Confirm the status moves to `approved`.
4. Create a second Quote, submit it, then choose `Reject`. Confirm the
   status moves to `rejected`.
5. On the approved Quote, choose `Send`, then `Accept`. Confirm
   `approved → sent → accepted`.
6. From the accepted Quote, choose `Convert to Work Order`. Confirm a Work
   Order is created.
7. Navigate to Price Books. Create a new Price Book item. Edit it. Delete it.
8. Navigate to Products/Services. Confirm full CRUD is available.
9. Attempt `payment.refund` on the issued Invoice. Confirm it is available.

**Expected:**

- `quote.approve`, `quote.reject`, `quote.accept`, and `quote.convert` all
  succeed for `sales_manager`.
- Price Book and Product/Service CRUD (`price_book.*`, `product_service.*`)
  succeeds.
- `payment.refund` is available.
- `workflow.approval.decide` is available.
- `work_order.read` allows viewing Work Orders but the Sales Manager cannot
  triage, start, or complete them (those are not in the group).

**Fail when:** A Sales Manager cannot approve/reject/accept/convert; price
book or product CRUD fails; the Manager can triage or complete a Work Order
(P1, over-grant).

### Stage 3 — Dispatcher: triage, schedule, conflict override, cannot complete

1. Log in as User C (`dispatcher`).
2. Navigate to Work Orders. Open a Work Order in `new` status.
3. Choose `Triage`. Confirm the status moves to `triaged`.
4. Create a new Work Order (`work_order.create`). Confirm it is created.
5. From a triaged Work Order, assign a Technician and create a Schedule
   (`assignment.manage`, `schedule.manage`). Confirm both succeed.
6. Attempt to override a scheduling conflict (`schedule.conflict.override`).
   Confirm the override succeeds.
7. Start a Work Order (`work_order.start`). Confirm the transition.
8. Attempt `Complete` on an in_progress Work Order.

**Expected:**

- `work_order.triage`, `work_order.create`, `work_order.start` all succeed.
- `assignment.manage` and `schedule.manage` succeed.
- `schedule.conflict.override` succeeds.
- The `Complete` action is not visible or is disabled for `dispatcher`.
- `payment.refund`, `invoice.issue`, and `quote.approve` are not available.

**Fail when:** A Dispatcher can complete a Work Order (P0); triage, schedule,
or conflict override fails; the Dispatcher can issue invoices or approve
quotes (P1).

### Stage 4 — Field Technician: execute visit, submit forms, cannot create or triage

1. Log in as User D (`field_technician`).
2. Navigate to the assigned Service Visit (the one dispatched in Stage 3 or
   seeded).
3. Choose `Start travel`, then `Arrive on site`. Confirm both transitions
   succeed (`visit.execute`).
4. Open the bound execution form. Complete required items and submit
   (`forms.submission.edit`, `forms.submission.submit`). Confirm the
   submission is locked.
5. Respond to the assignment (`assignment.respond`). Confirm it succeeds.
6. Navigate to Work Orders. Attempt to create a new Work Order.
7. Attempt to triage an existing Work Order.

**Expected:**

- `visit.execute` allows the Visit lifecycle transitions.
- `forms.submission.edit` and `forms.submission.submit` succeed and lock the
  form.
- `assignment.respond` succeeds.
- `work_order.create` is not available — the Create action is absent or
  disabled.
- `work_order.triage` is not available.
- The Field Technician cannot issue invoices, approve quotes, or refund
  payments.

**Fail when:** A Field Technician can create or triage a Work Order (P0);
visit execution or form submission fails; the technician can access financial
actions (P1).

### Stage 5 — Service Supervisor: complete, reopen, refund, invoice, review forms

1. Log in as User E (`service_supervisor`).
2. Open an in_progress Work Order (seeded or from Stage 3). Attempt
   `Complete`. Confirm the transition succeeds.
3. On the completed Work Order, attempt `Reopen`. Confirm the transition
   back.
4. Navigate to Invoices. On the issued Invoice, attempt `Issue` (on a draft)
   and `Void` (on an issued one). Confirm both succeed.
5. Attempt `payment.refund` on a paid Invoice. Confirm it succeeds.
6. Open a submitted form. Attempt `forms.submission.review`. Confirm the
   review action succeeds.
7. Attempt `workflow.approval.decide` on a pending approval. Confirm it
   succeeds.

**Expected:**

- `work_order.complete` and `work_order.reopen` both succeed.
- `invoice.issue` and `invoice.void` succeed.
- `payment.refund` succeeds.
- `forms.submission.review` succeeds.
- `workflow.approval.decide` succeeds.
- The Supervisor cannot triage, create Work Orders, or approve/convert
  Quotes (not in the group).

**Fail when:** A Service Supervisor cannot complete or reopen a Work Order;
invoice issue/void or refund fails; the Supervisor can triage or approve
quotes (P1, over-grant).

### Stage 6 — Sales Viewer: read-only CRM, cannot create or edit

1. Log in as User F (`sales_viewer`).
2. Navigate to Companies. Confirm the list loads and records are readable.
3. Open a Company detail. Confirm all fields are visible.
4. Navigate to Contacts and Deals. Confirm both are readable.
5. Navigate to Tasks. Confirm tasks are readable.
6. Attempt to create a Company, Contact, or Deal.
7. Attempt to edit an existing Company or Contact.

**Expected:**

- `company.read`, `contact.read`, `deal.read`, and `task.read` all succeed.
- All create and update actions are absent or disabled.
- The Sales Viewer cannot see Quotes, Work Orders, Invoices, or Payments
  (no permissions for those modules).
- No governed mutation action is available.

**Fail when:** A Sales Viewer can create or edit any CRM record (P0); read
access fails for companies, contacts, deals, or tasks.

### Stage 7 — Workspace Viewer: read-only workspace

1. Log in as User G (workspace `viewer`, no business permission group).
2. Navigate the desktop workspace shell.
3. Open Quotes, Work Orders, Invoices, and Customers (where visible).
4. Attempt any create, edit, submit, or status-transition action.

**Expected:**

- The Viewer can navigate and read records that are visible by audience
  resolution.
- No governed action (create, edit, submit, approve, triage, complete,
  issue, refund) is available.
- `management` surfaces (members, billing, Pack management) are not visible.
- The Viewer cannot mutate any business record.

**Fail when:** A workspace Viewer can perform any governed mutation (P0);
management surfaces are visible to a Viewer (P1).

### Stage 8 — Desktop navigation visibility by role

This stage verifies that `resolveWorkspaceSurfaces()` and module
`presentation.audience` filter the desktop navigation correctly per role. For
each user, log in and record which top-level navigation items appear.

1. For each test user (A–I), log in and navigate to the desktop workspace
   shell.
2. Record the visible top-level navigation items.
3. Specifically verify:
   - `hidden` surfaces (e.g. quote-approval) never appear for any role.
   - `management` surfaces (e.g. members, billing, settings) appear only for
     workspace admin (User I) and Owner — not for members or viewers.
   - `contextual` surfaces (e.g. service_visit, service_report) do not
     appear in the top-level navigation for any role; they are reachable
     only from within their parent record.
   - `top_level` surfaces (e.g. quotes, work-orders, customers) are always
     visible when the Pack is installed and the module audience allows it.

**Expected:**

- Each role sees a navigation set consistent with its permission group and
  the audience rules.
- `hidden` surfaces are never visible.
- `management` surfaces are restricted to admin/owner.
- `contextual` surfaces are absent from top-level nav for all roles.
- `top_level` surfaces are visible to roles whose permission group grants at
  least read access to the module.
- Workspace admin (User I) sees `management` surfaces.
- Workspace viewer (User G) does not see `management` surfaces.

**Fail when:** A `hidden` surface is visible (P1); a `management` surface is
visible to a non-admin/owner (P1); a `contextual` surface appears in top-level
nav (P2); a role with read access cannot see its `top_level` surface (P1);
the navigation does not change between roles at all (P0, filtering is broken).

### Stage 9 — Mobile navigation parity and API permission interception

This stage verifies that the mobile `/m` surface shows the same navigation to
all roles (no client-side filtering) and that the API layer intercepts
unauthorized actions through `requireBusinessPermission()`.

1. Enable Chrome mobile device emulation (iPhone 12 or Pixel 5).
2. Log in as User D (`field_technician`) on `/m`.
3. Record the bottom navigation tabs. Confirm all installed Pack surfaces
   are visible (Customers, Quotes, Schedule, Work Orders, Explore, Me).
4. Log out and log in as User F (`sales_viewer`) on `/m`.
5. Record the bottom navigation tabs. Confirm they are identical to User D's
   navigation (no role-based filtering on mobile).
6. As User F (`sales_viewer`), navigate to Work Orders via the bottom tab.
7. Attempt to trigger a governed action that `sales_viewer` does not have
   (e.g. tap a triage or create action if the UI exposes it, or attempt a
   direct API call from the browser console):
   ```text
   POST /api/workspaces/<workspaceId>/work-orders
   ```
8. Confirm the API rejects the request with a permission error.
9. Log in as User A (`sales_representative`) on `/m`.
10. Attempt to call an API endpoint that requires `quote.approve` (which the
    Rep does not have):
    ```text
    POST /api/workspaces/<workspaceId>/quotes/<quoteId>/approve
    ```
11. Confirm the API rejects the request with a `403` permission error.

**Expected:**

- The mobile bottom navigation is identical across roles — no client-side
  role filtering on `/m`.
- The API layer enforces permissions regardless of what the mobile UI exposes.
- `requireBusinessPermission()` rejects unauthorized actions with a clear
  `403` error, not a silent success or a `500`.
- The error response does not leak the internal permission key beyond what is
  necessary for debugging.

**Fail when:** The mobile navigation differs by role (P1, premature
filtering); an unauthorized API call succeeds (P0); the API returns a
server error instead of a permission denial (P1); the denial leaks
sensitive internal state (P2).

### Stage 10 — Permission resolution edge cases

This stage verifies the two short-circuit paths in the permission resolution
logic.

#### 10a — Workspace admin short-circuits all checks

1. Log in as User I (workspace `admin`, no business permission group).
2. Navigate to Quotes. Attempt to approve a submitted Quote.
3. Navigate to Work Orders. Attempt to triage and complete.
4. Navigate to Invoices. Attempt to issue and void.
5. Attempt `payment.refund`.

**Expected:**

- User I passes all permission checks despite having no specific business
  permission group, because workspace admin short-circuits the check.
- All governed actions are available.
- `management` surfaces are visible.

**Fail when:** A workspace admin is blocked from any governed action (P0);
the admin short-circuit does not apply.

#### 10b — Member with no permission groups passes (transition mode)

1. Log in as User H (workspace `member`, no permission groups).
2. Navigate to Quotes. Attempt to create and submit.
3. Navigate to Work Orders. Attempt to triage and complete.
4. Navigate to Invoices. Attempt to issue.

**Expected:**

- User H passes all permission checks because the member has no permission
  groups (transition mode).
- All governed actions are available.
- `management` surfaces are NOT visible (User H is a member, not admin).

**Fail when:** A member with no permission groups is blocked from governed
actions (P1, transition mode broken); management surfaces are visible to a
plain member (P1).

## 7. DB Spot-check

Run these queries via `sqlite3 apps/cloud/data/runory.db -header -column` after
the corresponding stage completes. Compare the DB values against what the UI
shows. Any mismatch is a P1 finding.

### After Stage 1 — Sales Rep boundary (submit succeeds, approve blocked)

```sql
SELECT q.status, q.aggregate_version,
       (SELECT COUNT(*) FROM runory_runtime_audit_logs
        WHERE workspace_id = q.workspace_id AND entity_type = 'quote'
          AND entity_id = q.id AND actor_id = '<sales-rep-user-id>'
          AND action = 'quote.submit_for_approval') AS submit_audit,
       (SELECT COUNT(*) FROM runory_runtime_audit_logs
        WHERE workspace_id = q.workspace_id AND entity_type = 'quote'
          AND entity_id = q.id AND actor_id = '<sales-rep-user-id>'
          AND action = 'quote.approve') AS approve_audit
FROM runory_business_quote q
WHERE id = '<boundary-quote-id>';
```

**Verify:** `status = review`; `submit_audit = 1` (the Sales Rep is the
recorded actor of the submit); `approve_audit = 0` (the Rep never produced a
`quote.approve` audit entry — the boundary held at the DB layer, not just the
UI).

### After Stage 3 — Dispatcher boundary (triage, start, assign, schedule)

```sql
SELECT wo.status, wo.aggregate_version,
       (SELECT COUNT(*) FROM runory_runtime_audit_logs
        WHERE workspace_id = wo.workspace_id AND entity_type = 'work_order'
          AND entity_id = wo.id AND action = 'work_order.triage') AS triage_audit,
       (SELECT COUNT(*) FROM runory_runtime_audit_logs
        WHERE workspace_id = wo.workspace_id AND entity_type = 'work_order'
          AND entity_id = wo.id AND action = 'work_order.start') AS start_audit,
       (SELECT COUNT(*) FROM runory_runtime_assignments
        WHERE workspace_id = wo.workspace_id AND subject_type = 'work_order'
          AND subject_id = wo.id) AS assignment_count,
       (SELECT COUNT(*) FROM runory_runtime_schedule_entries
        WHERE workspace_id = wo.workspace_id AND subject_type = 'work_order'
          AND subject_id = wo.id) AS schedule_count
FROM runory_business_work_order wo
WHERE id = '<dispatcher-work-order-id>';
```

**Verify:** `status = in_progress` (it passed through `triaged` then started);
`triage_audit >= 1` and `start_audit >= 1` (actor = Dispatcher);
`assignment_count >= 1` and `schedule_count >= 1` (both the assignment and the
schedule entry were persisted). Any zero count means the Dispatcher action did
not reach the DB.

### After Stage 5 — Service Supervisor boundary (complete, reopen, invoice void)

```sql
SELECT wo.status AS wo_status, wo.completion_reason, wo.reopen_reason,
       (SELECT COUNT(*) FROM runory_runtime_audit_logs
        WHERE workspace_id = wo.workspace_id AND entity_type = 'work_order'
          AND entity_id = wo.id
          AND action IN ('work_order.complete', 'work_order.reopen')) AS wo_audit,
       (SELECT status FROM runory_business_invoice
        WHERE id = '<supervisor-invoice-id>') AS invoice_status,
       (SELECT COUNT(*) FROM runory_runtime_audit_logs
        WHERE entity_type = 'invoice' AND entity_id = '<supervisor-invoice-id>'
          AND action = 'invoice.void') AS invoice_void_audit
FROM runory_business_work_order wo
WHERE wo.id = '<supervisor-work-order-id>';
```

**Verify:** `wo_status = reopened` (it passed through `completed` then back);
`completion_reason` is still populated from the original completion (reopening
must not erase it); `wo_audit >= 2` (complete + reopen); `invoice_status = void`
(the DB stores `void`, which the UI labels "voided"); `invoice_void_audit = 1`.

### After Stage 10b — Transition mode (member with no permission groups can act)

```sql
SELECT command_type, aggregate_type, status, created_at
FROM runory_runtime_command_executions
WHERE workspace_id = '<workspace-id>' AND actor_id = '<member-no-group-user-id>'
ORDER BY created_at DESC LIMIT 10;
```

**Verify:** rows are returned (the member with no permission groups executed
governed commands through transition mode); each row's `status = succeeded`.
No rows means transition mode granted access in the UI but never reached the
command-execution layer — a P1 finding.

## 8. Permission boundary matrix

Record the observed availability of each action per role. Use:
`YES` = action available and succeeds; `NO` = action absent or API rejects;
`ADMIN` = passes via admin short-circuit; `TRANSITION` = passes via
transition mode (no permission groups).

| Action | Permission | sales_rep | sales_mgr | dispatcher | field_tech | service_sup | sales_viewer | viewer (G) | member no-group (H) | admin (I) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| quote.create | `quote.create` | | | | | | | | | |
| quote.edit_draft | `quote.edit_draft` | | | | | | | | | |
| quote.submit | `quote.submit` | | | | | | | | | |
| quote.approve | `quote.approve` | | | | | | | | | |
| quote.reject | `quote.reject` | | | | | | | | | |
| quote.accept | `quote.accept` | | | | | | | | | |
| quote.convert | `quote.convert` | | | | | | | | | |
| price_book.create | `price_book.*` | | | | | | | | | |
| product_service.update | `product_service.*` | | | | | | | | | |
| work_order.create | `work_order.create` | | | | | | | | | |
| work_order.triage | `work_order.triage` | | | | | | | | | |
| work_order.start | `work_order.start` | | | | | | | | | |
| work_order.complete | `work_order.complete` | | | | | | | | | |
| work_order.reopen | `work_order.reopen` | | | | | | | | | |
| assignment.manage | `assignment.manage` | | | | | | | | | |
| assignment.respond | `assignment.respond` | | | | | | | | | |
| schedule.manage | `schedule.manage` | | | | | | | | | |
| schedule.conflict.override | `schedule.conflict.override` | | | | | | | | | |
| visit.execute | `visit.execute` | | | | | | | | | |
| forms.submission.edit | `forms.submission.edit` | | | | | | | | | |
| forms.submission.submit | `forms.submission.submit` | | | | | | | | | |
| forms.submission.review | `forms.submission.review` | | | | | | | | | |
| invoice.issue | `invoice.issue` | | | | | | | | | |
| invoice.void | `invoice.void` | | | | | | | | | |
| payment.request | `payment.request` | | | | | | | | | |
| payment.refund | `payment.refund` | | | | | | | | | |
| payment.view | `payment.view` | | | | | | | | | |
| company.read | `company.read` | | | | | | | | | |
| company.create | `company.create` | | | | | | | | | |
| workflow.approval.decide | `workflow.approval.decide` | | | | | | | | | |
| voice_intake.review | `voice_intake.review` | | | | | | | | | |

Any cell where the observed result disagrees with the permission group
definition is a failed run. Over-grants (action available to a role that
should not have it) are P0/P1 depending on severity; under-grants (action
missing from a role that should have it) are P1.

## 9. Desktop navigation visibility matrix

Record which top-level navigation items are visible per role. Use:
`V` = visible; `H` = hidden (absent); `M` = visible only to admin/owner.

| Navigation surface | Audience | sales_rep | sales_mgr | dispatcher | field_tech | service_sup | sales_viewer | viewer (G) | member no-group (H) | admin (I) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Quotes | top_level | | | | | | | | | |
| Work Orders | top_level | | | | | | | | | |
| Customers | top_level | | | | | | | | | |
| Schedule / Planning | top_level | | | | | | | | | |
| Invoices | top_level | | | | | | | | | |
| Members | management | | | | | | | | | |
| Billing | management | | | | | | | | | |
| Settings | management | | | | | | | | | |
| Quote Approval | hidden | | | | | | | | | |
| Service Visit | contextual | | | | | | | | | |
| Service Report | contextual | | | | | | | | | |

**Expected rules:**

- `hidden` surfaces show `H` for every role.
- `management` surfaces show `V` only for admin (I) and Owner; `H` for all
  others.
- `contextual` surfaces show `H` in top-level nav for every role (they are
  reachable only from within a parent record).
- `top_level` surfaces show `V` for roles whose permission group grants read
  access to the module; `H` for roles with no access.

## 10. Run record template

```markdown
### Role Permission Boundaries — <Run ID>

- Date/time:
- Reviewer:
- Branch/commit:
- Workspace slug/id:
- Browser (desktop):
- Mobile browser / device profile:
- Test users verified: A B C D E F G H I

| Stage | Result | Evidence / observed behavior | Finding |
| --- | --- | --- | --- |
| 0. Role identities and baseline | PASS / FAIL | | |
| 1. Sales Rep boundary | PASS / FAIL | | |
| 2. Sales Manager boundary | PASS / FAIL | | |
| 3. Dispatcher boundary | PASS / FAIL | | |
| 4. Field Technician boundary | PASS / FAIL | | |
| 5. Service Supervisor boundary | PASS / FAIL | | |
| 6. Sales Viewer boundary | PASS / FAIL | | |
| 7. Workspace Viewer boundary | PASS / FAIL | | |
| 8. Desktop navigation visibility | PASS / FAIL | | |
| 9. Mobile nav parity + API interception | PASS / FAIL | | |
| 10a. Admin short-circuit | PASS / FAIL | | |
| 10b. Member transition mode | PASS / FAIL | | |
| Permission boundary matrix | PASS / FAIL | | |
| Desktop navigation matrix | PASS / FAIL | | |

Final decision: PASS / FAIL

Findings:

1. [P0/P1/P2/P3] <title>
   - Expected:
   - Actual:
   - Reproduction:
   - Role / permission group:
   - Owner / milestone:

Run integrity:
- No direct API/SQL mutation: YES / NO
- Identity switches documented: YES / NO
- No reset during run: YES / NO
- API interception tested on mobile: YES / NO
```
