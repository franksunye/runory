# Test Environment Setup

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Applies to | All manual E2E test cases |
| Prerequisite for | 01–09 |

## 1. Local development server

### 1.1 Start the dev server

```bash
cd apps/cloud
node scripts/sync-resources.mjs
pnpm dev
```

The app runs at `http://localhost:3000`.

Do not use a command that triggers an interactive package-manager prompt
during the acceptance run.

### 1.2 Create or refresh a demo workspace

```bash
node apps/cloud/scripts/bootstrap-demo.mjs
```

This creates a demo workspace with CRM Lite Pack, Sales Quote Pack, and FSM
Pack installed, including seeded customers, contacts, sites, assets,
technicians, quotes, work orders, visits, and form definitions.

Record the workspace slug and ID from the script output. The local URL is:

```text
http://localhost:3000/w/<workspace-slug>
http://localhost:3000/m/w/<workspace-slug>   (mobile)
```

### 1.3 Canonical local database

```text
apps/cloud/data/runory.db
```

If you see different record counts between the browser and CLI, confirm which
SQLite file the command is reading.

### 1.4 Run automated gates first

Before manual testing, verify the automated baseline passes:

```bash
pnpm vitest run packages/platform-core/src/v05-journey.test.ts
pnpm vitest run packages/platform-core/src/architecture-tests.test.ts
WORKSPACE_ID=<workspace-id> node scripts/validate-v05-closure.mjs
```

## 2. Stripe sandbox configuration

Payment tests (test case 03) require a Stripe test-mode environment.

### 2.1 Prerequisites

1. Install and authenticate the Stripe CLI:
   ```bash
   stripe login
   ```

2. Create or open `apps/cloud/.env.local` and configure:

   **SaaS billing (subscription):**
   ```env
   RUNORY_BILLING_STRIPE_SECRET_KEY=sk_test_...
   RUNORY_BILLING_STRIPE_ACCOUNT_ID=acct_...
   RUNORY_BILLING_STRIPE_MODE=test
   ```

   **Workspace customer payments:**
   ```env
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
   STRIPE_PAYMENT_MODE=test
   STRIPE_PAYMENT_CURRENCY=USD
   STRIPE_PAYMENT_WORKSPACE_ID=<workspace-id>
   STRIPE_PAYMENT_PROVIDER_ACCOUNT_ID=payment_provider_stripe_test
   STRIPE_CONNECT_ACCOUNT_ID=acct_...
   ```

   Then align the Demo Workspace Connect mapping:

   ```bash
   cd apps/cloud
   pnpm stripe:payments:setup
   pnpm stripe:payments:verify
   ```
### 2.2 Set up the product catalog

```bash
cd apps/cloud
pnpm stripe:billing:setup
pnpm stripe:billing:verify
```

Copy the output Price IDs into `RUNORY_BILLING_STARTER_PRICE_ID`,
`RUNORY_BILLING_GROWTH_PRICE_ID`, and `RUNORY_BILLING_PRO_PRICE_ID`.

### 2.3 Start with Stripe webhook forwarding

```bash
cd apps/cloud
pnpm dev:stripe
```

This starts both the Next.js dev server and the Stripe CLI listener. The
webhook secret is injected into the process environment automatically.

### 2.4 Test card numbers

| Card | Number | Behavior |
| --- | --- | --- |
| Visa (success) | `4242 4242 4242 4242` | Normal successful payment |
| Generic decline | `4000 0000 0000 0002` | Payment declined |
| Insufficient funds | `4000 0000 0000 9995` | Payment declined (insufficient funds) |

Use any future expiry date and any 3-digit CVC.

## 3. Role setup

The demo workspace includes seeded users with different roles. If you need to
create additional test users, use the Members page (`/w/<slug>/members`) or
the bootstrap script.

### 3.1 Available business roles

| Role key | Label | Key permissions | Source pack |
| --- | --- | --- | --- |
| `workspace_administrator` | Workspace Administrator | `*` (all permissions) | FSM / Sales Quote |
| `dispatcher` | Dispatcher | triage, schedule, dispatch, conflict override | FSM |
| `field_technician` | Field Technician | visit execute, form submit, assignment respond | FSM |
| `service_supervisor` | Service Supervisor | complete work order, refund, invoice issue/void, review | FSM |
| `sales_representative` | Sales Representative | quote create/edit/submit, customer CRUD | CRM + Sales Quote |
| `sales_manager` | Sales Manager | quote approve/reject/accept/convert, price book, refund | CRM + Sales Quote |
| `sales_viewer` | Sales Viewer | read-only CRM | CRM |

### 3.2 Role assignment

Assign business roles through the Members page or by inserting into
`business_role_assignments`:

