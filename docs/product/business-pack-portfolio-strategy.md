# Business Pack Portfolio Strategy

Status: Draft
Date: 2026-06-23
Scope: early official business pack sequence and boundaries

Related:

- [GEO / AEO Product Opportunity](./geo-aeo-product-opportunity.md)
- [Runory Cloud 0.2.2 to 0.2.x Pack Foundation Plan](./v0.2.2-to-v0.2.x-pack-foundation-plan.md)
- [Runory Cloud 0.3 Runtime And Experience Plan](./v0.3-runtime-experience-plan.md)
- [CRM Lite Pack Object Model Enrichment Plan](./crm-lite-pack-object-model-enrichment-plan.md)
- [FSM Pack Plan](./fsm-pack-plan.md)
- [Sales Quote Pack Plan](./sales-quote-pack-plan.md)
- [Runory Product Definition](./product-definition.md)
- [Module Architecture](../architecture/module-architecture.md)

## 1. Portfolio Thesis

Runory should build early official packs around a practical SMB operating loop:

```text
Capture demand
→ qualify relationship
→ quote / approve offer
→ deliver work
→ support customer
→ retain / expand
```

The first three packs already form the middle of that loop:

```text
CRM Lite Pack      relationship and opportunities
FSM Pack           service delivery and field operations
Sales Quote Pack   commercial proposal and approval
```

The next strategic question is how to add:

```text
Marketing Capture
Customer Service / Support
After-sales Service
```

These should not be treated as one blob. They solve different jobs.

## 2. Recommended Pack Sequence

Recommended early portfolio:

```text
1. CRM Lite Pack
2. FSM Pack
3. Sales Quote Pack
4. Marketing Capture Pack
5. Customer Service Pack
6. After-sales Service Pack
```

Rationale:

- CRM, FSM, and Quote prove core business records and cross-pack references.
- Marketing Capture feeds CRM from public channels and validates forms / landing pages / submissions.
- Customer Service adds support tickets and customer communication after a relationship exists.
- After-sales adds warranty, entitlement, return/repair, service plans, and lifecycle obligations after the system already knows companies, contacts, assets, work orders, and quotes.

## 3. Module Scale

Yes: six credible business packs naturally imply **dozens of modules**.

That is acceptable only if the portfolio is layered:

```text
shared business modules
pack-owned MVP modules
later expansion modules
```

The goal is not to build dozens of modules at once. The goal is to make object ownership and pack boundaries clear enough that each module can be introduced incrementally.

### 3.1 Shared Business Modules

These modules are reused across multiple packs:

```text
runory.company
runory.contact
runory.task
runory.product-service
runory.asset
```

Possible future shared modules:

```text
runory.approval
runory.document-template
runory.file-attachment
runory.comment
runory.activity-descriptor
runory.notification
```

These are still business/platform-adjacent modules, not SaaS Core tables.

### 3.2 MVP Module Map

Recommended MVP modules by pack:

```text
CRM Lite Pack
  runory.company
  runory.contact
  runory.deal
  runory.task

FSM Pack
  runory.company
  runory.contact
  runory.task
  runory.service-site
  runory.asset
  runory.work-order
  runory.service-visit
  runory.service-report
  runory.technician

Sales Quote Pack
  runory.product-service
  runory.price-book
  runory.quote
  runory.quote-approval

Marketing Capture Pack
  runory.campaign
  runory.form
  runory.landing-page
  runory.submission
  runory.consent

Customer Service Pack
  runory.ticket
  runory.conversation
  runory.knowledge
  runory.support-sla

After-sales Service Pack
  runory.warranty
  runory.entitlement
  runory.return-request
  runory.repair-request
  runory.maintenance-plan
  runory.customer-success
```

Unique MVP module count, after shared reuse:

```text
shared / reused          5
CRM-specific             1  (deal)
FSM-specific             6
Quote-specific           3  (price-book, quote, quote-approval)
Marketing-specific       5
Customer Service-specific 4
After-sales-specific     6
--------------------------------
approximate MVP total    30 modules
```

