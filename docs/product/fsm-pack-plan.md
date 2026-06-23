# FSM Pack Plan

Status: Draft
Date: 2026-06-23
Scope: second official Runory business pack after CRM Lite

Related:

- [Business Pack Portfolio Strategy](./business-pack-portfolio-strategy.md)
- [CRM Lite Pack Object Model Enrichment Plan](./crm-lite-pack-object-model-enrichment-plan.md)
- [Sales Quote Pack Plan](./sales-quote-pack-plan.md)
- [Runory Cloud 0.2.1 Workbench Composition Plan](./v0.2.1-workbench-composition-plan.md)
- [Module Architecture](../architecture/module-architecture.md)
- [Runory Product Definition](./product-definition.md)

## 1. Definition

`FSM Pack` means **Field Service Management Pack**.

It targets SMB teams that need to manage field service work:

```text
customers / sites / assets / work orders / technicians / schedules / service reports
```

This is a strong second pack because it immediately tests whether Runory can support multiple business packs that share some business objects while still owning distinct workflows.

## 2. Product Goal

FSM should feel like a real SMB operations pack, not a renamed task list.

A user should be able to answer:

```text
Who requested service?
Where is the service site?
What asset or equipment needs work?
What work order is open?
Who is assigned?
When is the visit scheduled?
What happened during the visit?
What still needs follow-up?
```

## 3. Reference Systems And Design Stance

FSM object models differ across mature products:

- Salesforce Field Service emphasizes Work Orders, Service Appointments, Service Resources, Service Territories, and scheduling.
- Dynamics 365 Field Service emphasizes Work Orders, Bookable Resources / Bookings, Customer Assets, Incident Types, Agreements, and work order lifecycle/status automation.
- ServiceNow Field Service Management emphasizes Work Orders, Work Order Tasks, assignment/qualification, asset/service history, and operational workflow states.

The difference is expected. Each vendor starts from a different platform center:

```text
Salesforce starts from CRM + scheduling.
Dynamics starts from resource scheduling + asset/service operations.
ServiceNow starts from service workflow + operational process management.
Runory starts from composable SMB business packs + Agent-governed customization.
```

Therefore, Runory should not copy one vendor's object model directly. We should adopt a **canonical SMB FSM nucleus** and keep vendor-style complexity as optional future modules.

Design rule:

```text
Model the operational invariants, not the vendor vocabulary.
```

Common invariants across mature FSM systems:

```text
Requested work          -> work_order
Scheduled visit/booking -> service_visit
Assignable worker       -> technician / resource
Customer/account        -> company
Person/contact          -> contact
Physical place          -> service_site
Serviceable item        -> asset
Execution evidence      -> service_report
Operational checklist   -> work_order_task or task checklist, deferred
```

For the first Runory FSM Pack, prefer the smallest object set that supports the core journey:

```text
company
contact
service_site
asset
work_order
service_visit
technician
service_report
task
```

Defer these until the first FSM pack proves the journey:

```text
territory
crew
skill
incident_type
agreement
entitlement
inventory
part
price_list
work_order_line_item
work_order_task
```

This is the important product stance:

> Runory FSM should be recognizable to users who know Salesforce, Dynamics, or ServiceNow, but it should be simpler, more composable, and better suited to SMB adoption.

## 4. Core Object Model

### 4.1 Shared Business Objects

These objects should **not** be duplicated inside FSM:

```text
company
contact
task
activity feed
```

Ownership:

```text
company       owned by runory.company
contact       owned by runory.contact
task          owned by runory.task
activity feed owned by platform activity/audit layer
```

FSM can depend on these objects and contribute views, widgets, filters, and domain-specific labels, but it should not create separate objects such as `fsm_customer` or `service_customer`.

### 4.2 FSM-Owned Objects

FSM should own the objects that are truly field-service specific:

```text
service_site
asset
work_order
service_visit
service_report
technician
```

Optional later objects:

```text
part
inventory_location
service_contract
sla_policy
invoice_line
```

