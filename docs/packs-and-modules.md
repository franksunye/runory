# Packs and Modules

Packs are how Runory delivers business capability. A **pack** bundles one or more **modules** into an installable business outcome. This page explains the pack/module system, the installation flow, demo data, and lists every official pack with its real contents.

For the concepts behind packs and modules, see [Concepts](./concepts.md). To install a pack now, see [Getting Started](./getting-started.md).

## How packs and modules relate

```text
Module = technical install unit (objects, fields, views, workflows, migrations)
Pack   = commercial delivery unit (combines modules + template + dashboard + permissions)
```

- A module is owned by Runory and is read-only from the workspace perspective.
- A pack references modules with version ranges (for example `runory.company:^1.0.0`).
- Multiple packs can share the same module without duplicating it. The installer detects already-installed modules and skips re-install.
- A pack can apply a **terminology overlay** — relabeling a shared object (e.g. `company` → "Customer") without forking the underlying object definition.
- A pack declares a `defaultTemplate`, a `dashboard.defaultLayout`, an `onboardingChecklist`, and (optionally) `permissionGroups`.

## The installation flow

1. Open **Modules** at `/w/[workspaceId]/modules`.
2. Pick a pack from the catalog.
3. Choose **Install**. The installer:
   - Resolves the pack's module dependencies with a frozen lock.
   - Runs a compatibility preflight against the workspace.
   - Registers the modules' objects, fields, views, navigation, workflows, and dashboard widgets.
   - Applies the pack's terminology overlay and default template.
4. The dashboard and navigation update to reflect the installed pack.

Install only loads schema and runtime — it does not create business records.

## Demo data

Each pack ships a `demo-data.json` with coherent sample records. Loading demo data is a separate step from install:

1. From **Modules**, open the installed pack (or its `/w/[workspaceId]/modules/[packId]` page).
2. Choose **Load demo data**.
3. Runory inserts the records and links their relations.

You can install a pack without demo data, and you can clear demo data later without uninstalling the pack. Demo data tells a coherent story so the dashboard, lists, and relations are populated on first open.

## Official packs

The following packs live in `catalog/packs/`. Each has a `manifest.yaml` and a `demo-data.json`.

### Available packs

| Pack ID | Name | Version | Modules |
| --- | --- | --- | --- |
| `crm-lite-pack` | CRM Lite Pack | 2.0.0 | company, contact, deal, task |
| `fsm-pack` | Field Service Management Pack | 1.0.0 | company, contact, task, service-site, asset, technician, work-order, service-visit, service-report |
| `sales-quote-pack` | Sales Quote Pack | 1.0.0 | company, contact, deal, product-service, price-book, quote, quote-approval |
| `marketing-capture-pack` | Marketing Capture Pack | 1.0.0 | company, contact, deal, campaign, form, landing-page, submission, consent |
| `customer-service-pack` | Customer Service Pack | 1.0.1 | company, contact, task, ticket, conversation, knowledge, support-sla |
| `after-sales-pack` | After-sales Service Pack | 1.0.1 | company, contact, task, warranty, entitlement, return-request, repair-request, maintenance-plan, customer-success |

### Exploratory packs

| Pack ID | Name | Version | Modules |
| --- | --- | --- | --- |
| `ai-visibility-pack` | AI Visibility / GEO Seed Pack | 1.0.0 | company, product-service, landing-page, entity-profile, question-map, answer-block, citation-source, ai-visibility-check |

### Shared / validation packs

| Pack ID | Name | Version | Modules |
| --- | --- | --- | --- |
| `shared-business-consumer-pack` | Shared Business Consumer Pack | 1.0.0 | company, task |

> **Honesty note:** The AI Visibility / GEO Seed Pack is **exploratory**. It exists to validate the GEO/AEO capability direction; do not rely on it for production workloads yet. The Shared Business Consumer Pack is a validation pack that proves two packs can depend on the same shared modules without duplicate install or duplicate navigation chaos.

## Pack details

### CRM Lite Pack

Lightweight customer relationship management — manage companies, contacts, deals, and tasks. This is the recommended starting point for a new workspace. It declares permission groups (`sales_admin`, `sales_agent`, `sales_viewer`) and a `small-business-crm` default template.

### Field Service Management Pack

Field service management — work orders, technicians, service sites, and assets. Composes shared modules (company, contact, task) with FSM-specific modules. Applies a terminology overlay labeling `company` as "Customer" and `task` as "Service Task". Default template: `small-business-field-service`.

### Sales Quote Pack

Sales quoting — products/services, price books, and quote management. Reuses CRM and FSM-owned modules and adds quote-specific modules. Default template: `small-business-sales-quote`.

### Marketing Capture Pack

Marketing capture — landing pages, forms, and submission management. Composes shared business modules with marketing-specific modules for public demand capture. Default template: `small-business-marketing-capture`.

### Customer Service Pack

Customer service — tickets, SLA, and knowledge base. Cross-pack relations to FSM (asset, work_order) and Sales Quote (quote) work when those packs are also installed, and gracefully resolve to null otherwise. Default template: `small-business-customer-service`.

### After-sales Service Pack

After-sales — warranty, entitlement, return/repair requests, maintenance plans, and customer success follow-ups. Cross-pack relations to FSM, Sales Quote, and Customer Service resolve gracefully when those packs are installed. Default template: `small-business-after-sales`.

### AI Visibility / GEO Seed Pack (exploratory)

AI visibility — entity profiles, citation sources, and answer-block management. Composes shared modules with Marketing Capture and Sales Quote modules for cross-pack entity references, plus five GEO-specific modules. Default template: `small-business-ai-visibility`.

### Shared Business Consumer Pack

Shared business modules — company, consent, and campaign foundation. Validates that two packs can depend on the same shared business modules. Labels `company` as "Customer Enterprise" and `task` as "Service Order".

## Module compatibility

Each pack declares `coreCompatibility: ">=0.1.0"`. Module upgrades:

- declare compatible Core ranges;
- produce an Extension compatibility report before upgrade;
- never auto-execute a breaking upgrade;
- leave the current runnable version unchanged if migration fails;
- report Extension conflicts so the workspace admin can approve or resolve.

Uninstall retains data by default unless you explicitly choose deletion.

## Catalog and release channels

Packs reach a workspace through the immutable Catalog. Release channels are:

- **Internal** — where the CLI and SDK publish candidates.
- **Beta** — allowlisted rollout that can be observed, paused, and resumed.
- **Stable** — requires a human Release Manager approval; the only channel workspaces install from by default.

The CLI can only publish to `internal` — it cannot bypass to Stable. See [SDK / Module Development](./sdk-module-development.md) and [Admin / Governance](./admin-governance.md).
