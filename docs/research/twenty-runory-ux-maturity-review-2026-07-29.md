# Twenty and Runory UX Maturity Review

| Metadata | Value |
| --- | --- |
| Status | `evidence` |
| Topic | `architecture` |
| Applies to | `v0.8.x` UI refinement and later Product Surface work |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-29 |
| Observation source | Authenticated Twenty Cloud and local Runory workspace, desktop viewport |
| Binding decision | [Runory UI Surface Technical Decision and Standards](../architecture/v0.8-ui-surface-technical-decision.md) |
| Supersedes | — |
| Superseded by | — |

## 1. Purpose

This is a visual and interaction maturity review, not a request to reproduce
Twenty. It compares representative business and administration surfaces —
list, record detail, settings, navigation/menu, data model, members/access, and
technical operations — and identifies bounded refinements that make
Runory feel calmer, more coherent, and more trustworthy as an enterprise
application.

The review preserves Runory's existing View contracts, field renderer map,
Command boundaries, Tailwind stack, and domain-specific Workflow/FSM surfaces.
It does not admit a new UI runtime, table framework, state manager, inline-edit
engine, or plugin-renderer system.

## 2. Captured evidence

### 2.1 List surfaces

| Twenty | Runory |
| --- | --- |
| ![Twenty company list](assets/twenty-runory-ux-review-2026-07-29/twenty-company-list.png) | ![Runory company list](assets/twenty-runory-ux-review-2026-07-29/runory-company-list.png) |

### 2.2 Record detail surfaces

| Twenty | Runory |
| --- | --- |
| ![Twenty company detail](assets/twenty-runory-ux-review-2026-07-29/twenty-company-detail.png) | ![Runory company detail](assets/twenty-runory-ux-review-2026-07-29/runory-company-detail.png) |

### 2.3 Settings surfaces

| Twenty | Runory |
| --- | --- |
| ![Twenty profile settings](assets/twenty-runory-ux-review-2026-07-29/twenty-settings-profile.png) | ![Runory workspace settings](assets/twenty-runory-ux-review-2026-07-29/runory-workspace-settings.png) |

### 2.4 Menus and navigation

| Twenty account menu | Runory account menu | Runory main navigation |
| --- | --- | --- |
| ![Twenty account menu](assets/twenty-runory-ux-review-2026-07-29/twenty-account-menu.png) | ![Runory account menu](assets/twenty-runory-ux-review-2026-07-29/runory-account-menu.png) | ![Runory workflow navigation](assets/twenty-runory-ux-review-2026-07-29/runory-main-menu-workflows.png) |

### 2.5 Administration surfaces

| Surface | Twenty | Runory |
| --- | --- | --- |
| Administration entry | ![Twenty workspace settings](assets/twenty-runory-ux-review-2026-07-29/twenty-settings-general.png) | ![Runory Manage home](assets/twenty-runory-ux-review-2026-07-29/runory-manage-home.png) |
| Data model / customization | ![Twenty data model](assets/twenty-runory-ux-review-2026-07-29/twenty-settings-data-model.png) | ![Runory workspace customization](assets/twenty-runory-ux-review-2026-07-29/runory-customize-workspace.png) |
| Members and access | ![Twenty members](assets/twenty-runory-ux-review-2026-07-29/twenty-settings-members.png) | ![Runory people and access](assets/twenty-runory-ux-review-2026-07-29/runory-people-access.png) |
| Technical access / operations | ![Twenty MCP and APIs](assets/twenty-runory-ux-review-2026-07-29/twenty-settings-mcp-apis.png) | ![Runory outbox diagnostics](assets/twenty-runory-ux-review-2026-07-29/runory-outbox-diagnostics.png) |

### 2.6 Administration refinement acceptance

The bounded administration convergence was implemented and visually checked
against the recommendations in this review:

| Overview | Objects & fields |
| --- | --- |
| ![Runory refined administration overview](assets/twenty-runory-ux-review-2026-07-29/runory-admin-after-overview.png) | ![Runory refined objects and fields](assets/twenty-runory-ux-review-2026-07-29/runory-admin-after-customize.png) |

| People & access | Delivery diagnostics |
| --- | --- |
| ![Runory refined people and access](assets/twenty-runory-ux-review-2026-07-29/runory-admin-after-members.png) | ![Runory refined delivery diagnostics](assets/twenty-runory-ux-review-2026-07-29/runory-admin-after-delivery-diagnostics.png) |

