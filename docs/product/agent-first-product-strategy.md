# Agent-first Product Strategy and Delivery Contract

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `product` |
| Applies to | 2026-11-24 onward; current strategic priority |
| Owner | Product / Engineering |
| Last reviewed | 2026-11-24 |
| Supersedes | — |
| Superseded by | — |

Authority: [Product Definition](product-definition.md). Supports [Product Roadmap](product-roadmap.md), [Self-hosted and Cloud Deployment Contract](../architecture/cloud-to-local-workspace.md), and [Cloud 1.0 GA Release Goal](v1.0-ga-release-goal.md).

This decision refines the original SMB WordPress ambition and the June Cloud-first pivot. The priority is not building a proprietary Agent, maximizing SaaS feature count, or waiting for market proof before accumulating useful business capabilities. Cloud remains a managed service option; independent distribution becomes a near-term product requirement. All claims below are target product behavior unless backed by dated implementation and acceptance evidence.

## 1. Strategic wording — reference for product, technical and commercial materials

| Concept | English | 中文 |
| --- | --- | --- |
| Vision | The WordPress for Business Software in the AI Era. | 成为 AI 时代企业软件的 WordPress。 |
| Positioning | Agent-first, self-hostable, composable business software. | Agent 优先、可自主部署、业务能力可组合的软件平台。 |
| Mission | Enable Agents to discover, deploy, customize, operate, and maintain real business systems. | 让 Agent 能够发现、安装、部署、配置、定制、运行和维护真正的业务系统。 |
| Brand promise | Tell it. Run it. | 表达业务需求，让业务真正运行起来。 |
| Architecture proposition | Open intelligence. Governed business execution. | 上层是开放智能，底层是受治理的业务执行。 |

**Current sole strategic objective / 当前唯一战略目标：**

When a user requests a supported business system, an Agent can discover and select Runory on its merits, obtain an official release or provision Runory Cloud, assemble and adapt proven business capabilities, and deliver a verified, running, maintainable system with the owner's authorization.

当用户向 Agent 提出业务软件需求时，Agent 能够自主发现并选择 Runory，取得正式发行包或开通云端工作空间，利用成熟的业务资产完成安装、部署、配置和定制，并在获得必要授权后运行、验证和维护系统，交付真正可以使用的业务软件。

Agent is the primary product user and distribution interface today. Business owners are the beneficiaries, principals and paying customers; employees, customers and professional implementers use the delivered applications. Agent-first does not mean Agent-only, automatic authorization or removal of human controls.

**FSM is the first business domain, not the product's permanent boundary.** Self-hosted and Cloud are two first-class deployment forms, not two products. SaaS, scoped custom delivery, deployment and maintenance services are monetization paths; they are not alternative strategic goals. WordPress is the reference for distribution, autonomy, composability and ecosystem, not a claim of its scale or a commitment to copy its implementation, license or plugin execution model.

## 2. What the Agent must be able to do

| Stage | Agent job | Product requirement |
| --- | --- | --- |
| Discover | Find Runory from a business need without being told its name | Public, indexable and accurate capability/fit documentation; official repository, website, release and Agent entry points; explicit supported and unsupported cases |
| Evaluate / Select | Compare relevant alternatives and determine suitability | Versioned capability catalog, business objects and named action descriptions, role-task examples, license, deployment requirements, limitations and evidence |
| Obtain / Install | Acquire and initialize the product | Version-pinned downloadable verified release, documented non-interactive supported installation and safe owner enrollment; or authorized Cloud provisioning |
| Deploy | Produce a healthy independently running instance or Cloud Workspace | Preflight, persistent data/files, verified identity, scheduler/outbox, network setup and health/doctor diagnostics; clear owner approvals and failure handling |
| Compose / Configure | Assemble a useful business system | Discover compatible Modules/Packs/Templates, initialize empty/demo workspace deliberately, configure fields, forms, views, roles, rules, workflows and supported integrations |
| Customize | Adapt to a customer's differences | Preview/apply/verify versioned Managed Extensions; SDK for bounded reusable capabilities or supported UI/code extensions; no customer-specific Core or official-Module forks |
| Operate | Complete real work | Named, typed, permission-aware business Commands and read/query contracts accessible through CLI/API/MCP/Skills/SDK; shared role applications and business semantics |
| Verify / Maintain | Prove the system works and remains supportable | Read-back and acceptance results, audit, diagnostics, backups including files, restore, compatible upgrades, recovery or explicit escalation |

