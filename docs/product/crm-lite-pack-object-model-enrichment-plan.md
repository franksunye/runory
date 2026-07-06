# CRM Lite Pack Object Model Enrichment Plan

Status: Draft
Date: 2026-06-23
Related:

- [Business Pack Portfolio Strategy](./business-pack-portfolio-strategy.md)
- [FSM Pack Plan](./fsm-pack-plan.md)
- [Sales Quote Pack Plan](./sales-quote-pack-plan.md)
- [Runory Product Definition](./product-definition.md)
- [Runory Cloud 0.2 Productization Plan](./v0.2-productization-plan.md)
- [Runory Cloud 0.2.1 Workbench Composition Plan](./v0.2.1-workbench-composition-plan.md)
- [Module Architecture](../architecture/module-architecture.md)

## 1. Decision

`CRM Lite Pack` should move away from a `customer`-as-primary-object model.

The mature CRM model should be:

```text
Company / Account
Contact
Deal / Opportunity
Task / Activity
```

`Customer` should be represented as a **lifecycle stage** or business state on `company` and/or `contact`, not as the foundational CRM object.

This aligns better with established CRM expectations:

- HubSpot standard CRM objects center on Contacts, Companies, Deals, and Tickets.
- HubSpot uses lifecycle stages to classify contacts and companies through the customer journey.
- Mature SMB users expect to manage organizations, people, opportunities, and follow-up work, not only a flat "customer list".

External references:

- HubSpot CRM standard objects: Contacts, Companies, Deals, Tickets.
- HubSpot lifecycle stages: lifecycle stages categorize contacts and companies across marketing and sales stages.

## 2. Why The Current Model Is Not Enough

The current pack is useful for proving platform capability, but it reads more like a simple records demo than a mature CRM core:

```text
customer
contact -> customer
task -> customer
```

Problems:

1. `customer` is ambiguous.
   It can mean a company, a person, a paying account, a lead, or any relationship record.

2. `contact` is subordinated too early.
   The current contact requires `customer_id`, but in real SMB usage a contact can exist before a company is confirmed, and B2C/service businesses may be contact-first.

3. There is no deal/opportunity object.
   Without deals, the system cannot express pipeline, amount, stage, close date, conversion, or forecast.

4. "Customer" should often be a stage.
   A lead can become an opportunity and then a customer. That progression belongs in lifecycle/pipeline state, not in a separate object name.

5. The workbench is therefore shallow.
   Metrics like "customer count" and "recent customers" are understandable, but they do not yet create the feeling of a serious business operating pack.

## 3. Target Object Model

### 3.1 Company

Object key: `company`

Display label: `Company` or `Customer Organization`

Purpose:

Represents an organization the workspace interacts with. In B2B, this is the main account-like record. In B2C, it can be optional.

Baseline fields:

```text
name                required
domain              optional
website             optional
phone               optional
industry            optional
size                optional
source              optional
owner               optional
lifecycle_stage     required, default lead
address             optional
notes               optional
```

Recommended lifecycle values:

```text
lead
marketing_qualified
sales_qualified
opportunity
customer
inactive
```

Display labels:

```text
Lead
Marketing Qualified Lead
Sales Qualified Lead
In Opportunity
Customer
Dormant / Churned
```

### 3.2 Contact

Object key: `contact`

Display label: `Contact`

Purpose:

Represents a person. A contact may be associated with a company, but should not be forced to have a company from day one.

Baseline fields:

```text
name                required
email               optional
phone               optional
title               optional
role                optional
primary_company_id  optional
source              optional
owner               optional
lifecycle_stage     optional
notes               optional
```

Rules:

- `primary_company_id` should be optional.
- The system should support contact-first usage.
- Later, a contact can be associated with multiple companies through a relation model. For the first enriched version, one primary company is enough.

### 3.3 Deal

Object key: `deal`

Display label: `Deal`

Purpose:

Represents a revenue opportunity or sales process.

Baseline fields:

```text
name                required
stage               required
amount              optional
currency            default CNY or workspace currency
expected_close_date optional
probability         optional
company_id          optional
primary_contact_id  optional
owner               optional
source              optional
notes               optional
```

Default stages:

```text
new
qualified
proposal
negotiation
won
lost
```

Display labels:

```text
New Deal
Qualified
Proposal / Quote
Negotiating
Won
Lost
```

### 3.4 Task / Activity

Object key: `task`

Display label: `Task`

Purpose:

Represents follow-up work. The existing task object is a good start, but it should link to CRM entities more flexibly.

Baseline fields:

```text
title               required
description         optional
status              required
priority            optional
due_date            optional
assignee            optional
company_id          optional
contact_id          optional
deal_id             optional
```

Future activity extension:

`activity` can later become a broader object or platform feed descriptor for calls, notes, emails, meetings, and system events. For `v0.2.x`, `task` plus platform activity feed is enough.

## 4. Pack Composition

Recommended modules:

```text
runory.company
runory.contact
runory.deal
runory.task
```

These modules are not CRM-private. `runory.company`, `runory.contact`, and `runory.task` should be treated as reusable Official Business Modules that can also be used by later packs such as FSM.

Pack:

```text
crm-lite-pack
= company + contact + deal + task
```

Template:

```text
small-business-crm
```

Default navigation:

```text
Workbench
Companies
Contacts
Deals
Tasks
Activity
Management
```

## 5. Workbench Experience

The CRM workbench should show business momentum, not only record existence.

Recommended default metrics:

```text
Companies total
Contacts total
Open deals
Pipeline amount
Tasks due today / overdue
```

Recommended lists:

```text
Open deals by stage
Tasks needing attention
Recently updated companies
Recently added contacts
```

Recommended trends:

```text
New contacts over 14 days
New deals over 14 days
Won/lost deal count
```

Recommended activity feed:

The activity feed remains platform-owned, but CRM objects should contribute clear labels:

```text
Deal moved to Proposal
Company lifecycle changed to Customer
Task completed
Contact added to Company
```

## 6. Demo Data Requirements

The pack should ship demo data that makes the CRM feel real to a mature SMB user.

Minimum demo shape:

```text
6-8 companies across different industries
10-16 contacts, including multiple contacts per company
8-12 deals across several stages
10-15 tasks linked to companies, contacts, and deals
recent activity/audit events where possible
```

The demo should intentionally include:

- at least one company in `customer` lifecycle stage;
- at least one active opportunity;
- at least one lost deal;
- at least one overdue task;
- at least one contact without a company, to prove contact-first usage;
- realistic Chinese and English examples if the workspace language changes.

Demo data must be pack-owned:

```text
catalog/packs/crm-lite-pack/demo-data.json
```

Cloud UI should not maintain a separate CRM demo-data source.

## 7. Migration Strategy

Because Runory Cloud is still early, the preferred path is to fix the model now.

### Option A: Preferred For 0.2.x

Introduce the enriched CRM model as the new canonical pack model:

```text
runory.customer -> deprecated
runory.company  -> canonical organization object
runory.contact  -> optional primary_company_id
runory.deal     -> new
runory.task     -> links company/contact/deal
```

For local/dev workspaces:

- reset and reinstall CRM Lite;
- reseed demo data;
- update routes and navigation from `customers` to `companies`;
- optionally keep `/customers` as a redirect or alias during transition.

This is the cleanest path because the product has not yet reached stable public data compatibility.

### Option B: Compatibility Path

If breaking existing workspace data is unacceptable:

- keep object key `customer`;
- relabel it to `Company / Customer Organization`;
- add lifecycle fields;
- add `deal`;
- make `contact.customer_id` optional in a future migration;
- later migrate object key from `customer` to `company`.

This reduces immediate code churn but preserves a weaker domain model.

Recommendation:

Use Option A unless there is already important user data that must be preserved.

## 8. Implementation Checklist

Catalog:

- Add `runory.company` module.
- Add `runory.deal` module.
- Update `runory.contact` to depend on company optionally, not strictly.
- Update `runory.task` to link to company/contact/deal.
- Update `crm-lite-pack` manifest to include company/contact/deal/task.
- Replace pack demo data with enriched demo data.

Cloud UI:

- Add Companies list/new/detail routes.
- Add Deals list/new/detail routes.
- Update Workbench metrics and lists.
- Update empty states and onboarding text.
- Update Agent Proposal example target from `customer` to `company` or `contact`.
- Keep redirect/alias from `/customers` if needed.

Platform/Core:

- Ensure manifest validation supports optional relationship fields.
- Keep demo data seeding pack-owned.
- Add tests for install, records, demo data, and workbench stats.

Docs:

- Update product screenshots/scenarios.
- Update 0.2 key experience scenario from "customer customization" to "company/contact/deal customization".
- Update SDK examples if they reference `customer` as the default CRM object.

## 9. Non-goals

Do not build a full enterprise CRM in this iteration:

- no complex multi-pipeline designer;
- no campaign automation;
- no ticket/service desk unless a separate pack owns it;
- no multi-company contact association table unless required by the immediate trial journey;
- no quote/order/invoice objects in CRM Lite.

The goal is a credible SMB CRM nucleus, not a broad CRM suite.

## 10. Product Readiness Bar

After enrichment, a mature SMB user should be able to say:

```text
I can see my companies, people, opportunities, and follow-up work.
I understand which opportunities are active.
I know what needs attention today.
I can customize fields safely without breaking future upgrades.
```

That is the right standard for `CRM Lite Pack` as a core business pack.
