# Runory Commercial Pricing and Packaging

| Metadata | Value |
| --- | --- |
| Status | `proposed` |
| Topic | `commercial-pricing` |
| Applies to | `v0.9+ / paid production workspaces` |
| Owner | Product / Commercial / Finance |
| Last reviewed | 2026-07-29 |
| Supersedes | — |
| Superseded by | — |

This document is the proposed authority for Runory commercial packaging, published subscription prices, implementation charges, provider usage, partner economics, and discount control.

It supports the canonical [Product Definition](product-definition.md) and must be applied together with the [Customer Implementation and Agent-assisted Delivery Model](customer-implementation-delivery-model.md). Provider-specific product boundaries remain defined by [Voice Intake Product Definition](voice-intake-product-definition.md) and [Payment Product Definition](payment-product-definition.md).

Until this proposal is explicitly adopted, existing website pricing remains the currently published offer. Website copy must not be changed merely because a proposed amount appears in this document.

## 1. Commercial decision

Runory is not priced as a lightweight standalone FSM or a generic AI receptionist. The commercial proposition is an integrated operating system for service businesses:

```text
Omnichannel intake
+ CRM
+ Sales and quote flow
+ FSM and field execution
+ Payment connection
+ External-Agent operation
+ Governed business execution
```

The commercial model separates four economic layers:

```text
Runory subscription
+ bounded implementation
+ metered provider usage
+ optional custom or partner-delivered services
```

Combining these layers into one apparently low monthly price would obscure delivery cost, weaken gross margin, and leave insufficient room for implementation partners and resellers.

## 2. Customer journeys

Runory supports three commercial journeys.

### 2.1 Free exploration

```text
Free Workspace
→ demo data or bounded test data
→ core product exploration
→ no cost-bearing production provider services
```

The Free Workspace exists to let a prospect understand and operate the product. It is not intended to run an active service business indefinitely.

### 2.2 Focused pilot

```text
Fit assessment
→ scoped pilot order
→ limited implementation
→ one measurable operating loop
→ accept, expand, or stop
```

A pilot is a paid, bounded validation path unless an explicit founding-customer exception is approved.

### 2.3 Paid production

```text
Plan selection
→ implementation order
→ provider onboarding
→ UAT
→ go-live
→ subscription and usage operation
```

A paid subscription alone does not make a Workspace production-ready. Production readiness follows the implementation and go-live controls defined in the delivery model.

## 3. Free Workspace

The Free Workspace should expose enough of the product to demonstrate the end-to-end operating model while limiting scale, cost, and production dependence.

Proposed baseline:

| Capability | Proposed Free boundary |
| --- | --- |
| Users | 1–2 |
| Customer / lead records | Up to 20 |
| Quotes | Up to 5 per month |
| Active Work Orders | Up to 5 |
| Scheduling and field flow | Available for evaluation |
| Dashboard and reports | Basic |
| External-Agent operations | Small monthly fair-use allowance |
| Workflow automation | One bounded low-frequency workflow |
| Custom fields | Small bounded allowance |
| File storage | Small evaluation allowance |
| Live Voice Intake | Not included |
| Live SMS | Not included |
| Live payment collection | Not included |
| Production integrations / API | Not included |
| Support | Documentation / community |
| Branding | Runory branding retained |

The product should prefer complete workflows with constrained volume over a large number of locked buttons.

The upgrade boundary should be triggered by production intent or operational scale, including additional users, higher record volume, live communications, live payments, production integrations, longer data retention, advanced automation, or removal of Runory branding.

## 4. Proposed paid plans

The current working proposal is:

| Plan | Proposed public price | Positioning |
| --- | ---: | --- |
| Starter | **$599 / month** | Small service team beginning real production operation |
| Growth | **$1,299 / month** | Primary plan for a complete operating loop and growing automation volume |
| Pro | **From $2,999 / month** | Multi-team, multi-location, advanced workflow and support requirements |
| Enterprise | **Custom** | Complex integration, deployment, security, SLA, and commercial requirements |

These amounts are proposed list prices, not automatic transaction prices. Packaging, included usage, implementation, support, contract term, and regional provider economics must be finalized before publication.

