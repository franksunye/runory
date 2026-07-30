# Test Case 05 — Mobile Field Work

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Priority | P1 |
| Primary role | Field Technician |
| Surface | Mobile browser (Chrome mobile emulation) |
| Prerequisite | [00 — Environment Setup](./00-test-environment-setup.md), [01 — FSM Owner Happy Path](./01-fsm-owner-happy-path.md) |

## 1. Purpose

Verify that a Field Technician can complete the canonical on-site execution
journey entirely through the mobile `/m` surface — from PWA install and
workspace entry through Today triage, Work Order context, Visit lifecycle,
execution form submission, and Visit completion — without leaving the mobile
UI, calling APIs directly, or using desktop-only management surfaces.

This is the primary field-execution acceptance run. It answers:

> Can a technician in the field receive dispatched work, execute it through
> the supported mobile UI, and leave behind immutable, auditable evidence?

## 2. Scope

### 2.1 What this run proves

- The mobile PWA is installable and launchable from a Chrome mobile emulator.
- A Field Technician can sign in and enter an assigned workspace at `/m`.
- The Today list surfaces only work assigned to the technician.
- Work Order detail provides context (Customer, Site, Asset) without
  exposing desktop-only management controls.
- The Visit lifecycle advances only through named business actions:
  `Start travel` → `Arrive on site` → `Submit work` → `Complete visit`.
- The execution form captures checklist items, readings, evidence photos,
  and a signature, and a submitted form is immutable/versioned.
- Bottom navigation is assembled dynamically from installed Packs and is
  consistent with installed capabilities.
- Offline / weak-network behavior degrades safely and reconciles on
  reconnect.
- Desktop administrative functions are not reachable from the mobile surface.

### 2.2 What this run does not prove

- Desktop happy-path completeness (see test case 01).
- Quote creation or approval (see test case 02).
- Invoice issuance and payment (see test case 03).
- Customer portal access (see test case 04).
- PWA push notifications and background sync (see test case 06).
- Least-privilege boundaries for every role (see test case 07).

## 3. Preconditions

- [ ] Dev server running at `http://localhost:3000`
- [ ] Demo workspace created with CRM Lite, Sales Quote, and FSM Packs
      installed (so the bottom navigation reflects all contributing Packs)
- [ ] A Field Technician user exists with role `field_technician` and a valid
      assignment to a planned Work Order/Visit (produced by test case 01 or a
      fresh dispatch)
- [ ] Service Worker registration endpoint `/sw.js` is reachable (scope `/`)
- [ ] PWA manifest `/manifest.json` is reachable (`start_url=/app`, `scope=/`)
- [ ] Chrome with mobile device emulation (iPhone 12 or Pixel 5 profile)
- [ ] Desktop owner/supervisor session available in a separate profile for
      cross-surface verification only (not used to drive the mobile flow)

## 4. Test data

```text
Run ID: MOBILE-<YYYYMMDD>-<HHMM>
Technician login: David Park (or seeded field_technician user)
Technician role: field_technician
Technician permissions: visit.execute, assignment.respond,
                        forms.submission.edit, forms.submission.submit

Workspace slug: <demo-workspace-slug>
Customer: Acme Operations (or seeded demo customer)
Service Site: Acme Warehouse - Oakland
Asset: Warehouse HVAC Unit
Work Order: <Run ID> Preventive HVAC inspection
Service Visit: <Run ID> On-site inspection
Form submission note: <Run ID> checklist completed on site
Completion reason: <Run ID> Required inspection completed

Mobile device profile: iPhone 12 or Pixel 5 (Chrome DevTools emulation)
```

## 5. Mobile route reference

```text
/m                                          Mobile entry (workspace pick / sign-in)
/m/account                                  Account (workspace, language, notifications, about)
/m/w/[workspaceId]                          Today list (mobile home)
/m/w/[workspaceId]/customers                Customers
/m/w/[workspaceId]/schedule                 Schedule
/m/w/[workspaceId]/quotes                   Quotes
/m/w/[workspaceId]/work-orders              Work Orders
/m/w/[workspaceId]/work-orders/[workOrderId] Work Order detail
/m/w/[workspaceId]/visits/[visitId]         Visit detail
/m/w/[workspaceId]/work/[workItemId]        Work item detail
/m/w/[workspaceId]/work/[workItemId]/form   Work item execution form
/m/w/[workspaceId]/explore                  Explore (overflow from bottom tabs)
```