```sql
INSERT INTO business_role_assignments (id, workspace_id, role_key, user_id, assigned_by, assigned_at)
VALUES ('bra_test_1', '<workspace-id>', 'dispatcher', '<user-id>', '<owner-id>', datetime('now'));
```

### 3.3 Role switching during tests

Some test cases require switching between roles. Use separate browser
profiles or incognito windows to maintain separate sessions. Document every
identity switch in the run record.

## 3.5 DB Spot-check access

Each manual test case includes a **DB Spot-check** section with lightweight SQL
queries to verify that what the UI shows matches what the database stores.
Run these queries after key state transitions — not after every click.

### Access methods

**Method A — SQLite CLI (preferred for copy-paste queries):**

```bash
sqlite3 apps/cloud/data/runory.db -header -column
```

Paste the spot-check SQL directly. Use `.headers on` and `.mode column` for
readable output. Exit with `.quit`.

**Method B — Browser Dev Tools console:**

For ad-hoc checks without leaving the browser, use `fetch` against the
metadata API (if authenticated as a workspace member):

```js
// Example: fetch a single record by table and ID
await fetch("/api/workspaces/<ws-id>/records/quote/<quote-id>").then(r => r.json())
```

This returns the JSON projection — compare `status`, `aggregate_version`,
and monetary fields against the UI.

### Table naming convention

| Namespace | Prefix | Examples |
| --- | --- | --- |
| Business data | `runory_business_` | `runory_business_quote`, `runory_business_work_order`, `runory_business_invoice`, `runory_business_payment`, `runory_business_service_visit` |
| Runtime / platform | `runory_runtime_` | `runory_runtime_audit_logs`, `runory_runtime_outbox_messages`, `runory_runtime_schedule_entries`, `runory_runtime_assignments`, `runory_runtime_command_executions` |
| SaaS core | `platform_` | `platform_workspaces`, `platform_users`, `platform_workspace_memberships` |

Replace `<workspace-id>` in queries with the actual workspace UUID from the
bootstrap script output or the dashboard URL.

### Spot-check discipline

- Run the query **after** the UI confirms the transition — not before.
- Compare the DB `status`, `aggregate_version`, and monetary totals against
  the UI display. Any mismatch is a P1 finding.
- Do not mutate data via SQL during a test run. All mutations must go
  through the product UI or governed API.

## 4. Browser requirements

| Browser | Version | Purpose |
| --- | --- | --- |
| Chrome | Latest | Primary desktop testing |
| Chrome (mobile emulation) | Latest | Mobile responsive testing |
| Safari (iOS) | Real device or Simulator | PWA installation and push (test case 06) |
| Chrome (Android) | Real device or Emulator | PWA installation and push (test case 06) |

For PWA notification tests, a real device or emulator is strongly preferred
because Service Worker push behavior differs between desktop and mobile.

## 5. Preconditions checklist

Before starting any test case, verify:

- [ ] Dev server is running at `http://localhost:3000`
- [ ] Demo workspace is created and accessible
- [ ] CRM Lite Pack, Sales Quote Pack, and FSM Pack are installed
- [ ] Demo data includes customers, contacts, sites, assets, and technicians
- [ ] Current migrations are applied (restart server if migrations changed)
- [ ] Stripe CLI is authenticated and webhook forwarding is active (for payment tests)
- [ ] `.env.local` contains valid Stripe test-mode keys (for payment tests)
- [ ] Browser console shows no blocking errors on the dashboard

## 6. Key URLs reference

| Surface | URL |
| --- | --- |
| Workspace dashboard | `http://localhost:3000/w/<slug>/dashboard` |
| Work Orders | `http://localhost:3000/w/<slug>/work-orders` |
| Quotes | `http://localhost:3000/w/<slug>/quotes` |
| Planning | `http://localhost:3000/w/<slug>/planning` |
| My Work | `http://localhost:3000/w/<slug>/my-work` |
| Companies (Customers) | `http://localhost:3000/w/<slug>/companies` |
| Service Visits | `http://localhost:3000/w/<slug>/service-visits` |
| Members | `http://localhost:3000/w/<slug>/members` |
| Manage | `http://localhost:3000/w/<slug>/manage` |
| Billing | `http://localhost:3000/w/<slug>/billing` |
| Mobile home | `http://localhost:3000/m/w/<slug>` |
| Mobile account | `http://localhost:3000/m/account` |
| Customer access | `http://localhost:3000/en/access#token=<token>` |
| Platform admin | `http://localhost:3000/admin` |
| PWA manifest | `http://localhost:3000/manifest.json` |
| Service Worker | `http://localhost:3000/sw.js` |