These should not be included in the first FSM version unless the trial journey requires them.

## 5. Recommended Modules

Shared modules:

```text
runory.company
runory.contact
runory.task
```

FSM modules:

```text
runory.service-site
runory.asset
runory.work-order
runory.service-visit
runory.service-report
runory.technician
```

Pack:

```text
fsm-pack
= company + contact + task
+ service-site + asset + work-order + service-visit + service-report + technician
```

Template:

```text
small-business-field-service
```

Default navigation:

```text
Workbench
Work Orders
Schedule
Sites
Assets
Companies
Contacts
Reports
Management
```

## 6. Object Details

### 6.1 Service Site

Object key: `service_site`

Chinese label: `服务地点`

Purpose:

Represents the physical location where service is performed.

Fields:

```text
name                required
company_id          optional
primary_contact_id  optional
address             required
city                optional
region              optional
postal_code         optional
access_notes        optional
service_notes       optional
status              active / inactive
```

Why not reuse company address only:

An SMB customer can have multiple service locations. A company record is an account; a service site is an operational location.

### 6.2 Asset

Object key: `asset`

Chinese label: `设备/资产`

Purpose:

Represents equipment, devices, machines, or serviceable assets at a site.

Fields:

```text
name                required
serial_number       optional
asset_type          optional
company_id          optional
service_site_id     optional
installed_at        optional
warranty_until      optional
status              active / maintenance / retired
notes               optional
```

### 6.3 Work Order

Object key: `work_order`

Chinese label: `工单`

Purpose:

The central FSM operational object.

Fields:

```text
title               required
description         optional
status              required
priority            optional
company_id          optional
contact_id          optional
service_site_id     optional
asset_id            optional
assigned_to         optional
requested_at        optional
scheduled_start     optional
scheduled_end       optional
completed_at        optional
sla_due_at          optional
source              optional
notes               optional
```

Default statuses:

```text
new
triaged
scheduled
in_progress
blocked
completed
cancelled
```

### 6.4 Technician

Object key: `technician`

Chinese label: `工程师/技师`

Purpose:

Represents an assignable field-service worker.

Fields:

```text
name                required
email               optional
phone               optional
skills              optional
region              optional
availability_status available / busy / off_duty
user_id             optional
```

Note:

In the future, a technician may map to a workspace member. For the first FSM pack, keep `technician` as a business object and allow optional `user_id`.

### 6.5 Service Visit

Object key: `service_visit`

Chinese label: `上门/服务行程`

Purpose:

Represents a scheduled or completed on-site visit for a work order.

Fields:

```text
work_order_id       required
technician_id       optional
scheduled_start     required
scheduled_end       optional
actual_start        optional
actual_end          optional
status              scheduled / en_route / on_site / completed / cancelled
notes               optional
```

### 6.6 Service Report

Object key: `service_report`

Chinese label: `服务报告`

Purpose:

Captures what happened during or after service.

Fields:

```text
work_order_id       required
service_visit_id    optional
summary             required
resolution          optional
customer_signature  optional
photos              optional
created_by          optional
completed_at        optional
```

## 7. Handling Duplicate Objects Across Packs

### 7.1 Rule: One Object, One Owning Module

The same business object key must have one owner.

```text
company is owned by runory.company
contact is owned by runory.contact
task is owned by runory.task
```

Other modules can extend or reference these objects only through declared extension points and relations.

They must not create duplicate alternatives:

```text
Do not create fsm_customer.
Do not create crm_company if runory.company exists.
Do not create service_contact if runory.contact exists.
```

### 7.2 Rule: Packs Compose, Modules Own

A pack does not own objects directly. A pack composes modules.

```text
CRM Pack uses company/contact/deal/task.
FSM Pack uses company/contact/task plus FSM-specific modules.
```

If two packs need the same object, they depend on the same module.

### 7.3 Rule: Shared Business Modules Are Not SaaS Core

`company`, `contact`, and `task` are reusable business modules, not SaaS Core tables.

SaaS Core owns:

```text
tenant
organization
workspace
membership
auth
catalog
installation
audit
usage
extension runtime
```

Shared business modules own:

```text
company
contact
task
```

This keeps SaaS Core generic while still avoiding object duplication.

### 7.4 Rule: Domain-Specific Fields Belong To Domain Modules Or Extensions

If FSM needs a field on `company`, do not fork `company`.

Use one of these:

```text
1. Add a generic field to runory.company if it is broadly useful.
2. Add an FSM-owned extension field through a declared extension point.
3. Add an FSM-owned relation object if the data is operationally specific.
```

Examples:

```text
company.lifecycle_stage       generic, belongs to runory.company
company.default_service_site  probably FSM-specific, avoid as base company field
service_site.company_id       FSM-owned relation, preferred
```

### 7.5 Rule: UI Labels Can Be Pack-Specific

Different packs may label the same shared object differently:

```text
CRM: Companies / 客户组织
FSM: Customers / 客户
```

The underlying object key can remain `company`.

This should be solved through template terminology and navigation, not duplicate schemas.

## 8. Workbench Experience

FSM workbench should focus on operational attention.

Metrics:

```text
Open work orders
Scheduled visits today
Overdue work orders
Completed this week
Active assets
```

Lists:

```text
Work orders needing dispatch
Today's technician schedule
Overdue or blocked work orders
Recently completed service reports
```

Trends:

```text
Work orders created over 14 days
Completion trend
Average time to complete
```

Activity feed:

The platform feed remains canonical, but FSM contributes descriptors:

```text
Work order scheduled
Technician assigned
Visit completed
Service report submitted
Asset status changed
```

## 9. Demo Data Requirements

FSM demo data should make the pack feel operational immediately.

Minimum demo shape:

```text
5-8 companies
8-12 contacts
8-12 service sites
8-12 assets
10-15 work orders
6-10 service visits
4-6 service reports
3-5 technicians
```

The demo should include:

- one urgent work order;
- one overdue work order;
- one scheduled visit today;
- one completed work order with service report;
- one company with multiple service sites;
- one asset under maintenance;
- one technician with multiple assigned visits.

Demo data must be pack-owned:

```text
catalog/packs/fsm-pack/demo-data.json
```

## 10. Architecture Challenges This Pack Should Validate

FSM should be used as an architecture proving ground for:

```text
shared modules across packs
object dependency reuse
pack-specific terminology
pack-specific workbench layout
cross-object relations
demo data references across shared and pack-owned objects
Agent customization on shared objects without breaking other packs
```

## 11. Implementation Plan

### Phase 1: Model And Manifest

- Finalize shared module decision: `runory.company`, `runory.contact`, `runory.task`.
- Define new FSM modules and manifests.
- Define relation fields and extension points.
- Define FSM pack manifest and template.

### Phase 2: Runtime Install

- Ensure pack installation deduplicates shared module dependencies.
- Ensure duplicate install of shared modules remains idempotent.
- Ensure pack-owned demo data can reference records created by shared modules.

### Phase 3: Workspace UI

- Add Work Orders, Sites, Assets, Technicians, Visits, Reports surfaces.
- Add pack-specific navigation.
- Add FSM workbench widgets through the workbench composition model.

### Phase 4: Agent And Governance

- Add safe customization examples:
  - add asset warranty category;
  - add technician skill options;
  - add work order priority reason;
  - add service report checklist section.
- Validate that Agent proposals can extend shared objects without creating duplicate objects.

### Phase 5: Trial Journey

Canonical FSM trial:

```text
Install FSM Pack
Load demo data
Open today's schedule
Assign a technician
Complete a service visit
Submit a service report
View activity feed and workbench updates
Safely customize work order fields
```

## 12. Product Readiness Bar

FSM Pack is credible when a mature SMB user can say:

```text
I can see who needs service, where, on what asset, by whom, and by when.
I can dispatch work and see operational status.
I can complete a service visit and produce a service report.
The pack reuses companies and contacts instead of forcing duplicate customer records.
```