Bottom navigation is assembled dynamically from installed Packs'
`mobileNavigation` contributions:

| Pack | Contributes |
| --- | --- |
| CRM Lite | Customers |
| Sales Quote | Quotes |
| FSM | Schedule, Work Orders |

The bar shows the first three main tabs plus `Explore` and `Me`. All users see
the same navigation regardless of role; the API layer enforces permissions.

## 6. Execution procedure

### Stage 0 — Establish the mobile baseline

1. Open Chrome DevTools and enable mobile device emulation (iPhone 12 or
   Pixel 5).
2. Navigate to `http://localhost:3000/m`.
3. Confirm the page renders a mobile-first layout (no horizontal scroll, tap
   targets ≥ 44px, viewport meta applied).
4. Confirm the Service Worker registers: in DevTools → Application → Service
   Workers, `/sw.js` shows `activated and is running` with scope `/`.

**Expected:**

- `/m` loads the mobile entry (workspace selection or sign-in) without desktop
  chrome.
- No console errors on initial load.
- `/sw.js` and `/manifest.json` are served with HTTP 200.

**Fail when:** Mobile layout renders as the desktop shell; Service Worker fails
to register; manifest returns 404 or invalid JSON.

### Stage 1 — Verify PWA installability

1. With mobile emulation active, open `/m`.
2. In DevTools → Application → Manifest, confirm the manifest is detected and
   parsed (`start_url=/app`, `scope=/`, name and icons present).
3. Confirm the installability criteria are met (Service Worker with a `fetch`
   handler, valid manifest, served over HTTP on localhost).
4. (If supported in the emulator) trigger `Install` from the browser UI or use
   `chrome://apps` / the beforeinstallprompt event to confirm installability.

**Expected:**

- The manifest validates with `start_url=/app` and `scope=/`.
- Icons include at least one 192px and one 512px PNG.
- The Service Worker controls `/` and intercepts `fetch` events.
- The app is reported as installable (no `no-installable` reason).

**Fail when:** Manifest is missing required fields; Service Worker scope does
not cover `/`; installability criteria are not satisfied on the mobile entry.

### Stage 2 — Sign in and enter the workspace

1. On `/m`, sign in as the Field Technician (David Park).
2. If multiple workspaces are available, select the demo workspace.
3. Confirm the app navigates to `/m/w/[workspaceId]` (the Today list).
4. Open `/m/account` and confirm the account page shows the workspace name,
   language switcher, notification settings, and an `About` section.

**Expected:**

- Sign-in succeeds and the session is established for the technician identity.
- The technician lands on `/m/w/[workspaceId]` (Today), not a desktop route.
- `/m/account` shows workspace info and settings but no admin/management
  actions outside the technician's permissions.
- The current identity is understandable without developer tools.

**Fail when:** Sign-in redirects to a desktop route; the workspace selector is
absent or broken; the account page exposes administrative controls (member
management, billing, Pack installation).

### Stage 3 — Today list shows assigned work

1. On `/m/w/[workspaceId]`, review the Today list.
2. Locate the Visit/Work Order assigned for this run.
3. Confirm each item shows: title, Customer, Site, scheduled time, and a
   lifecycle status (e.g. `scheduled`).
4. Tap an item to navigate to its detail.

**Expected:**

- The Today list surfaces work assigned to the signed-in technician only.
- Items are ordered by scheduled time and are tappable.
- Status, Customer, and Site are shown as names, not raw IDs.
- Tapping a Work Order navigates to
  `/m/w/[workspaceId]/work-orders/[workOrderId]`.
- Tapping a Visit navigates to `/m/w/[workspaceId]/visits/[visitId]`.

**Fail when:** The list shows other technicians' work; items are not tappable;
related records are shown as raw IDs; the list is empty despite a valid
assignment.

### Stage 4 — Bottom navigation switching

1. From the Today list, tap each bottom navigation tab in turn:
   `Schedule`, `Work Orders`, `Customers`, `Quotes` (order depends on Pack
   contributions), `Explore`, and `Me`.
2. Confirm each tab navigates to its mobile route and renders a mobile
   layout.
3. Confirm `Explore` surfaces the overflow items not in the first three tabs.
4. Confirm `Me` opens `/m/account` (or equivalent account surface).

**Expected:**

- The bottom bar shows the first three main tabs (assembled from CRM, Sales
  Quote, and FSM `mobileNavigation` contributions) plus `Explore` and `Me`.
