# Runory Vision

Status: Draft v0.2  
Date: 2026-06-18  
Change: Cloud-first pivot — see [04-architecture-pivot-cloud-first.md](04-architecture-pivot-cloud-first.md)

## Vision

> **Every small business should have software that understands its needs, keeps running, and grows with the business.**

Runory believes future business software will no longer require users to learn complex systems, nor be defined by fixed menus and preset workflows.

Business owners only need to express needs, provide information, and initiate tasks through an Agent.

Runory turns those intentions into:

* real business data;
* running business capabilities;
* reliable processes and rules;
* interfaces that appear when needed;
* business systems that continuously evolve.

> **Users express business intent; Runory makes the business actually run.**

---

## Product Positioning

> **Runory is a Cloud-first, Agent-native SMB business operations platform — close to WordPress for the SMB era, but with an Agent performing installation, configuration, extension, validation, and continuous operation inside a governed platform structure.**

Runory runs on top of the Personal Agent OS, but **Runory Cloud is the default entry point for ordinary SMB users**, not the local Runtime.

It provides capabilities to Agents and users through:

1. **Business Packs / Workspace Templates**: quickly start a complete business experience;
2. **Official Modules**: installable and upgradable standard business capability units;
3. **Managed Workspace Extensions**: governed personalization and extension;
4. **Built-in Agent**: configuration, operation, and analysis assistant inside Cloud Workspace;
5. **MCP / SDK** (advanced channel): for developers, integrators, and private deployment scenarios.

Internally, Runory is managed by a deterministic **Platform Core**:

```text
Object / Field / View / Form / Workflow
State / Permissions / Audit / Module Lifecycle
```

The Agent understands user intent and converts it into governed configuration changes.

Runory is responsible for making intent happen correctly in the business context, while ensuring official capabilities remain upgradable and user-specific differences remain isolated.

---

## Core Product Promises

### From intent to operation

The user says:

> I need expense management.

Runory installs the corresponding Pack, data starts flowing in, and the Dashboard starts changing.

The user says:

> Add a "Customer Tier" field to customers.

The Agent creates a Workspace Extension; lists and forms update, while the official CRM Module remains upgradable.

### Software adapts to the business

Traditional software requires users to adapt to the system.

Runory lets software grow with users' business needs — through Packs, Templates, and governed Extensions, not by modifying official module source.

### Agent executes, user controls

The Agent handles imports, configuration, creation, organization, queries, and workflow changes.

Users inspect, edit, review, and control key operations through the UI.

### Dynamic, but controlled

Interfaces and capabilities can change dynamically, but every business operation goes through deterministic rules, permissions, transactions, and audit. The Agent does not directly modify the database or official module source.

### Cloud-first, portable runtime

The default experience is Cloud; the architecture preserves a Private / Local deployment path from day one. Workspace configuration, Extensions, and Module installation state should be exportable.

---

# Product Principles

## 1. Cloud-first, Portable-runtime

Runory Cloud is the default product entry point. Core Runtime must be able to run independently to support future Private Cloud, VPC, On-premise, and Local Dev.

## 2. Agent-first

Conversation is the primary entry point; UI is the observation and control surface. The Built-in Agent is the default SMB operation layer; Codex / MCP is the advanced extension channel.

## 3. Business-first

Runory does not deliver code; it delivers running business capabilities. Core is not responsible for "how a certain type of company operates," but for "how business capabilities are defined, installed, composed, extended, upgraded, and run."

## 4. Composable platform

Finance, CRM, field service, employee, and other capabilities are composed on demand through Modules and Packs, sharing a unified metadata-driven business object model.

## 5. Deterministic core

LLMs are responsible for understanding, recommending, and orchestrating; Platform Core and Business Engine are responsible for validation, Diff, Apply, and Audit.

## 6. No direct module customization

User personalization must not pollute official Modules. All customer customization lands first in the **Managed Workspace Extension** layer.

## 7. Human-in-the-loop

Low-confidence, high-risk, and irreversible operations must be confirmed or reviewed by the user. Agent configuration changes must support Diff Preview and Rollback Point.

## 8. Visible progress

After the Agent completes work, users must be able to see that software truly changed: lists added, metrics updated, menus appeared, new pages opened, and business states changed.

## 9. Marketplace-ready from day one

Even if the MVP does not include a full Marketplace, Module Manifest, version, dependency, permission, and migration models must be reserved from day one of the architecture.

Before Marketplace, first complete the Official/Internal Catalog & Release Control Plane: immutable artifacts, structured validation, Sandbox, release channels, Pack dependency lock, Workspace upgrade, and rollout. See [09-catalog-release-control-plane.md](09-catalog-release-control-plane.md).

The Module SDK must become a real developer product: typed authoring, local validation, testing harness, artifact build, Internal candidate publish, and Agent Skill; the public third-party ecosystem is deferred. See [10-runory-sdk-product.md](10-runory-sdk-product.md).

---

# Product Roadmap

## Phase 0 — Cloud POC

### Prove that Cloud Workspace can be configured and extended by Agent

Goal:

> Validate that users can create a Workspace in Runory Cloud, install a Business Pack, and have an Agent perform governed Extension configuration.

