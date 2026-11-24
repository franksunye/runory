# FSM AI Market Review — 2026-11-24

| Metadata | Value |
| --- | --- |
| Status | `evidence` |
| Topic | `product` |
| Applies to | 2026-05-24–2026-11-24 |
| Owner | Product / Engineering |
| Last reviewed | 2026-11-24 |
| Supersedes | — |
| Superseded by | — |

## 1. Purpose and authority

This review records public market evidence relevant to Runory's next product investment.
The research window is **2026-05-24 through 2026-11-24**, with a cutoff of **2026-11-24**.
An announcement date, a documentation update, and the date a product was first deployed are different facts.
Undated product and pricing pages describe the state observed at the cutoff; they are not evidence of a launch within the window.

This document is research evidence, not a product specification, implementation acceptance record, or authorization to change scope.
The [Product Definition](../product/product-definition.md) remains the product authority.
The [Repair Quote Review and Handoff Plan](../product/repair-quote-review-and-handoff-plan.md) records the selected working priority and conditional delivery sequence.
External ideas remain subject to the [External Benchmark Adoption Guardrails](../product/external-benchmark-adoption-guardrails.md).

### Evidence conventions

- **P1 — product documentation:** the vendor documents a capability and its operating limits; Runory has not tested it.
- **P2 — participant announcement:** a company, investor, or named partner describes an event or deployment; commercial outcomes remain participant claims.
- **P3 — current product page or case study:** evidence of positioning and claimed coverage, without proof of release timing or general reliability.
- **Inference:** Runory's interpretation of the sources, explicitly separated from reported facts.
- No competitor production workflow was exercised, no customer was contacted, and no independent causal ROI evaluation was performed for this review.

## 2. Findings that change the decision

The competitive set includes established FSM vendors, communications overlays, dispatch-centered platforms, field sales tools, and configurable business platforms.
The evidence below shows these categories expanding into one another's workflows.
MCP connectivity and natural-language configuration are already advertised by direct competitors.
Repair inspection, controlled estimating, and crew handoff also have direct competitors; selecting that workflow does not establish an uncontested market.

**Working conclusion:** retain Runory's governed Cloud FSM/runtime direction, but compete through a bounded, repeatable business delivery with measurable customer results.
This is a product judgment supported by market observations, not evidence that Runory has validated demand, pricing, acquisition, retention, or unit economics.

## 3. Primary-source evidence ledger

### S01 — Probook: dispatch is the entry point, not the full product boundary