- Every tab navigates to a mobile route under `/m/w/[workspaceId]/...`.
- Navigation does not redirect to a desktop route.
- The active tab is visually indicated.
- `Explore` lists the overflow surfaces (e.g. the fourth main surface and any
  additional Pack contributions).

**Fail when:** A tab redirects to a desktop URL; the bar shows surfaces from
Packs that are not installed; `Explore` or `Me` is missing; the active tab is
not indicated.

### Stage 5 — Open Work Order detail for context

1. From the Today list or `Work Orders` tab, open the run's Work Order.
2. Review the detail: Customer, Contact, Service Site, Asset, originating
   Quote, assigned Technician, scheduled window, and Work Order status.
3. Confirm the linked Visit is reachable from the Work Order detail.

**Expected:**

- The Work Order detail shows Customer, Site, Asset, and assignment context as
  human-readable names.
- The linked Service Visit is reachable via a tap (deep link to
  `/m/w/[workspaceId]/visits/[visitId]`).
- Desktop-only management actions (Triage, Plan/Dispatch, Complete Work Order,
  Issue Invoice) are either absent or visibly disabled with a business-language
  explanation.
- No console errors; no broken related-record links.

**Fail when:** Required context (Customer/Site/Asset) is missing or shown as
raw IDs; desktop management actions are exposed and executable; the Visit link
is broken.

### Stage 6 — Open Visit detail

1. Open the Service Visit from the Work Order detail (or the Today list).
2. Confirm the Visit shows: status (`scheduled`), Customer, Site, Asset,
   assigned Technician, scheduled start/end, and the available lifecycle
   actions.
3. Confirm the bound execution work item / form is reachable.

**Expected:**

- Visit status is `scheduled` and the next action is `Start travel`.
- The Visit detail links to the Work Order and to the execution work item.
- The execution form entry point is visible and reachable from the Visit.
- No lifecycle action ahead of the current state is enabled (e.g. `Complete
  visit` is not enabled while `scheduled`).

**Fail when:** The Visit cannot be reached; the execution form entry is
missing; future-state actions are enabled prematurely.

### Stage 7 — Execute Visit lifecycle: Start travel and Arrive on site

1. From the Visit detail, tap `Start travel`.
2. Confirm the Visit status changes to `en_route` and a timeline event is
   recorded with actor and timestamp.
3. Tap `Arrive on site`.
4. Confirm the Visit status changes to `on_site` and the timeline records the
   arrival.

**Expected:**

- `Start travel` moves `scheduled → en_route` and records the actual travel
  start time.
- `Arrive on site` moves `en_route → on_site` and records the actual arrival
  time.
- Timeline events identify the technician actor and are human-readable.
- Cross-surface: the Work Order, Visit, and (desktop) Planning/My Work agree on
  the Visit status and times after a refresh.
- Repeating an action does not create duplicate timeline events.

**Fail when:** Lifecycle transitions are exposed as generic status edits;
actual time fields must be entered manually; status disagrees across surfaces
after refresh.

### Stage 8 — Complete the execution form

1. From the Visit detail, open the bound execution work item/form
   (`/m/w/[workspaceId]/work/[workItemId]/form`).
2. Complete every required checklist item.
3. Enter all required readings (numeric fields, units).
4. Attach the required evidence photo(s) using the device camera or file
   picker.
5. Add the Run ID note where a free-text field is available.
6. Capture the required signature.

**Expected:**

- Required vs optional fields are visually distinct.
- Draft answers persist across navigation and a manual page reload before
  submission.
- Photo attachments are captured/uploaded and preview inline.
- The signature capture is usable on a touch target.
- Numeric readings enforce their declared units and bounds.

**Fail when:** No execution form is bound to the Visit; required items can be
left blank without blocking submission; drafts are lost on reload; photo or
signature capture is unavailable on the mobile surface.

### Stage 9 — Submit the form and verify immutability

1. From the form, tap `Submit`.
2. Confirm the submission succeeds and the form is locked.
3. Attempt to edit a previously submitted field.
4. Reload the form page and confirm the submitted values are unchanged.
5. (If versioning is visible) confirm the submission is recorded as an
   immutable/versioned artifact.

**Expected:**

- `forms.submission.submit` locks the submission; fields become read-only.
- A second submit attempt is rejected or a no-op.
- Submitted values survive a reload and match what was entered.
- The submission is linked to the Visit, Work Order, Technician, and evidence.
- Editable state can only be changed through a governed amendment flow (if
  any), not by re-opening the same submission.