The implementation reuses the workspace shell, routes, authorization, and
existing page logic. It adds an administration navigation context, shared page
header, task-oriented terminology, grouped overview, advanced-operation
disclosure, and optional technical object names. It does not introduce a new
design system, settings runtime, or administration domain model.

### 2.7 Business surface refinement acceptance

The remaining business-facing recommendations were subsequently implemented;
the administration work is therefore no longer an isolated polish pass.

| List surface | Record detail |
| --- | --- |
| ![Runory refined business list](assets/twenty-runory-ux-review-2026-07-29/runory-business-after-list.png) | ![Runory refined business detail](assets/twenty-runory-ux-review-2026-07-29/runory-business-after-detail.png) |

| Account menu | Dashboard regression check |
| --- | --- |
| ![Runory refined account menu](assets/twenty-runory-ux-review-2026-07-29/runory-business-after-account-menu.png) | ![Runory refined dashboard](assets/twenty-runory-ux-review-2026-07-29/runory-business-after-dashboard.png) |

The implementation:

- merges installed Packs by user-facing category while retaining Pack ownership
  in metadata, eliminating duplicate Field Service groups;
- leaves Add as the list's single primary action and moves preference Save,
  Reset, and Save as View into contextual view options;
- tightens table density, makes the record name the primary link, removes the
  repeated `View` label, and humanizes stored select values when no explicit
  display label exists;
- gives desktop record details a bounded two-region work layout: fields and
  identity context on the left, workflow, related work, and activity on the
  right;
- moves Delete behind a secondary overflow action while preserving governed
  business commands as visible actions;
- simplifies the account menu and limits the demo persona switcher to demo
  identities;
- uses a neutral canvas for dense work surfaces and retains the intentional
  overview treatment for Dashboard, My Work, Planning, and Activity.

These changes reuse ObjectListPage, SchemaTable, ObjectDetailPage,
NavigationShell, field renderers, and existing responsive behavior. No table
framework, widget runtime, inline-edit engine, or new state library was added.

### 2.8 Dashboard comparison and refinement acceptance

Twenty's Dashboard demonstrates a mature composition model: a quiet canvas,
mixed chart forms, compact metric cards, clear edit state, and a resizable grid.
Runory should adopt the visual hierarchy and chart-choice principle without
copying Twenty's general-purpose grid, tabs, rich text, or iframe runtime.

| Twenty reference | Twenty edit state |
| --- | --- |
| ![Twenty dashboard reference](assets/twenty-runory-dashboard-review-2026-07-29/twenty-dashboard-view.png) | ![Twenty dashboard edit state](assets/twenty-runory-dashboard-review-2026-07-29/twenty-dashboard-edit.png) |

| Runory refined dashboard | Runory chart configuration |
| --- | --- |
| ![Runory refined dashboard](assets/twenty-runory-dashboard-review-2026-07-29/runory-dashboard-after.png) | ![Runory chart configuration](assets/twenty-runory-dashboard-review-2026-07-29/runory-dashboard-chart-config.png) |

The proportional Runory decision is:

- keep Pack-declared widgets and governed workspace overrides as the source of
  truth;
- separate data intent from visualization so a timeseries can render as bar,
  line, or area, while a grouped distribution can render as bars or a donut;
- group the page into key metrics, trends, operational lists, and recent
  activity, with progressive disclosure when installed Packs contribute more
  than the useful first-screen limit;
- remove the permanent demo onboarding banner once the workspace contains
  data and rely on the stable navigation for routine shortcuts;
- defer free-form drag/resize, tabs, rich text, and iframe widgets until real
  customer evidence justifies that additional runtime and governance surface.

This closes the concrete chart-type defect without turning the v0.8 Dashboard
into a new low-code product.

## 3. Objective assessment

Runory is not visually immature. Its typography, spacing tokens, icons,
buttons, cards, field rendering, and responsive list foundation already form a
coherent product. The remaining gap is mostly **composition maturity**:

- important and secondary actions compete for the same visual weight;
- information density changes too much between list, detail, and settings;
- large cards and the tinted canvas consume space without adding meaning;
- the business navigation reflects installation structure more than a stable
  user-facing taxonomy;
- settings behave like another business page instead of a distinct
  administration context.