This is the correct scale for a serious composable SMB platform, but it must be delivered in slices.

### 3.3 Later Expansion Modules

These modules should be deferred until the corresponding pack has proven adoption:

```text
Marketing
  runory.email-campaign
  runory.a-b-test
  runory.marketing-attribution
  runory.segment

AI Visibility / GEO
  runory.entity-profile
  runory.question-map
  runory.answer-block
  runory.citation-source
  runory.ai-visibility-monitor
  runory.content-brief
  runory.content-gap

FSM
  runory.territory
  runory.crew
  runory.skill
  runory.incident-type
  runory.service-contract
  runory.inventory-location
  runory.part

Quote / Commerce
  runory.quote-template
  runory.discount-rule
  runory.tax-rule
  runory.contract

Customer Service
  runory.support-portal
  runory.omnichannel-inbox
  runory.csat-survey
  runory.escalation-policy

After-sales
  runory.renewal
  runory.service-plan
  runory.replacement
  runory.installed-base

Future Finance / Operations
  runory.invoice
  runory.payment
  runory.inventory
  runory.purchase-order
```

If all later modules are included, the portfolio can easily reach 50+ modules. That is a future platform-scale portfolio, not the first build target.

### 3.4 Delivery Principle

Do not ship a pack only because its modules exist.

A pack is ready only when it has:

```text
clear object ownership
installable manifest
demo data
default workbench composition
basic routes/views
Agent-safe customization examples
cross-pack reference tests
upgrade policy
```

Module count is not the success metric. A complete business loop is.

## 4. Marketing Capture Pack

### 4.1 Decision

Marketing should be an early official pack, but it should start as **Marketing Capture**, not full marketing automation.

Good first scope:

```text
forms
landing pages
minisites
campaigns
submissions
lead/contact creation
source attribution
consent
```

Do not start with:

```text
full email marketing automation
ad campaign management
social media scheduler
complex A/B testing
marketing attribution warehouse
website CMS replacement
```

### 4.2 Why It Matters

Your observation is right: online CRM and sales almost always need marketing surfaces.

Without forms, landing pages, or minisites, CRM data is mostly manually entered. That makes the system feel back-office only. Marketing Capture turns Runory into a business intake surface:

```text
visitor fills form
→ submission is captured
→ contact/company/deal can be created
→ source is tracked
→ sales can follow up
→ Agent can summarize or route
```

### 4.3 Object Model

Recommended modules:

```text
runory.campaign
runory.form
runory.landing-page
runory.submission
runory.consent
```

Pack:

```text
marketing-capture-pack
= campaign + form + landing-page + submission + consent
```

Core objects:

```text
campaign
form
form_field
landing_page
minisite
submission
consent_record
```

Shared object references:

```text
company
contact
deal
task
```

### 4.4 Product Boundaries

Forms and landing pages are business intake surfaces, not a general website builder.

For the first version:

- allow simple landing pages and minisites generated from safe templates;
- allow forms to create submissions and optionally create contacts/deals;
- allow UTM/source fields;
- allow consent capture;
- allow Agent to propose form fields and landing page copy;
- do not allow arbitrary code injection;
- do not position this as a full CMS.

### 4.5 Architecture Challenge

Marketing Capture validates public-facing runtime concerns that the first three packs do not fully test:

```text
public routes
anonymous submissions
spam/rate limits
consent/audit
lead deduplication
safe page publishing
Agent-generated public content review
```

This is strategically valuable because it stretches Runory beyond authenticated workspace CRUD.

GEO / AEO can grow from this pack once public surfaces and structured content exist. See [GEO / AEO Product Opportunity](./geo-aeo-product-opportunity.md).

## 5. Customer Service Pack

### 5.1 Decision

Customer Service should be a separate pack from FSM and After-sales.

It should cover support communication and issue resolution:

```text
ticket / case
inbox / conversation
knowledge article
SLA light
customer portal entry, later
```

It should not try to own field execution. If a ticket requires on-site work, it should create or link to a FSM work order.