**Fail when:** A submitted form can be silently edited; submission does not
lock the fields; the submission is not linked to its evidence or Visit.

### Stage 10 — Submit work on the Visit

1. Return to the Visit detail.
2. Tap `Submit work`.
3. Confirm the Visit records the submitted work and that completion is still
  gated (Visit is not yet `completed`).

**Expected:**

- `visit.submit_work` records the submission but does not mark the Visit
  `completed`.
- The Visit detail indicates that required work has been submitted and the
  next action is `Complete visit`.
- Submitted-but-unaccepted required forms (if acceptance is required) block
  completion; accepted required work enables `Complete visit`.

**Fail when:** `Submit work` silently completes the Visit; completion is
allowed before required work is submitted and accepted.

### Stage 11 — Complete the Visit

1. From the Visit detail, tap `Complete visit`.
2. Confirm the Visit status changes to `completed`.
3. Confirm the actual end time is recorded automatically.
4. Open the Work Order detail and confirm the Visit is shown as completed.

**Expected:**

- `Complete visit` moves `on_site → completed` and records the actual end
  time.
- The service result/report is human-readable and linked to Work Order, Visit,
  Technician, Customer, Site, Asset, evidence, and completion time.
- Completion leaves no active assignment or schedule state pointing at the
  Visit as actionable.
- Cross-surface: the Work Order, Visit, Planning, and My Work agree that the
  Visit is `completed` after a refresh.

**Fail when:** A Visit with unsubmitted required work can be completed;
completion leaves an active assignment or schedule state; actual end time is
missing; surfaces disagree after refresh.

### Stage 12 — Offline / weak-network behavior

1. Open Chrome DevTools → Network and set the profile to `Offline` (or
   `Slow 3G`).
2. From the Today list, attempt to open an already-loaded Work Order or Visit.
3. Attempt a lifecycle transition (e.g. `Start travel` on a fresh Visit) while
   offline.
4. Re-enable the network and observe reconciliation.

**Expected:**

- Already-visited pages render from the Service Worker cache when offline.
- A lifecycle mutation attempted offline either queues for later submission or
  fails with a clear, business-language message — not a silent success or a
  raw stack trace.
- On reconnect, queued mutations reconcile to the correct Visit state without
  duplicates.
- Draft form answers are retained across the offline window.

**Fail when:** Offline navigation shows a blank page with no SW fallback; an
offline mutation appears to succeed but is not persisted; reconnect produces
duplicate timeline events or conflicting status; draft answers are lost.

### Stage 13 — Mobile does not expose desktop management functions

1. From the mobile surface, attempt to reach each of the following by direct
   URL entry (not just by tapping navigation):
   - `/w/<slug>/manage`
   - `/w/<slug>/members`
   - `/w/<slug>/billing`
   - `/w/<slug>/planning` (desktop dispatch board)
   - `/admin` (platform admin)
2. For each, confirm the mobile app does not render the desktop management UI
   in a usable, actionable form.
3. Attempt a desktop-only governed action via the mobile UI (e.g. Issue
   Invoice, Complete Work Order, Triage, Plan/Dispatch) and confirm it is
   absent or rejected by the API.

**Expected:**

- Desktop management surfaces are not rendered inside the mobile shell as
  actionable screens.
- Where a direct URL is entered, the app redirects to a mobile-appropriate
  surface or shows a clear message rather than a broken desktop layout.
- Desktop-only governed actions are not exposed on the mobile UI; if invoked,
  the API rejects them with a permission error for `field_technician`.

**Fail when:** A desktop management screen is fully usable from the mobile
surface; a governed desktop action (Issue Invoice, Complete Work Order,
Triage, Plan/Dispatch) is exposed and succeeds for a Field Technician.

## 7. DB Spot-check

Run these queries via `sqlite3 apps/cloud/data/runory.db -header -column` after
the corresponding stage completes. Compare the DB values against what the UI
shows. Any mismatch is a P1 finding.

### After Stage 7 — Start travel / Arrive on site

```sql
SELECT sv.status, sv.actual_start, sv.aggregate_version,
       al.action, al.created_at AS audited_at
FROM runory_business_service_visit sv
LEFT JOIN runory_runtime_audit_logs al
  ON al.workspace_id = sv.workspace_id
 AND al.entity_id = sv.id
 AND al.action = 'visit.arrive'
WHERE sv.id = '<visit-id>'
ORDER BY al.created_at DESC
LIMIT 1;
```