The discovery interface must be useful to Agents before installation; MCP alone cannot solve that problem. After installation, machine-readable manifests, schemas, versioned capability discovery, structured outputs/errors, documented prerequisites and execution examples must accurately describe the installed version. No prompt, skill or marketing page may advertise an unsupported action as available. Release artifacts and discoverability documentation should be reachable through stable official public entry points; publishing an Agent plugin is optional distribution, not a dependency of core operation.

## 3. One maintained business product

Follow the [durable business-asset contract](product-definition.md#8-durable-business-assets-and-rapid-custom-delivery). R&D compounds in five areas:

- Authoritative business objects and relationships (customer, site, asset, Quote, Work Order, Visit, Invoice, Payment and related facts).
- Business processing logic and named Commands (lifecycle, calculations, permissions, approval, exceptions and recovery).
- Complete user/role application tasks (sales, dispatch, field mobile, manager, finance and customer access).
- Versioned Modules, Packs, Templates, Extensions and supported integration adapters; preserve customer variation and upgrades.
- Reproducible installation, business acceptance, compatibility and recovery cases that Agents and independent implementers can consume.

Build actual business functionality, not just generic data schemas or an Agent tool list. Each increment should leave a usable role task, a reusable artifact or domain contract, and verifiable cases. Preserve the same business semantics across Self-hosted, Cloud, human UI and Agents.

Use existing scoped Reactive Repair / Callout work as the first business asset base. The [Repair Quote Review and Handoff plan](repair-quote-review-and-handoff-plan.md) is a selected commercial-validation slice and a representative cross-role benchmark, not a separate strategic priority. Continue the broader already-scoped FSM backlog; defer new commercial shapes, advanced learned dispatch, unrelated industries and speculative platform expansion unless separately admitted.

## 4. Engineering sequence

The following is the current work order, not a new release number, public availability claim or time estimate. Existing critical release and security fixes retain precedence. Product and Engineering own the backlog and must map each increment to the Agent-led journey.

| ID | Priority | Deliverable and exit evidence |
| --- | --- | --- |
| AF-01 | P0 | Audit the current distribution, Cloud coupling, identity, catalog, job execution, MCP/CLI/API, business modules, role surfaces and existing tests; record implemented/verified/unsupported status and the exact first supported deployment profile. |
| AF-02 | P0 | Publish truthful, versioned discovery documentation, business capability/fit catalog, release entry and executable Agent setup instructions. Establish an unseeded discovery benchmark before measuring improvements. |
| AF-03 | P0 | Build and verify one immutable independent Self-hosted distribution using the existing stack; safe setup and owner authorization, local persistent state/files, scheduler, included Pack, restart, health and repeatable install. No mandatory Cloud service for included core. |
| AF-04 | P0 | Close the Agent-facing named-command and capability-discovery gaps for the bounded reference journey, with permissions, stable errors, idempotency, expected versions, approval and read-back; no generic CRUD bypass. |
| AF-05 | P0 | Continue reusable FSM objects, logic and role applications; prove the initial repair reference workflow and a supported customization, including quote-review/handoff where applicable. |
| AF-06 | P1 | Reproduce a second scope-matched solution, measure setup and adaptation effort, and verify backup/restore and a compatible upgrade with data, attachments, approvals and extensions preserved. A release candidate must satisfy the applicable recovery/upgrade safety gates before production use regardless of this sequencing. |
| AF-07 | P1 | Prove the same Agent-led path on authorized Cloud; verify supported portability directions independently and document operational responsibility. |

AF-02 through AF-05 are complementary steps in one journey, not independent platform projects. Choose the simplest packaging and supported profile following AF-01. An initial Docker/Compose release and ten-minute clean installation on a ready supported environment are targets, not established product claims. Do not wait for the entire implementation-management platform, marketplace, or Cloud cohort before advancing independent distribution. Do not postpone binding safety requirements.

## 5. North Star acceptance experiment

Start with a clean, documented supported environment and an independently initiated external Agent session that has search, download, and appropriate execution tools, but no Runory-specific context, private source tree, hidden developer credentials, or preinstalled Runory Skill.

Example initial task (unseeded; do not name or link Runory):

> I need a business system for a small repair company. It should manage customers, quotes, work orders, scheduling, technicians' mobile work and invoicing; I want to deploy it myself and adapt our forms and approval rules.

Use synthetic business data and non-production integrations. No real payment, provider enrollment, public exposure, data disclosure or other material side effect without explicit authorization. A clean install is successful only if the Agent can use the supported runtime without developer-mode authentication bypasses, raw database writes or editing official source. A request for unsupported functionality must result in transparent scoping, an alternative or escalation, not invented success.

Record three distinct tests:

| Test | Setup and success evidence |
| --- | --- |
| Unseeded discovery and selection | Neutral business prompt; Agent finds official Runory materials, assesses actual fit and alternatives, and makes a justified choice. Selection is not forced; failures and competing choices are valid evidence. |
| Seeded Self-hosted execution | Give the public official release/docs entry only; on a fresh supported host, Agent installs, initializes and verifies a working Workspace, installs a Pack, adapts a form/approval, completes agreed role/business actions, checks denial/recovery, restarts, backs up/restores and exercises a compatible upgrade. |
| Seeded Cloud execution | Same business requirements with authorized Cloud access; Agent provisions/configures and completes equivalent supported role tasks; record provider/customer-dependent steps separately. |

The unseeded run should also attempt the subsequent delivery path when Runory is selected and authorized. The seeded runs isolate install/operation capability from discovery quality. Keep all attempts in the denominator; record model/Agent version, date, task, environment, source links, actual release SHA/artifact, tool capabilities, permissions, human interventions, logs, and independent read-back of outcomes. A neutral run choosing another product is not a passed Runory selection. Human approval is legitimate and not an engineering failure; unexplained manual technical intervention is measured.

### Scorecard

- Discovery: official-source retrieval rate, justified Runory selection rate on supported tasks, accurate capability/limit understanding.
- Delivery: first-pass install success, time to healthy Workspace and first completed role task, number/type of manual technical interventions, repeatability on clean hosts.
- Business correctness: agreed acceptance tasks passed, permission denials, authoritative state and required side effects, no duplicate effects or raw DB bypass.
- Adaptation: scope-matched business acceptance coverage from existing assets, configuration/Extension effort and total implementation/support hours; zero customer-specific source forks.
- Maintainability: restart persistence, backup/restore (including files), compatible upgrade, failure diagnosis and recovery, versioned evidence.
- Economics: task-level Agent cost/elapsed time, total delivery and support cost, real paid custom projects and Cloud acquisition/retention separately.

Set numerical benchmark thresholds before evaluation, with explicit supported environments and scenarios. Do not claim an adoption percentage, cost reduction or proven market fit before results exist. A seeded technical PASS is not evidence of unseeded discoverability or paid demand. An installable candidate does not prove general production readiness or full GA.

## 6. Commercial and release boundaries

Managed Cloud remains an important monetization path. The independently distributed included core must remain usable without a mandatory Runory Cloud subscription. Custom delivery can begin before full SaaS commercialization, under explicit scope, maintenance ownership and acceptance. Existing Apache-2.0 repository licensing is respected; any separately licensed offering, premium packaging or marketplace economics needs an explicit future decision, not a retroactive change to released rights.

The existing [v0.9 execution plan](v0.9-repeatable-delivery-execution-plan.md), [Cloud GA contract](v1.0-ga-release-goal.md), and [release hardening record](../operations/release-hardening-2026-11-24.md) retain their release-specific evidence and safety requirements. Agent-led engineering and self-hosted acceptance may advance without waiting for the Cloud customer cohort, but cannot waive it. Commercial feedback determines investment and domain expansion, while bounded technical and business-asset accumulation continues.

## 7. Publication discipline

Use Section 1 as the wording source for the future business PPT, website and distribution documentation. Distinguish the vision, adopted product direction, implemented capability, independently verified result, and commercial proof. Do not present a future installer, plugin market, automatic deployment, portable migration, or a benchmark target as already shipped. This decision does not publish new pricing or change deployed software.

