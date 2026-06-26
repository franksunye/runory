# Getting Started

Welcome to Runory. This guide walks you through the canonical first journey: create a free Cloud account, set up a workspace, install an official pack, load demo data, use the workbench, customize safely with the Agent, and inspect the audit trail.

Runory is in **public free preview** during `v0.4`. There is no paid plan, no Stripe integration, and no payment method required. See [Release Notes](./release-notes.md) for the current status.

> Read [Concepts](./concepts.md) first if you want to understand workspaces, modules, packs, and Agent operations before you start clicking.

## 1. Create an account with email

1. Go to the Runory Cloud sign-in page.
2. Enter your email address and request a one-time password (OTP).
3. Copy the OTP from your inbox and submit it.
4. You are signed in with a server-side session. No password is ever stored.

Runory uses passwordless email OTP. The first user in an organization becomes its Owner. If you do not receive an OTP during local development, see [Troubleshooting](./troubleshooting.md#auth-and-otp-in-dev).

### Local development shortcut

When running Runory locally, set the explicit dev bootstrap flag to auto-authenticate as a local owner without sending email:

```bash
# In apps/cloud/.env.local
PLATFORM_DEV_BOOTSTRAP=true
```

This bypass is **dev only**. It is gated on an explicit flag rather than `NODE_ENV`, so it will not accidentally activate in staging or test. Never set it in production — production must reject dev bootstrap identity. See [Troubleshooting](./troubleshooting.md) for details.

## 2. Create a workspace

After your first sign-in, Runory creates an Organization and a default Workspace for you. A workspace is the business data and configuration boundary — your records, packs, extensions, and audit logs all live inside it.

You can rename the workspace and create additional workspaces from the dashboard. Each workspace is isolated from every other workspace.

## 3. Install a pack

A **pack** bundles modules (objects, fields, views, workflows) into a business capability you can install. The recommended starting point is the CRM Lite Pack.

1. Open your workspace.
2. Go to **Modules** (the pack onboarding page at `/w/[workspaceId]/modules`).
3. Pick a pack from the catalog and choose **Install**.
4. The installer registers the pack's objects, fields, views, navigation, and dashboard widgets.

Install only loads the pack schema and runtime — it does not create business records. For a full list of packs and what each contains, see [Packs and Modules](./packs-and-modules.md).

## 4. Load demo data

Demo data gives you a coherent set of sample records so the workbench is not empty on first open.

1. From **Modules**, open the installed pack.
2. Choose **Load demo data**.
3. Runory inserts the pack's `demo-data.json` records and links their relations.

Demo data and pack install are intentionally separate steps. You can install a pack without demo data, and you can clear demo data later from the workspace without uninstalling the pack.

## 5. Use the workbench

Once a pack is installed, the workspace dashboard and navigation come alive:

- **Dashboard** (`/w/[workspaceId]/dashboard`) shows metrics, trends, lists, and an activity feed composed from the pack's widgets.
- **Object pages** follow the dynamic route shell: `/w/[workspaceId]/[objectKey]` (list), `/w/[workspaceId]/[objectKey]/new` (create), and `/w/[workspaceId]/[objectKey]/[id]` (detail).
- Create, view, and edit records. Relations between objects (for example a Contact belonging to a Company) are resolved from metadata.

See the [Workspace Guide](./workspace-guide.md) for the full page map.

## 6. Customize safely

Runory customization happens through **Managed Workspace Extensions**, never by editing official module source. The Agent proposes a plan; you preview the diff and approve.

1. Open **Customize** (`/w/[workspaceId]/customize`).
2. Use **Add Field** to propose a new custom field on an object, or describe a view change.
3. The Agent calls the plan API to validate the proposal against the module's extension points.
4. Review the **Diff Preview** — added fields, affected views, and the risk level.
5. Approve to **Apply**. Runory writes a new extension version, updates the runtime schema, and records an audit event plus a rollback point.

This flow is the same one external Agents use through MCP. See [Agent Operations](./agent-operations.md) and [MCP / Skill Usage](./mcp-skill-usage.md).

## 7. Inspect the audit

Every governed change is recorded in an append-only audit trail.

1. Open **Audit** (`/w/[workspaceId]/audit`).
2. Filter by action (for example `extension.apply`) or actor.
3. Each entry shows who, through which entry, what changed, the before/after state, and the rollback point.

You can also list audit events programmatically — see [Admin / Governance](./admin-governance.md).

## Canonical journey recap

```text
Visit website
Read product positioning
Create free account (email OTP)
Create workspace
Install official pack
Load demo data
Use workbench
Customize safely with Agent
Inspect audit
Read docs for next step
```

This journey must work end-to-end in English on a fresh workspace. If any step fails, capture the request ID from the error toast and check [Troubleshooting](./troubleshooting.md).

## What is free and what is not

During `v0.4`:

- The Cloud product is free. No Stripe, no billing, no payment method.
- All official packs listed in [Packs and Modules](./packs-and-modules.md) are available to install.
- MCP and Agent operations are available to connect external agents.
- Fair-use limits may apply; if limits are not yet technically enforced, the website and docs say so honestly.
- Paid plans, enterprise SSO, marketplace monetization, and private/on-premise production delivery are **not** available yet.

See [Release Notes](./release-notes.md) for what shipped in each version.