Twenty's main advantage is not more decoration. It is a stable application
frame, compact controls, predictable hierarchy, and low visual noise. Runory
can obtain most of that benefit with small composition changes.

The administration review makes the gap more specific. Runory's underlying
capabilities are not merely POC-level: `People & access` already presents
roles, resource identity, and data scope in a credible business-facing table.
The POC impression comes mainly from the administration **entry and context**:
the Manage page flattens 15 destinations into equally weighted cards, retains
the full business navigation, mixes workspace administration with internal
operations, and exposes implementation terms such as Outbox and Migration at
the same level as Members and Billing.

Twenty uses a persistent settings shell, category navigation, breadcrumbs,
section hierarchy, and progressive disclosure. Even its MCP/API page explains
technical concepts through user goals and integrations. Runory should adopt
that discipline without copying Twenty's product scope or visual identity.

## 4. Recommended refinements

### R1 — Fix navigation grouping before visual polish (`must`)

The current sidebar displays two separate `FSM` groups because navigation is
grouped by installed Pack identity while both Packs share the same user-facing
category. Merge adjacent/equivalent category labels into one rendered group,
while keeping Pack ownership internal.

Also apply a stable order:

```text
shared work surfaces
→ CRM
→ Field Service
→ Sales and Finance
→ less-frequent installed applications
```

This is a correctness and trust issue: duplicate categories make the product
look assembled rather than governed. Implement in
`apps/cloud/src/components/NavigationShell.tsx`; do not introduce another
navigation model.

### R2 — Reduce list toolbar competition (`must`)

Keep one obvious primary action (`Add`). Treat View selection, search, filters,
sort, columns, and page size as one compact toolbar. Move Reset and preference
Save into the View/Options area, showing Save only when the current preference
is dirty. Do not show `Save as View` unless shared/custom View CRUD remains an
explicit product decision and the caller is authorized to use it.

Target desktop composition:

```text
page title + primary action
view selector | search | filter | sort | columns/options
record count + table
```

The current components can be rearranged inside
`apps/cloud/src/components/ObjectListPage.tsx`; no new framework is needed.

### R3 — Tighten the table, but keep Runory's semantics (`should`)

- reduce header and row height modestly;
- keep the header sticky within the list viewport;
- use slightly clearer column boundaries and hover state;
- humanize select values such as `marketing_qualified` to
  `Marketing qualified` while preserving the stored value;
- make the record name the primary link and remove a repeated `View` label when
  the whole row or name already opens the record;
- keep badges quiet and semantic instead of assigning decorative colors to
  every value.

Do not adopt Twenty's virtualization or inline-edit machinery without measured
need.

### R4 — Give record detail a desktop work layout (`must`)

The current detail page stacks large, rounded cards across the full content
width. This is readable but produces excessive vertical travel and weakens the
relationship between record identity, fields, workflow, and activity.

For desktop, use a bounded two-region layout:

```text
record identity + compact actions
├─ primary/secondary fields (about 40%)
└─ activity, workflow, related work (about 60%)
```

On narrow screens it remains one column. Make field sections compact and
collapsible only when they are genuinely long. Put destructive actions such as
Delete behind the overflow menu instead of giving them permanent red primary
weight. Keep domain actions such as Quote acceptance or Work Order transitions
visible when they are the user's next governed action.

This belongs in `apps/cloud/src/components/ObjectDetailPage.tsx` and its
existing layout primitives, not in a generic widget runtime.

### R5 — Introduce a settings shell, not a second design system (`should`)

Twenty clearly switches from the business workspace to a settings context.
Runory should similarly provide a small settings navigation with stable groups
such as Workspace, Members & Access, Data Model, Integrations, Billing, and
Advanced. The existing business sidebar need not remain fully expanded while
editing settings.

Within a settings page:

- use breadcrumb + page title;
- constrain content width;
- use section headings and dividers instead of a large card per concept;
- remove Refresh unless the page owns genuinely stale external state;
- isolate Danger zone at the end;
- keep the existing governed routes and permissions.

Start with `apps/cloud/src/app/w/[workspaceId]/settings/page.tsx`. Reuse the
current NavigationShell and primitives; a new package is unnecessary.

### R6 — Calm the application canvas (`should`)

The lavender canvas, large corner radii, deep card spacing, and elevated
buttons work well for dashboards but become visually heavy on dense enterprise
lists and settings. Use a neutral canvas and smaller radii on data-heavy
surfaces; reserve the tinted background and larger cards for overview pages or
intentional highlights.