### 5.2 Object Model

Recommended modules:

```text
runory.ticket
runory.conversation
runory.knowledge
runory.support-sla
```

Pack:

```text
customer-service-pack
= ticket + conversation + knowledge + support-sla
```

Core objects:

```text
ticket
ticket_comment
conversation
message
knowledge_article
support_sla_policy
```

Shared object references:

```text
company
contact
asset
work_order
quote
task
```

### 5.3 Product Boundary

Customer Service answers:

```text
Who asked for help?
What is the issue?
What is the current status?
Who is responsible?
What has been communicated?
What knowledge article resolves this?
Does this require a work order?
```

It does not answer:

```text
How do we schedule a technician?
How do we manage asset maintenance?
How do we process warranty entitlement?
How do we invoice service work?
```

Those belong to FSM, After-sales, or future Billing packs.

## 6. After-sales Service Pack

### 6.1 Decision

After-sales should be later than Customer Service and Marketing Capture.

Reason:

After-sales is not just "support". It depends on several prior concepts:

```text
customer/company
contact
product/service
asset
quote/order context
service work
support ticket
entitlement or warranty
```

If introduced too early, it will either duplicate FSM/Support or become too thin.

### 6.2 Recommended Scope

After-sales should cover post-sale obligations:

```text
warranty
service entitlement
return / replacement
repair request
maintenance plan
renewal reminder
customer satisfaction follow-up
```

Recommended modules:

```text
runory.warranty
runory.entitlement
runory.return-request
runory.repair-request
runory.maintenance-plan
runory.customer-success
```

Pack:

```text
after-sales-service-pack
= warranty + entitlement + return-request + repair-request + maintenance-plan + customer-success
```

### 6.3 Relationship To FSM And Customer Service

Customer Service owns communication and cases:

```text
ticket
conversation
knowledge
```

FSM owns field execution:

```text
work_order
service_visit
service_report
asset
technician
```

After-sales owns commercial/service obligations after sale:

```text
warranty
entitlement
return
repair
maintenance plan
renewal / follow-up
```

Example flow:

```text
Customer submits support ticket
→ Support triages issue
→ After-sales checks warranty/entitlement
→ FSM creates work order if onsite service is needed
→ Quote Pack creates paid repair quote if not covered
→ Service report closes the loop
```

## 7. Object Overlap Rules

The same rule from CRM/FSM applies:

```text
One object key, one owning module.
Packs compose modules.
Packs do not duplicate shared business objects.
```

Examples:

```text
Do not create marketing_contact; use contact.
Do not create support_customer; use company/contact.
Do not create after_sales_asset; use asset.
Do not create support_work_order; use work_order.
```

Domain-specific context should be expressed through:

```text
domain-owned objects
relations
extension fields
template terminology
```

## 8. Why Marketing Before Customer Service

There is a reasonable argument for Customer Service before Marketing. But I would still put Marketing Capture first after Quote.

Reasons:

1. It validates public-facing pack runtime.
2. It creates the top-of-funnel side of CRM.
3. It makes Runory feel useful before data exists.
4. It gives Agent a strong content/configuration use case.
5. It keeps the first website-facing scope constrained to forms and landing pages.

Customer Service is extremely valuable, but it is more useful once companies, contacts, assets, work orders, and quotes already exist.

## 9. Non-goals For Early Portfolio

Do not collapse all packs into a single "CRM Suite".

Do not prematurely build:

```text
full marketing automation
full CMS
full support omnichannel contact center
full ITSM
full ERP
full billing/invoicing/accounting
full CPQ
full inventory
```

Runory should stay composable:

```text
small useful pack
clear object ownership
cross-pack references
Agent-governed customization
```

## 10. Product Readiness Bar

The early portfolio is credible when a mature SMB user can say:

```text
I can capture interest from a form or landing page.
I can manage companies, contacts, and opportunities.
I can quote work or products.
I can deliver service work.
I can support customers after the sale.
I can manage warranty or service obligations without duplicate records.
```