- **Date:** 2026-06-23 announcement.
- **Fact:** the announced $40 million comprises a **$34 million Series A** led by a16z and a **$6 million Seed** led by Sequoia; Sequoia also participated in the Series A.
- **Scope:** Probook describes expansion from dispatch into intake, data cleaning, customer messaging, and outbound, sharing operational context.
- **Source:** [company announcement](https://www.globenewswire.com/news-release/2026/6/23/3316215/0/en/Probook-Raises-40M-from-Andreessen-Horowitz-and-Sequoia-to-Scale-the-AI-Operating-System-for-Home-Services.html); [a16z announcement](https://a16z.com/announcement/investing-in-probook/).
- **Evidence:** P2. The investor is a transaction participant, not an independent evaluator of product outcomes.
- **Limit:** the funding is not a single $40 million round. Customer productivity, booking, and EBITDA claims do not establish general causal effects.
- **Incumbent context:** ServiceTitan lists Probook as an [integration partner](https://marketplace.servicetitan.com/partner/probook), including onsite onboarding, while its own [Dispatch Pro documentation](https://help.servicetitan.com/v1/docs/dispatch-pro) describes machine-learning and constraint-based assignment with Auto and Assist modes (updated 2026-06-24; first published before this review window). Partnership is not evidence that the products never compete, or that Probook has a permanent algorithmic lead.

### S02 — Fieldproxy: Agent access includes claimed software configuration

- **Date:** MCP announcement 2026-09-27; developer documentation observed 2026-11-24.
- **Fact:** Fieldproxy announced MCP access from external assistants for business operations and administrator-directed changes to fields, screens, tables, automations, and Agent configuration.
- **Scope:** the announcement describes sandbox drafts, approval before publication, rollback, and read/write/build access levels. It listed 145 tools; the current developer page lists 170+.
- **Source:** [MCP announcement](https://www.fieldproxy.ai/resources/blog/introducing-fieldproxy-mcp); [developer documentation](https://www.fieldproxy.ai/developers).
- **Evidence:** P1/P2. These are published product contracts and claims, not Runory test results.
- **Limit:** tool counts do not measure reliability. Public documentation does not establish entitlement, integration availability, or execution quality for a particular customer.

### S03 — Jobber: official MCP support has a specific write boundary

- **Date:** announcement 2026-09-25; help article updated 2026-10-21.
- **Read:** clients, properties, requests, quotes, jobs, and invoices can be searched or retrieved.
- **Write:** clients, properties, and requests can be created or edited. **Quotes can be created but not subsequently edited through the connector**; they include total, deposit, and discount, but not unit costs or margins.
- **Excluded:** creating/editing jobs or invoices, deleting/archiving records, and adding/editing/removing schedule items.
- **Source:** [launch announcement](https://www.prnewswire.com/news-releases/jobber-launches-mcp-bringing-home-and-commercial-service-data-and-workflows-directly-into-chatgpt-and-claude-302890385.html); [official capability limits](https://help.getjobber.com/en/articles/connect-jobber-to-claude-and-chatgpt/).
- **Evidence:** P1/P2. Use the help article's explicit boundaries when interpreting broader announcement language.
- **Limit:** neither "read-only" nor "full FSM write access" accurately describes the documented connector.

### S04 — ArcSite: direct competition for inspection, estimating, and handoff

- **Date:** Estimate workflow tutorial 2026-09-30; waterproofing page undated, observed 2026-11-24.
- **Fact:** documented setup covers field questions and attachments, product libraries, pricing and margin thresholds, proposal templates, signatures, deposits, and integrations.
- **Scope:** the basement waterproofing offering connects site documentation and estimates with drawings, annotated photos, and information used by installation crews.
- **Source:** [Estimate workflow tutorial](https://support.arcsite.com/en/articles/17266482-how-to-get-started-with-the-estimate-plan-video-tutorials); [waterproofing offering](https://www.arcsite.com/industries/basement-waterproofing).
- **Evidence:** P1/P3. Detailed instructions are stronger evidence of a usable workflow than a feature slogan, but are not our hands-on verification.
- **Limit:** the tutorial date does not establish when every feature first shipped. Runory cannot claim this workflow is underserved merely because it knows the trade.

### S05 — ServiceTitan: AI estimate generation is bounded by preview status

- **Date:** article published 2026-09-23, updated 2026-11-09.
- **Fact:** the estimate builder uses guided answers and the company's Pricebook templates to generate tiered Good/Better/Best proposals.
- **Availability:** **Private Preview for selected accounts, HVAC replacement jobs only**, with a Managed Technician license and relevant estimate permissions.
- **Fallback:** unmatched templates can fall back to manual estimating; the AI builder requires connectivity.
- **Source:** [official estimate-builder documentation](https://help.servicetitan.com/v1/docs/new-article-estimate-builder-fma).
- **Evidence:** P1. Do not present this as generally available AI estimating for every trade.
- **Limit:** the preview boundary does not imply that ServiceTitan's established manual estimates, Pricebook, or downstream job workflows are immature.

### S06 — Hatch: booking integration reaches the customer's actual capacity rules

- **Date:** 2026-08-19 announcement and setup guidance.
- **Fact:** Hatch announced access to ServiceTitan Adaptive Capacity for its booking workflows.
- **Scope:** its Agent requests availability from the same capacity endpoint, applying the customer's existing technician, area, and capacity rules.
- **Source:** [Adaptive Capacity integration announcement](https://www.usehatchapp.com/blog/hatch-servicetitan-partnership-expands-to-include-adaptive-capacity).
- **Evidence:** P1/P2. The article includes configuration steps and explains the dependency on ServiceTitan's rules.
- **Limit:** this requires the customer's Adaptive Capacity configuration and appropriate app authorization; a generic "ServiceTitan integration" does not imply equivalent access.

### S07 — Hatch: distribution includes trade associations and supply channels

- **Date:** 2026-11-17 announcement.
- **Fact:** Hatch announced an NPMA partnership and participation as a vendor partner in Lansing Building Products' IMPACT program.
- **Scope:** the agreements provide member/customer access, benefits, and education around AI communications.
- **Source:** [NPMA and Lansing announcement](https://www.usehatchapp.com/blog/hatch-announces-npma-lansing-partnerships).
- **Evidence:** P2. Distribution relationships are observable strategic assets separate from model capability.
- **Limit:** NPMA's 4,000+ member-company reach is not 4,000 acquired Hatch customers; no acquisition cost or conversion rate is disclosed.

### S08 — Avoca: implementation is becoming part of the product

- **Date:** 2026-09-10 Launchpad announcement.
- **Fact:** Launchpad combines business knowledge capture, ServiceTitan capacity/job-type/business-unit/service-area imports, and implementation assistance for an AI CSR.
- **Scope:** the vendor reports that most contractors complete Agent configuration in under two hours; named examples report three to seven days to go live.
- **Source:** [Launchpad announcement](https://www.avoca.ai/blog/launchpad-onboarding-for-operators-who-move-fast).
- **Evidence:** P2/P3. Configuration time and production go-live time are distinct measurements.
- **Limit:** neither the examples nor the headline establish a universal implementation SLA or verified customer acquisition advantage.

### S09 — Broccoli: customer operations extend beyond answering calls

- **Date:** 2026-10-28 announcement.
- **Fact:** the company announced **$52 million across Series A and Series B**, and describes appointment booking, estimate follow-up, membership renewal, and ongoing customer engagement.
- **Scope:** the announcement also describes preparation before technician arrival and operations across existing customer systems.
- **Source:** [company news release](https://korewire.com/broccoli-raises-52m-led-by-khosla-ventures-to-help-home-services-businesses-book-more-jobs-and-keep-customers-coming-back/); [founders' same-day account](https://www.broccoli.com/blog/thank-you-to-our-customers).
- **Evidence:** P2. The 1,500+ businesses and conversation/appointment totals are company-reported adoption indicators.
- **Limit:** these figures do not establish retention, profit, incremental revenue, or a single $52 million financing round.

### S10 — Rilla: field conversation data supports broader operating outputs

- **Date:** 2026-10-16 product update.
- **Fact:** the updated Rilla Intelligence is described as generating analysis, continuously updated dashboards, coaching materials, and practice content from team conversations.
- **Availability:** the announcement states "Available Now."
- **Source:** [Rilla Intelligence update](https://www.rilla.com/learn/rilla-labs/blogs/introducing-the-all-new-rilla-intelligence).
- **Evidence:** P2/P3. It demonstrates expansion of the advertised product scope beyond recording and transcription.
- **Limit:** "100x more powerful" and "10x cheaper" are vendor marketing statements, not comparable technical benchmarks or independently established customer results.

### S11 — Sameday: an operational console and a visible price anchor

- **Date:** Android listing updated 2026-09-14 and labelled "Initial release" in its release notes; pricing page observed 2026-11-24.
- **Fact:** the application describes calls/texts, conversation history, booking visibility, and AI-rule management from mobile.
- **Price:** the current page lists Launch at $449/month including 500 minutes and Scale at $789/month including 1,000 minutes, with overage charged separately and FSM scheduling included.
- **Source:** [developer-published app listing](https://play.google.com/store/apps/details?id=ai.sameday.app); [official pricing](https://sameday.ai/pricing).
- **Evidence:** P1/P3. This is a current communications-overlay price reference, not proof of a price change within the window.
- **Limit:** it excludes the customer's underlying FSM cost and cannot be compared directly with an entire Runory deployment without matching scope, usage, and service obligations.

## 4. Interpretation: where competition has moved

These are inferences from S01–S11, not independently measured market-wide conclusions.

1. **The outcome spans multiple steps.** Communications vendors increasingly claim booking, follow-up, renewal, and preparation rather than a standalone call-answering feature.
2. **Existing operational context matters.** Deep rule access, reliable writeback, exception handling, and implementation are part of the competitive offer.
3. **External-Agent access is becoming expected.** A protocol connection is useful distribution and interoperability infrastructure, but is insufficient differentiation by itself.
4. **Configuration is competitive territory.** Fieldproxy directly challenges the assumption that Agent-operated, adaptable business software is a new empty category.
5. **Acquisition and delivery are separate capabilities.** Industry partnerships and customer implementation can matter even when underlying model access is similar.

For the Probook comparison, distinguish **execution correctness** from **decision quality**. A runtime can execute a permitted dispatch perfectly without proving that the selected technician was the best business choice. Historical technician revenue can reflect earlier assignment choices as well as performance. Any future Runory optimization claim therefore needs suitable outcome data and an evaluation design, with contribution, service quality, and customer constraints made explicit. This is analytical guidance, not a finding about Probook's undisclosed algorithm, and does not make a generic decision platform the next task.

## 5. Conditional product hypothesis for Runory

Prioritize a bounded repair quote review and handoff delivery: turn existing inspection evidence, customer requirements, and a pricebook or quote into a reviewed scope and actionable handoff.
The proposed buyer is a repair service operator whose sales/inspection and execution teams repeatedly lose time resolving incomplete or conflicting job information.
This buyer profile and willingness to pay remain unvalidated for Runory.

The first value claim to test is reduced preparation/review effort and fewer information handbacks, measured on actual jobs.
Improved conversion, margin, and rework rates are longer-term hypotheses; they must not be promised from this market review.
ArcSite and Fieldproxy are direct comparators, so the proposal must demonstrate a concrete delivery advantage for the selected customer.
Trade familiarity, Chinese-market experience, or an English product site does not establish an acquisition channel in another geography.

Keep the detailed scope, milestones, acceptance criteria, and investment decisions in the [delivery plan](../product/repair-quote-review-and-handoff-plan.md).
This research does not authorize a parallel workflow runtime, a new general-purpose platform, or arbitrary third-party API writes.

## 6. Assumptions corrected by this review

| Earlier or tempting assumption | Correction | Evidence |
| --- | --- | --- |
| AI in field service mainly stops at answering calls. | Vendors extend into capacity-aware booking, dispatch, follow-up, and customer operations. | S01, S06, S08, S09 |
| Probook is only a dispatch tool. | Dispatch is its starting point; the published product boundary includes adjacent front-office operations. | S01 |
| MCP plus an external Agent is a unique product position. | Direct competitors already ship or document this access; prove workflow and delivery value. | S02, S03 |
| An MCP connection exposes the full vendor API. | Tool coverage, authorization, plan entitlements, and write permissions require separate verification. | S03, S06 |
| Jobber MCP writes only clients, properties, and requests. | The documented scope also includes creating, but not later editing, quotes. | S03 |
| Inspection-to-quote-to-handoff is an uncontested wedge. | ArcSite directly serves this workflow, including waterproofing; configuration alone is also contested. | S02, S04 |
| ServiceTitan AI estimates are generally available across trades. | The cited builder remains selected-account Private Preview for HVAC replacement. | S05 |
| Funding and published uplift prove Runory's commercial opportunity. | They demonstrate competitive activity; Runory demand, distribution, retention, and economics remain separate questions. | S01, S07–S11 |

## 7. Implications for durable engineering

The evidence supports continuing a coherent technical foundation while testing a bounded commercial delivery.
Candidate reusable assets are sourced business facts, versioned rules/pricebooks, explicit proposal approval, governed Commands, execution evidence, and repeatable Packs.
Implement them through existing Runory contracts; competitor feature lists are not a mandate to add new abstractions.
Engineering can complete and evaluate one working delivery before commercial validation is complete.
Expansion into additional trades, channels, or modules needs evidence beyond successful implementation of the first Pack.
Detailed investment boundaries belong to the product plan, not to a vendor announcement or this evidence record.

## 8. Open questions and maintenance

- Which reachable buyer has recurring review/handoff work, usable records, and authority to purchase the proposed delivery?
- How does the complete job compare with that buyer's current process and with ArcSite/Fieldproxy, including onboarding and ongoing support?
- Which external systems permit the required reads and writes for that buyer's plan, role, integration approval, and region?
- Can the second similar customer reuse the same Pack without a customer-specific code fork?
- What effort, usage, support, and acquisition costs remain after the first deployment?

Record later evidence as dated additions or a new review; do not silently reinterpret this cutoff as current availability.
Recheck pricing, entitlements, preview status, and connector write boundaries before implementation or procurement decisions.

## Related documents

- [Product Definition](../product/product-definition.md)
- [Repair Quote Review and Handoff Plan](../product/repair-quote-review-and-handoff-plan.md)
- [External Benchmark Adoption Guardrails](../product/external-benchmark-adoption-guardrails.md)