### 4.1 Packaging principles

1. **Starter must support real production work**, not only evaluation.
2. **Growth should be the default recommended plan** for customers buying the complete Runory operating proposition.
3. **Pro must differ by operating complexity**, not merely by higher minute allowances.
4. **Enterprise remains scoped**, because deployment, integration, compliance, support, and commercial terms can materially change delivery cost.
5. A plan should not silently include unlimited third-party usage or unbounded custom implementation.

### 4.2 Minimum capability expectations

| Plan | Expected commercial boundary |
| --- | --- |
| Starter | Core CRM, Sales, FSM, scheduling, governed Agent operations, standard support, bounded automation and usage |
| Growth | Complete operating loop, higher automation and usage, advanced reporting, priority onboarding, broader operational configuration |
| Pro | Multi-team or multi-location operation, advanced permissions, complex workflows, API/integration scope, stronger support and SLA options |
| Enterprise | Negotiated architecture, security, deployment, integration, data, support, and legal terms |

## 5. Implementation pricing

Implementation is a separate commercial line item because paid production may require business configuration, provider connection, data migration, testing, training, and cutover.

Proposed standard implementation bands:

| Plan / scope | Proposed standard implementation fee |
| --- | ---: |
| Starter | **$1,000–$2,000** |
| Growth | **$2,500–$5,000** |
| Pro | **From $7,500** |
| Complex migration, integration, or custom delivery | Separately scoped |

The applicable fee depends on the accepted implementation scope rather than the subscription name alone.

The implementation order should identify:

- included configuration and workflows;
- Voice Intake, messaging, payment, and integration scope;
- number strategy and provider ownership;
- migration volume and mapping complexity;
- customer obligations and approvals;
- UAT and go-live criteria;
- included training and hypercare;
- exclusions and change-request rules.

Early-customer implementation discounts may be used, but the order should show the standard fee and the explicit discount.

## 6. Provider and usage charges

The following costs must remain visible and economically controlled:

- phone numbers;
- PSTN call minutes;
- Retell or replacement Voice Agent usage;
- SMS and messaging registration or delivery;
- AI model usage;
- premium email or communication services;
- payment processing fees;
- optional external data or integration providers.

Runory may package a bounded included allowance, pass costs through, or apply metered overage pricing. It must not describe provider-dependent services as unlimited unless the commercial model and abuse controls genuinely support that promise.

Stripe payment-processing fees normally belong to the customer's merchant account. Runory SaaS subscription billing and Workspace business-payment settlement remain separate domains.

## 7. Pilot and founding-customer offers

Discounted entry should be expressed as an explicit offer, not as a permanently low reference price.

Possible mechanisms:

- `Founding Customer Price` for a fixed number of customers;
- fixed-duration first-year price protection;
- reduced or waived implementation fee for a clearly bounded standard scope;
- paid pilot credited partly toward production implementation;
- annual commitment discount;
- case-study or reference-customer consideration documented separately.

A discount must state:

- list price;
- discounted price;
- duration;
- included scope;
- renewal basis;
- conditions and expiration.

The earlier working prices of `$449 / $999 / $2,499` may be used as controlled founding-customer or pilot reference points, but should not automatically remain the permanent public list price if the proposed packaging is adopted.

## 8. Annual billing and commitments

Annual billing may improve retention and cash flow, but should not be introduced before support obligations, provider usage, cancellation terms, and implementation capacity are understood.

Proposed guardrails:

- monthly plans may require a minimum initial production term;
- annual prepayment may receive a controlled discount;
- implementation fees are not automatically discounted with annual subscription;
- provider usage and overages remain separately billable;
- plan downgrade, cancellation, export, and provider asset transfer rules must be explicit.

No annual discount percentage is adopted by this proposal.

## 9. Partner commercial model

Partner economics must be based on responsibility, not a universal discount.

| Partner type | Proposed economic model | Expected responsibility |
| --- | --- | --- |
| Referral Partner | Approximately 10% referral commission | Qualified introduction; Runory sells and delivers |
| Reseller Partner | Approximately 20% commercial margin | Sales ownership and agreed customer coordination |
| Implementation Partner | Approximately 25%–30% potential margin | Configuration, training, first-line delivery and support under certification rules |
| Strategic / Enterprise Partner | Negotiated | Defined territory, volume, delivery, support, or integration commitment |