Core scenarios:

* user signs up and creates a Cloud Workspace;
* user selects a Workspace Template and installs CRM Lite or Field Service Lite Pack;
* Agent adds a "Customer Tier" field to the customer object and updates View / Form;
* Agent creates a simple approval workflow (for example, quotes over 100,000 require manager approval);
* all changes have Diff, Audit, and Rollback;
* Workspace configuration is exportable, proving Cloud-first does not lock out the Local path.

Success signal:

> When users see the demo for the first time, they can immediately understand:
> "I selected a business Pack in Cloud, the Agent added fields and workflows for me, and the software is really running."

---

## Phase 1 — MVP

### Establish the first sustainably usable Cloud business workspace

Goal:

> Evolve from a demo system into a Cloud business application that small businesses can use continuously.

Core capabilities:

* Multi-tenant Cloud Runtime;
* Auth / Organization / User / Role;
* Module Install / Upgrade / Disable;
* Business Pack and Workspace Template;
* Managed Workspace Extension;
* Built-in Agent and Agent Operation API;
* Diff / Audit / Rollback;
* data import;
* Schema-driven UI Shell;
* basic Usage Metering and Billing-ready Account Model.

The current SaaS Core product boundary is defined as Email OTP, Organization/Workspace, fixed RBAC, strong tenant isolation, audit/API Key, Entitlement/Usage/Billing, and Migration/Backup/Deletion. Team, SSO/SCIM, and advanced compliance capabilities are reserved only architecturally. See [07-saas-core-boundaries.md](07-saas-core-boundaries.md).

Success signals:

* real SMBs continuously use Cloud Workspace;
* data accumulates continuously;
* users mainly use the Built-in Agent for daily operations and configuration;
* UI is used for review, viewing, and management;
* users are willing to pay for continuous use.

---

## Phase 2 — Vertical Product

### Form a complete business loop in one industry

Goal:

> Move from general platform validation into one clear industry and establish real business value.

Preferred directions:

* Home Services;
* small repair and construction businesses;
* small stores;
* professional services firms.

Core capabilities:

* industry Business Pack;
* industry Workspace Template;
* customers, leads, quotes, projects, employees, expenses, suppliers, tasks, reports;
* industry workflows and Agent Skills.

Success signals:

* clear PMF in a single industry;
* Agent operations replace a large amount of repetitive back-office work;
* Runory becomes one of the entry points for day-to-day business operations.

---

## Phase 3 — Marketplace & Private Deployment

### Expand from a single product into a platform and advanced deployment model

Goal:

> Open the Module / Pack ecosystem and support enterprise-grade Private / Local deployment.

Core capabilities:

* Module Marketplace and developer accounts;
* third-party Packs and Templates;
* Workspace export and Private Cloud deployment;
* Adapter layer (Auth, Storage, Queue, LLM, Email, etc.);
* enterprise-grade audit and governance.

Success signals:

* third parties can deliver industry Packs and Modules;
* large customers can choose Private / On-premise deployment;
* Cloud and Private share the same Core and Module model.

---

## Phase 4 — Runory Platform

### Build an Agent-native Business App ecosystem

Goal:

> Let developers and industry experts build business modules for Runory, while Agents help SMBs discover and install them on demand.

Platform components:

* Module SDK / Pack SDK / Template SDK;
* Business Object SDK;
* Agent Skill SDK;
* MCP Tool SDK;
* Dynamic UI Schema;
* Component Registry;
* Domain Pack Marketplace;
* PAO Adapters.

Success signals:

* Runory capabilities are no longer built only by the internal team;
* multiple industries form independent ecosystems;
* Runory becomes an important SMB application layer on the Personal Agent OS.

---

# Long-term Shape

Future Runory is a **Headless Business Platform**:

```text
Personal Agent OS
        ↓
Runory Cloud (default entry)
        ↓
Built-in Agent + MCP / SDK (advanced channel)
        ↓
Platform Core
        ↓
Modules · Packs · Templates · Workspace Extensions
        ↓
Business Data · Rules · Workflow · Audit
        ↓
Optional Private / Local Deployment
```

Users converse with the Agent most of the time.

Runory continuously maintains the business state of the company in Cloud (or Private Runtime).

When users need to view, compare, review, or configure something, the corresponding UI appears.

> **Conversation expresses intent, the Agent completes governed configuration, and Runory maintains business facts.**

---

# Runory's End State

Runory's end state is not to become the SMB software with the most features, nor to become another AI Coding platform.

Runory wants to become:

> **WordPress for the SMB era — a composable, extensible, Agent-operated business operations platform.**

The difference is not that "users install plugins themselves, handle conflicts themselves, and find developers themselves," but that **the Agent performs installation, configuration, extension, validation, and continuous operation within a governed platform structure**.

When a business owner has a new business need, they no longer first search for, buy, and learn a new SaaS.

They simply tell the Agent:

> I need this capability now.

Then Runory makes it start running.

---

# Brand Expression

## One-sentence definition

> **Runory turns business intent into running software.**

## Brand promise

> **Tell Runory what your business needs. Runory makes it operational.**

## Brand tagline

# **Tell it. Run it.**
