# Workspace Guide

A Runory workspace is the day-to-day surface where you run your business: dashboards, records, views, members, and governance. This guide maps the workspace pages and explains how to use them.

If you have not created a workspace yet, start with [Getting Started](./getting-started.md). For the building blocks behind these pages, see [Concepts](./concepts.md).

## The dynamic object route shell

Most business records are served by a single metadata-driven route shell:

```text
/w/[workspaceId]/[objectKey]          → object list page
/w/[workspaceId]/[objectKey]/new      → create record
/w/[workspaceId]/[objectKey]/[id]     → record detail
```

The `[objectKey]` segment maps deterministically to an object key. Plural route segments (`companies`, `contacts`, `deals`, `work-orders`, `service-sites`, etc.) resolve to their object keys (`company`, `contact`, `deal`, `work_order`, `service_site`). No official object page requires a per-object Next.js route file — they all flow through this shell.

A small number of pages are explicit composite product pages rather than dynamic object pages (dashboard, modules, customize, workflows, automations, audit, export, trash, settings, members, landing-pages).

## Dashboard

`/w/[workspaceId]/dashboard`

The dashboard is composed from the installed pack's widget layout. Each pack declares widgets across zones:

- **metrics** — count widgets (open deals, open work orders, active assets).
- **trends** — time-series widgets (new companies trend, new work orders trend).
- **lists** — record lists (recent companies, today's schedule, pending approvals).
- **activity** — the platform business activity feed.

When no pack is installed the dashboard shows empty-state guidance and next-step prompts. After loading demo data, the dashboard reflects the sample records immediately.

## Navigation

The workspace navigation shell reads its entries from the navigation API. Only installed pack objects appear — there are no legacy array fallbacks. Pack terminology overlays can relabel navigation entries (for example showing "Customers" instead of "Companies" in an FSM workspace).

## Object pages

### List page — `/w/[workspaceId]/[objectKey]`

- Renders a schema-driven table with columns from the object's view definition.
- Supports search, pagination, and filters declared by the view.
- Empty, loading, and error states are first-class.

### Create page — `/w/[workspaceId]/[objectKey]/new`

- Renders a schema-driven form from the object's form definition.
- Required fields, validation rules, and relation pickers are enforced.
- Extension-added fields appear here automatically after an Agent apply.

### Detail page — `/w/[workspaceId]/[objectKey]/[id]`

- Shows the record's fields, relations, and an extension panel for custom fields.
- Relations resolve to labels where available. During preview, some relations may surface raw IDs where labels are not yet available — this is a known current limitation, not a bug.

## Customize

`/w/[workspaceId]/customize`

This is the Agent proposal review surface. Use it to safely extend the workspace:

- **Add Field** wizard — propose a custom field on an object.
- **Diff Preview** — review added fields, affected views, and the risk level before applying.
- **Extension List** — view installed extensions and their versions.
- **Rollback** — revert the latest version of an extension.

Customization always goes through Managed Workspace Extensions — never through editing module source. See [Agent Operations](./agent-operations.md).

## Modules

`/w/[workspaceId]/modules` (and `/w/[workspaceId]/modules/[packId]`)

The pack onboarding center. From here you can:

- Browse available packs from the catalog.
- Install a pack into the workspace.
- Load demo data for an installed pack.
- Review the onboarding checklist each pack declares.

See [Packs and Modules](./packs-and-modules.md) for the full pack list.

## Workflows and Automations

- `/w/[workspaceId]/workflows` — inspect metadata-defined workflows bound to objects.
- `/w/[workspaceId]/automations` — inspect and run triggered/scheduled automations.

Both are governed surfaces. Changes produce audit events and respect the Agent permission boundary.

## Members

`/w/[workspaceId]/members`

Manage organization membership and workspace roles. You can invite members, assign roles, and revoke access. Access revocation takes effect on the next request. The last Owner cannot leave, be downgraded, or be removed. See [Admin / Governance](./admin-governance.md).

## API keys

`/w/[workspaceId]/api-keys`

Create, scope, rotate, and revoke workspace API keys. API keys are used to authenticate external Agents and MCP clients against the governed APIs. Key creator loss of access immediately invalidates their keys. See [Admin / Governance](./admin-governance.md).

## Audit

`/w/[workspaceId]/audit`

The append-only audit trail. Filter by action or actor. Every governed mutation produces an audit event recording who, through which entry, which API, what changed, before/after, and the rollback point. Audit never stores OTP, session, or API key secrets.

## Activity

`/w/[workspaceId]/activity`

A real-time business activity feed of recent workspace events.

## Export

`/w/[workspaceId]/export`

Export workspace data (configuration, modules, extensions, schema, business records). Exports never include authentication or billing secrets. Export is the preferred path between Cloud and Private/Local runtimes — Runory does not rely on bidirectional sync. See [Admin / Governance](./admin-governance.md).

## Trash and restore

`/w/[workspaceId]/trash`

Deleted records are retained for restore. Uninstall retains data by default unless you explicitly choose deletion. You can restore records from trash and purge them when ready.

## Settings

`/w/[workspaceId]/settings`

Workspace-level settings: name, terminology, and configuration. Workspace settings are distinct from organization-level and account-level settings.

## Manage

`/w/[workspaceId]/manage`

Workspace management surface for administrative actions.

## Billing

`/w/[workspaceId]/billing`

During `v0.4` there is no paid plan and no Stripe integration. The billing surface reflects the free preview posture. Paid plans will be announced before enforcement, and user data will not be locked behind future payment. See [Release Notes](./release-notes.md).

## Landing pages

`/w/[workspaceId]/landing-pages` (with `/new` and `/[id]`)

A composite publishing experience used by packs that include landing-page modules (for example Marketing Capture and AI Visibility). This is an explicit product page, not a dynamic object page.

## Account and platform admin

Outside the workspace:

- `/account` — your user account, sessions, and account deletion.
- `/admin` — platform admin console (restricted to platform admin emails). Covers catalog, releases, and rollouts.

See [Admin / Governance](./admin-governance.md) for the governance model.