**Verify:** `sv.status = 'on_site'`; `sv.actual_start` is set (this is the
travel-start timestamp written by `Start travel` — `service_visit` stores no
separate arrival column); an audit row with `action = 'visit.arrive'` exists,
proving the arrival event was recorded in the timeline. Repeating an action
must not produce a second `visit.arrive` row for the same visit.

### After Stage 9 — Form submitted (immutability)

```sql
SELECT id, status, revision_number, submitted_by, submitted_at,
       work_item_id, subject_type, subject_id
FROM runory_runtime_form_submissions
WHERE id = '<submission-id>';
```

**Verify:** `status = 'submitted'` (the submission is locked — fields are
read-only); `submitted_at` and `submitted_by` are populated;
`revision_number = 1` for a first submission (amendments create a new row via
`supersedes_submission_id`, they never mutate this one); `subject_type =
'service_visit'` and `subject_id` is the Visit. A second submit on the same
row must be a no-op, not a value change.

### After Stage 11 — Complete Visit

```sql
SELECT sv.status, sv.actual_end, sv.aggregate_version,
       se.status AS schedule_status, se.updated_at AS schedule_updated_at
FROM runory_business_service_visit sv
LEFT JOIN runory_runtime_schedule_entries se
  ON se.workspace_id = sv.workspace_id AND se.id = sv.schedule_entry_id
WHERE sv.id = '<visit-id>';
```

**Verify:** `sv.status = 'completed'`; `sv.actual_end` is set (recorded
automatically, not entered manually); `se.status = 'completed'` — visit
completion cascades to the linked schedule entry, so no actionable schedule
state remains pointing at the Visit.

## 8. Cross-surface consistency matrix

Record observed values at the end of Stages 7, 10, and 11. Verify the mobile
surface against the desktop Owner/Supervisor session (read-only verification).

| Field | Mobile Today | Mobile Work Order | Mobile Visit | Desktop Planning | Desktop My Work | Work Order timeline |
| --- | --- | --- | --- | --- | --- | --- |
| Customer | | | | N/A | | |
| Site | | | | | N/A | |
| Asset | | | | N/A | N/A | |
| Technician | N/A | | | | | N/A |
| Scheduled time | | | | | | N/A |
| Visit status | N/A | | | | | |
| Actual travel start | N/A | N/A | | | | |
| Actual arrival | N/A | N/A | | | | |
| Actual end time | N/A | N/A | | | | |
| Form submission status | N/A | N/A | | N/A | | |
| Work Order status | | | N/A | | | |

Any unexplained disagreement between the mobile surface and the desktop
read-only verification is a failed run even when the Visit reaches `completed`.

## 9. Run record template

```markdown
### Mobile Field Work — <Run ID>

- Date/time:
- Reviewer:
- Branch/commit:
- Workspace slug/id:
- Mobile browser / device profile:
- Technician identity:
- Work Order id:
- Service Visit id:
- Work item / form submission id:

| Stage | Result | Evidence / observed behavior | Finding |
| --- | --- | --- | --- |
| 0. Mobile baseline | PASS / FAIL | | |
| 1. PWA installability | PASS / FAIL | | |
| 2. Sign in and enter workspace | PASS / FAIL | | |
| 3. Today list shows assigned work | PASS / FAIL | | |
| 4. Bottom navigation switching | PASS / FAIL | | |
| 5. Work Order detail context | PASS / FAIL | | |
| 6. Visit detail | PASS / FAIL | | |
| 7. Start travel / Arrive on site | PASS / FAIL | | |
| 8. Complete execution form | PASS / FAIL | | |
| 9. Submit form (immutability) | PASS / FAIL | | |
| 10. Submit work on Visit | PASS / FAIL | | |
| 11. Complete Visit | PASS / FAIL | | |
| 12. Offline / weak-network | PASS / FAIL | | |
| 13. No desktop management exposure | PASS / FAIL | | |
| Cross-surface consistency | PASS / FAIL | | |

Final decision: PASS / FAIL

Findings:

1. [P0/P1/P2/P3] <title>
   - Expected:
   - Actual:
   - Reproduction:
   - Affected record(s):
   - Owner / milestone:

Run integrity:
- No direct API/SQL mutation: YES / NO
- No identity switching beyond the documented technician session: YES / NO
- No reset during run: YES / NO
- Desktop session used for read-only verification only: YES / NO
```
