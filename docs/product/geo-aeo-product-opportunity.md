# GEO / AEO Product Opportunity

Status: Draft
Date: 2026-06-23
Scope: whether GEO / AEO can grow on top of Runory

Related:

- [Business Pack Portfolio Strategy](./business-pack-portfolio-strategy.md)
- [Runory Product Definition](./product-definition.md)
- [Sales Quote Pack Plan](./sales-quote-pack-plan.md)

## 1. Decision

GEO / AEO is a promising product direction for Runory, but it should not start as a standalone platform.

Recommended path:

```text
Marketing Capture Pack
→ AI Visibility / GEO capability layer
→ optional standalone GEO / AEO Pack
```

Why:

- GEO/AEO depends on public content surfaces: forms, landing pages, minisites, knowledge pages, product/service pages, and structured answers.
- Runory's pack model can own business context: company, product/service, quote, deal, knowledge article, ticket, and customer proof.
- Runory's Agent can propose structured content, FAQ, schema, page copy, and evidence-backed answer blocks through governed approval.

The product should begin by helping SMBs become answerable, citable, and trustworthy in AI-driven discovery.

## 2. Working Definition

The market uses overlapping terms:

```text
SEO  -> visibility in traditional search results
AEO  -> being extracted or surfaced as direct answers
GEO  -> being understood, cited, or recommended by generative AI systems
```

For Runory, use the combined product framing:

```text
AI Visibility / GEO
```

This avoids overcommitting to a still-fluid acronym while keeping the product direction clear.

## 3. Why It Fits Runory

GEO/AEO is not only a content problem. It is a structured business knowledge problem.

Runory already wants to manage:

```text
companies
contacts
products/services
quotes
deals
service records
knowledge articles
landing pages
forms
customer proof
```

That is exactly the material AI answer engines need to understand a business.

Runory can help a workspace answer:

```text
What do we sell?
Who is it for?
What problems do we solve?
What proof do we have?
Which pages answer which questions?
Where are we mentioned or cited?
What should we publish next?
```

This is stronger than a generic content tool because Runory can connect public content to real business objects.

## 4. Product Shape

### 4.1 Start Inside Marketing Capture

The first implementation should extend Marketing Capture:

```text
landing_page
minisite
form
campaign
submission
consent
```

Add GEO/AEO-oriented capabilities:

```text
question map
answer block
FAQ section
entity profile
citation/evidence library
structured data hints
AI visibility checks
content freshness checks
```

### 4.2 Later Standalone Pack

If there is traction, split into:

```text
ai-visibility-pack
```

Possible modules:

```text
runory.entity-profile
runory.question-map
runory.answer-block
runory.citation-source
runory.ai-visibility-monitor
runory.content-brief
runory.content-gap
```

This pack would depend on:

```text
runory.company
runory.product-service
runory.landing-page
runory.knowledge
runory.campaign
```

## 5. Object Model

### 5.1 Entity Profile

Object key: `entity_profile`

Purpose:

Defines how the business, product, service, or expert should be consistently described.

Fields:

```text
entity_type         company / product_service / person / location
entity_id           optional reference
canonical_name      required
short_description   required
categories          optional
audience            optional
proof_points        optional
official_urls       optional
same_as_urls        optional
last_reviewed_at    optional
```

### 5.2 Question Map

Object key: `question_map`

Purpose:

Captures the questions a buyer or customer asks before contacting the business.

Fields:

```text
question            required
intent              informational / commercial / support / comparison
target_entity_type  optional
target_entity_id    optional
priority            optional
status              draft / approved / published / stale
assigned_page_id    optional
```

### 5.3 Answer Block

Object key: `answer_block`

Purpose:

Stores concise, evidence-backed answers that can be reused across pages, FAQs, knowledge articles, and Agent-generated copy.

Fields:

```text
question_map_id     optional
answer              required
summary             optional
evidence_sources    optional
review_status       draft / approved / rejected
published_url       optional
last_reviewed_at    optional
```

### 5.4 Citation Source

Object key: `citation_source`

Purpose:

Tracks first-party and third-party sources that support a claim.

Fields:

```text
title               required
url                 optional
source_type         first_party / third_party / customer_proof / documentation / media
authority_level     optional
related_entity_type optional
related_entity_id   optional
notes               optional
```

### 5.5 AI Visibility Check

Object key: `ai_visibility_check`

Purpose:

Tracks prompt/query checks across AI answer engines.

Fields:

```text
query               required
engine              optional
locale              optional
target_entity_id    optional
mentioned           boolean
cited_urls          optional
sentiment           positive / neutral / negative / unknown
observed_answer     optional
checked_at          required
```

## 6. Agent Workflows

Useful Agent workflows:

```text
Generate question map for this product/service.
Turn this service page into answer-first content.
Create FAQ blocks based on our support tickets.
Find missing proof for this claim.
Compare our AI visibility against competitors.
Draft a landing page that answers buyer questions directly.
Review whether this page is cite-worthy.
```

All public-facing changes must remain governed:

```text
draft
preview
approval
publish
audit
rollback / unpublish
```

## 7. Why It Should Not Be First-Class Too Early

Risks:

- The GEO/AEO market vocabulary is still unstable.
- Measurement is noisy because AI answers vary by engine, query, user context, and time.
- Many "GEO" tactics can degrade into low-quality content spam.
- SMBs first need basic public surfaces before advanced AI visibility analytics matter.

Therefore, Runory should first build:

```text
Marketing Capture surfaces
structured content
knowledge articles
product/service pages
safe publishing
```

Then add AI visibility monitoring and optimization.

## 8. Relationship To Existing Packs

CRM:

```text
question maps can create leads or deals when users submit forms.
```

Sales Quote:

```text
product/service pages and answer blocks can support quote generation.
```

Customer Service:

```text
support tickets can become FAQ and knowledge answer blocks.
```

FSM:

```text
service reports and common issues can become localized service content.
```

Marketing Capture:

```text
landing pages, minisites, campaigns, and submissions are the natural first home.
```

## 9. Product Readiness Bar

The opportunity becomes real when Runory can show:

```text
Create a landing page from structured business data.
Generate an approved FAQ / answer block set.
Publish a public page safely.
Track which questions the page is meant to answer.
Run AI visibility checks for those questions.
Suggest concrete content improvements with evidence.
Connect submissions back to CRM.
```

At that point, GEO/AEO is not a buzzword layer. It becomes a natural public-growth layer on top of Runory's business operating system.