These percentages are planning ranges, not approved entitlements.

Higher margin requires the partner to carry more of the acquisition, implementation, support, collection, or renewal burden. Runory should not grant reseller-level discounts to a party performing referral-only work.

Partner agreements must define:

- customer ownership and contracting party;
- subscription billing and collection;
- implementation ownership;
- first-line and escalation support;
- provider usage responsibility;
- renewals and expansion;
- discount confidentiality;
- service quality and certification;
- termination and customer continuity.

## 10. Discount authority and price floor

Runory should maintain a controlled difference between:

```text
Public list price
→ standard direct-sale price
→ approved founding / pilot offer
→ approved partner transfer price
→ absolute commercial floor
```

No salesperson, Agent, or partner should be able to apply arbitrary discounts.

A later operating policy should define approval levels for:

- subscription discount;
- implementation discount;
- free provider allowance;
- pilot credit;
- annual prepayment discount;
- partner transfer price;
- exceptional strategic deal.

Production quote Commands must enforce these approval thresholds through governed execution.

## 11. Gross-margin guardrails

The earlier direct-sale estimates indicated gross margin around the high-50% to low-60% range before material channel discounts. That leaves limited room for a reseller discount when Runory still carries implementation, provider cost, and first-line support.

Commercial approval must therefore evaluate at least:

```text
Net subscription revenue
- provider and infrastructure cost
- included support burden
- partner commission or discount
- unrecovered implementation effort
= contribution margin
```

Pricing decisions should protect the following principles:

1. provider usage must be bounded or recoverable;
2. implementation effort must be priced or intentionally invested;
3. partner margin must correspond to transferred work;
4. custom work must not be hidden inside standard subscription;
5. a low first-year price must have an explicit renewal rule;
6. list-price changes must be evaluated separately from existing-customer treatment.

No final minimum gross-margin percentage is adopted by this proposal. It must be set after real provider, support, and implementation data are available.

## 12. Publication rules

The public pricing page is a publication surface, not the source of commercial authority.

Before changing public prices, Product and Commercial owners must approve:

- plan names and list prices;
- included users, usage, automation, and support;
- implementation wording;
- third-party and overage treatment;
- pilot and founding-customer language;
- annual terms;
- regional availability;
- legal and billing readiness.

After approval, the following publication surfaces must be reviewed together:

- `apps/cloud/src/i18n/marketing-copy.ts`;
- pricing page components and metadata;
- structured data and FAQ copy;
- sales order and proposal templates;
- partner materials;
- implementation order templates;
- billing configuration.

Until then, `$599 / $1,299 / From $2,999` remains a proposed pricing decision and must not be represented as generally available production pricing.

## 13. Adoption checklist

This proposal can move from `proposed` to `active` only after:

- [ ] Free Workspace limits are accepted;
- [ ] paid-plan capability matrix is accepted;
- [ ] included Voice / SMS / Agent usage is defined;
- [ ] overage and provider pass-through rules are defined;
- [ ] implementation bands are validated against expected effort;
- [ ] partner model and discount authority are approved;
- [ ] contribution-margin model is reviewed;
- [ ] founding-customer treatment is approved;
- [ ] annual and cancellation terms are defined;
- [ ] website, billing, order, and partner materials are updated consistently;
- [ ] existing-customer migration or price-protection policy is recorded.

## 14. Related documents

- [Product Definition](product-definition.md)
- [Customer Implementation and Agent-assisted Delivery Model](customer-implementation-delivery-model.md)
- [Getting Started](../getting-started.md)
- [Voice Intake Product Definition](voice-intake-product-definition.md)
- [Voice Intake Technical Specification](voice-intake-technical-spec.md)
- [Payment Product Definition](payment-product-definition.md)
- [Payment Technical Specification](payment-technical-spec.md)
- [Stripe Connect Pre-GA Completion Plan](stripe-connect-pre-ga-plan.md)