This is a token/use-policy adjustment, not a redesign. Confirm contrast and
focus visibility before changing global tokens.

### R7 — Refine the account menu (`could`)

Runory's account menu already has better workspace context than Twenty's. Keep
that advantage, but reduce the text density and clarify three zones:

```text
identity/workspace
administration/settings/workspace switching
session actions
```

The demo-identity control should be absent outside demo/development contexts.
The explanatory footer can be removed or shown only when switching
workspaces.

### R8 — Replace the Manage card wall with an administration map (`must`)

Do not present every administration capability as an equal card with a repeated
`Enter` action. Use a dedicated administration shell with stable groups:

```text
Workspace
  General · Members & access · Billing
Business configuration
  Objects & fields · Business apps · Workflows · Automations · Forms
Integrations & agents
  Connections · Developer access · Agent permissions
Data governance
  Audit · Import/export · Trash
Advanced operations
  Delivery diagnostics · Data changes · Upgrade readiness
```

The landing page should summarize tasks and health — for example member count,
billing state, failed deliveries, and integrations needing attention — rather
than repeat the full navigation as large cards. Ordinary business admins should
see the first four groups; advanced operations should be permission-gated and
collapsed by default.

Reuse the current routes, permission checks, and NavigationShell primitives.
This does not justify a settings microfrontend, new design system, or new
administration domain model. Start the convergence at
`apps/cloud/src/app/w/[workspaceId]/manage/page.tsx`.

### R9 — Separate human administration from the Agent control plane (`must`)

Agents can use Commands, APIs, manifests, machine identifiers, and diagnostic
payloads directly. Business users should see governed summaries and safe
actions. Keep raw IDs, JSON, payloads, migration mechanics, and delivery-event
names behind an advanced or developer context.

Use task-oriented labels in the normal settings navigation:

| Current term | Business-facing term | Placement |
| --- | --- | --- |
| Modules & Packs | Business apps | Business configuration |
| API Keys | Developer access | Integrations & agents |
| Outbox diagnostics | Delivery diagnostics | Advanced operations |
| Migration tools | Data changes | Advanced operations |

The internal names remain valid in code, contracts, diagnostics, and technical
documentation. This is a presentation boundary, not a domain rename.

### R10 — Preserve the strong admin pages and standardize their frame (`should`)

`People & access` is already a good Runory-specific administration surface: it
combines workspace membership, business roles, resource identity, and data
scope more meaningfully than a generic member list. Preserve that model.

Bring Customize, Developer access, Billing, and Operations into the same frame:

- breadcrumb and stable administration navigation;
- one page title and short business-language purpose;
- visible current status and one primary action;
- compact sections with consistent width and rhythm;
- Refresh only where external state can actually be stale;
- advanced controls and dangerous actions disclosed last.

For Customize, keep the governed `plan → preview → apply → audit → rollback`
flow, but list business objects by category and hide machine names until an
advanced detail is opened. Runory does not need Twenty's generic low-code
studio to achieve a mature result.

## 5. Explicit non-recommendations

Do not copy these Twenty capabilities as part of this refinement:

- table virtualization;
- universal inline editing;
- global command menu expansion;
- record-page widget runtime;
- executable field renderer plugins;
- full activity/email/calendar parity;
- a new frontend state library;
- arbitrary layout editing.

They are not required to make Runory feel enterprise-ready and would exceed
the proportionality boundary.

## 6. Suggested delivery slices

1. **Navigation correction:** merge duplicate category groups and stabilize
   ordering.
2. **List refinement:** compact action hierarchy, toolbar, table density, and
   human-readable select labels.
3. **Detail refinement:** two-region desktop composition and quieter destructive
   actions.
4. **Administration convergence:** replace the Manage card wall with a bounded
   settings shell, grouped navigation, business terminology, and advanced-only
   operations; retain the current routes and permissions.
5. **Settings refinement:** standardize page hierarchy and section rhythm,
   starting from General, People & access, Customize, and Developer access.
6. **Visual acceptance:** capture the same representative Runory surfaces at desktop,
   768 px, and 320 px; verify keyboard order, focus, overflow, and permission
   filtering.

Stop after these slices unless user evidence reveals another repeated problem.
This is a polish pass over the existing architecture, not a new foundation
initiative.
