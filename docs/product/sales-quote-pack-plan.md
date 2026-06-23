# Sales Quote Pack Plan

Status: Draft
Date: 2026-06-23
Scope: third official Runory business pack after CRM Lite and FSM

Related:

- [Business Pack Portfolio Strategy](./business-pack-portfolio-strategy.md)
- [CRM Lite Pack Object Model Enrichment Plan](./crm-lite-pack-object-model-enrichment-plan.md)
- [FSM Pack Plan](./fsm-pack-plan.md)
- [Runory Cloud 0.2.1 Workbench Composition Plan](./v0.2.1-workbench-composition-plan.md)
- [Module Architecture](../architecture/module-architecture.md)
- [Runory Product Definition](./product-definition.md)

## 1. Decision

The third official Runory business pack should be `Sales Quote Pack`.

It should not be a full billing, accounting, inventory, or ERP pack. Its job is narrower and strategically important:

> turn CRM opportunities and FSM service needs into versioned, reviewable, approvable commercial proposals.

This gives Runory a practical SMB business loop:

```text
CRM Lite Pack
→ Who are my companies, contacts, and opportunities?

FSM Pack
→ What service work needs to be delivered?

Sales Quote Pack
→ What commercial offer should be approved and sent?
```

## 2. Why This Should Be The Third Pack

`Sales Quote Pack` is the best third pack because it sits between sales, service, and future finance without forcing Runory into full ERP complexity too early.

It validates:

- cross-pack object reuse;
- deal-to-quote flow;
- work-order-to-quote flow;
- amount, currency, line items, discounts, and versioning;
- lightweight approval workflow;
- generated quote preview / export readiness;
- Agent-assisted proposal creation and revision.

It deliberately avoids:

- invoice accounting;
- tax compliance;
- payment collection;
- inventory reservation;
- revenue recognition;
- full CPQ rules engine.

Those are real future capabilities, but they should not be part of the first quote pack.

## 3. Shared Objects

The pack should reuse existing shared and CRM/FSM objects:

```text
company
contact
deal
work_order
service_site
asset
task
```

Ownership remains with their modules:

```text
company       runory.company
contact       runory.contact
deal          runory.deal
work_order    runory.work-order
service_site  runory.service-site
asset         runory.asset
task          runory.task
```

`Sales Quote Pack` references these objects. It does not fork them.

## 4. Quote-Owned Objects

Recommended modules:

```text
runory.product-service
runory.price-book
runory.quote
runory.quote-approval
```

Pack:

```text
sales-quote-pack
= product-service + price-book + quote + quote-approval
```

Template:

```text
small-business-sales-quote
```

Default navigation:

```text
Workbench
Quotes
Products & Services
Price Books
Approvals
Companies
Contacts
Deals
Management
```

## 5. Object Model

### 5.1 Product / Service

Object key: `product_service`

Chinese label: `产品/服务`

Purpose:

Represents something that can be quoted. For SMBs, product and service should start as one object instead of two separate catalogs.

Fields:

```text
name                required
type                product / service / bundle
sku                 optional
description         optional
unit                optional
default_price       optional
currency            optional
active              default true
tax_category        optional, deferred semantics
notes               optional
```

### 5.2 Price Book

Object key: `price_book`

Chinese label: `价格表`

Purpose:

Represents a named pricing context.

Fields:

```text
name                required
currency            required
active              default true
effective_from      optional
effective_to        optional
notes               optional
```

First version simplification:

Price book line items can be represented as quote-time price snapshots or a simple `price_book_item` later. Do not overbuild enterprise price rules in the first version.

### 5.3 Quote

Object key: `quote`

Chinese label: `报价`

Purpose:

The central commercial proposal object.

Fields:

```text
quote_number        required, generated
title               required
status              draft / pending_approval / approved / sent / accepted / rejected / expired / withdrawn
version             required
company_id          optional
contact_id          optional
deal_id             optional
work_order_id       optional
service_site_id     optional
currency            required
subtotal_amount     computed or snapshot
discount_amount     optional
tax_amount          optional
total_amount        computed or snapshot
valid_until         optional
owner               optional
terms               optional
notes               optional
created_at          core-owned
updated_at          core-owned
```

Rules:

- A quote can originate from a `deal`.
- A quote can originate from a `work_order`.
- A quote should support versions.
- Accepted quotes do not become invoices in this pack; that is future Billing/Invoice Pack territory.

### 5.4 Quote Line

Object key: `quote_line`

Chinese label: `报价项`

Purpose:

Represents products, services, or work items in a quote.

Fields:

```text
quote_id            required
product_service_id  optional
description         required
quantity            required
unit                optional
unit_price          required
discount_amount     optional
tax_amount          optional
line_total          computed or snapshot
sort_order          optional
```

### 5.5 Quote Approval

Object key: `quote_approval`

Chinese label: `报价审批`

Purpose:

Represents lightweight approval state for quotes.

Fields:

```text
quote_id            required
status              pending / approved / rejected / cancelled
requested_by        optional
reviewed_by         optional
requested_at        optional
reviewed_at         optional
decision_notes      optional
```

First version simplification:

Do not build a general-purpose workflow engine here. Use a simple approval object and later integrate with a reusable approval module if demand repeats across packs.

## 6. Cross-Pack Flows

### 6.1 CRM Deal To Quote

```text
Open Deal
→ Create Quote
→ Add products/services
→ Preview totals
→ Request approval
→ Approve
→ Send / mark accepted
```

This validates sales workflow without requiring accounting.

### 6.2 FSM Work Order To Quote

```text
Open Work Order
→ Create Quote for repair/service
→ Add service items
→ Approve quote
→ Continue or schedule work
```

This validates service-to-commerce flow.

### 6.3 Agent-Assisted Quote Drafting

Agent examples:

```text
Create a quote for this work order using the standard inspection service.
Apply a 10% discount and explain the reason.
Compare this quote against the last accepted quote for the same company.
Add a line item for emergency onsite support.
```

Agent output must remain governed:

```text
plan
diff
approval
audit
rollback where possible
```

## 7. Workbench Experience

Metrics:

```text
Open quotes
Pending approvals
Quote value this month
Accepted quote value
Expiring soon
```

Lists:

```text
Quotes needing approval
Recently accepted quotes
Draft quotes
Quotes expiring soon
```

Trends:

```text
Quote volume over 14 days
Accepted vs rejected quote count
Quote value trend
```

Activity feed descriptors:

```text
Quote created
Quote submitted for approval
Quote approved
Quote sent
Quote accepted
Quote version created
```

## 8. Demo Data Requirements

Minimum demo shape:

```text
6-8 companies
8-12 contacts
4-6 deals
3-5 work orders if FSM is installed
8-12 products/services
1-2 price books
8-12 quotes
16-30 quote lines
3-5 approval records
```

The demo should include:

- one quote from a CRM deal;
- one quote from a FSM work order;
- one pending approval;
- one accepted quote;
- one expired quote;
- one revised quote with version 2;
- product and service line items;
- realistic Chinese and English examples if workspace language changes.

Demo data must be pack-owned:

```text
catalog/packs/sales-quote-pack/demo-data.json
```

## 9. Architecture Challenges This Pack Should Validate

`Sales Quote Pack` should intentionally validate:

```text
cross-pack object references
line-item objects
computed or snapshot totals
versioned business records
approval state
document/export readiness
Agent-generated structured changes
pack-aware workbench composition
```

## 10. Non-goals

Do not include in the first version:

```text
invoice
payment
tax engine
revenue recognition
inventory reservation
multi-price-rule CPQ
contract lifecycle management
e-signature
PDF template designer
```

These can become later packs or extensions:

```text
Billing Pack
Inventory Pack
Contract Pack
Document Template Pack
```

## 11. Implementation Plan

### Phase 1: Model And Catalog

- Define product/service, quote, quote line, price book, and quote approval manifests.
- Define relationships to company, contact, deal, work order, service site, and asset.
- Define pack manifest and template.

### Phase 2: Runtime And Data

- Implement quote number generation.
- Implement versioning policy.
- Implement totals as safe snapshots.
- Seed pack-owned demo data.

### Phase 3: UI

- Add Quotes list/new/detail routes.
- Add Quote Lines editing.
- Add Products & Services route.
- Add Approvals route or section.
- Add CRM/FSM entry points: create quote from deal or work order.

### Phase 4: Agent And Governance

- Add quote drafting Agent proposal examples.
- Add approval-safe change flow.
- Add audit descriptors.
- Validate rollback for draft quote edits where possible.

### Phase 5: Trial Journey

Canonical Sales Quote trial:

```text
Install Sales Quote Pack
Load demo data
Open a CRM deal
Create a quote
Add product/service lines
Submit for approval
Approve quote
Mark quote accepted
See workbench and activity feed update
Use Agent to add a safe quote field or approval note
```

## 12. Product Readiness Bar

The pack is credible when a mature SMB user can say:

```text
I can create commercial proposals from sales or service work.
I can control quote versions and approvals.
I can see quote value and pending decisions.
I am not forced into accounting complexity before I need it.
```
