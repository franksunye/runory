# External Benchmark Adoption Guardrails

| Metadata | Value |
| --- | --- |
| Status | `active` |
| Topic | `architecture` |
| Applies to | `v0.6+` |
| Owner | Product / Architecture / Engineering |
| Last reviewed | 2026-07-27 |
| Supports | [Product Roadmap](product-roadmap.md), [Engineering Benchmark Adoption Roadmap](engineering-benchmark-adoption-roadmap.md) |
| Research inputs | [Adjacent Platform Landscape](../research/adjacent-platform-landscape.md), [Twenty Platform Benchmark](../research/twenty-platform-benchmark.md) |
| Supersedes | — |
| Superseded by | — |

## 1. Purpose

Runory intentionally studies Twenty, NocoBase, Frappe, Windmill, Directus, Odoo, and other adjacent platforms. The purpose is to avoid closed-door design, reduce avoidable mistakes, and adopt proven engineering and UX patterns at the right milestone.

External research must not turn into feature accumulation, parallel frameworks, or premature platform expansion.

The governing principle is:

> **Look outward continuously, but build inward coherently.**

External products are evidence and reference implementations. They are not product backlogs, architectural owners, or feature-parity targets.

## 2. Four Mandatory Questions

Before an external capability enters a milestone, the proposal must answer all four questions:

1. **Which explicit current problem does it solve?**
2. **What concrete loss, risk, or future rework occurs if it is not implemented now?**
3. **Can it be implemented through an existing Runory model and contract?**
4. **What ongoing complexity, migration burden, and maintenance cost does it add?**

If any answer is unclear, the default decision is **Defer**.

## 3. Reference Is Not Scope

The existence of a capability in Twenty, NocoBase, Frappe, Windmill, Directus, Odoo, or another platform does not make it a Runory requirement.

A capability may enter scope only when it directly supports:

- the current Product Roadmap milestone;
- the binding Engineering Maturity Gate;
- a repeated and credible FSM customer need;
- or the prevention of a destructive future rearchitecture.

Runory must not pursue feature parity with any reference platform.

## 4. One Problem, One Runory Model

External concepts must converge into Runory-owned contracts. They must not create parallel foundations.

Examples:

```text
Twenty Saved View
Directus Layout
NocoBase Block
→ one Runory Object View Definition
```

```text
Twenty Workflow Canvas
Windmill Flow Runtime
Frappe Approval Workflow
→ one Runory Workflow Definition, Version, Instance, Work Item, and Run model
```

```text
Twenty App
NocoBase Plugin
Frappe App
Odoo Module
→ one Runory Module / Pack / Workspace Extension Manifest and lifecycle
```

The following are prohibited without an explicit architecture decision:

- a second View model;
- a second Workflow Runtime;
- a second Manifest or extension lifecycle;
- a second authorization model;
- an alternate Agent capability contract;
- a mutation path that bypasses governed Commands;
- page-specific infrastructure that duplicates shared platform capability.

## 5. Adapt, Do Not Copy the Product Center

Runory may borrow a proven interaction or engineering pattern while changing its semantics to fit Runory.

Examples:

- borrow Twenty's saved-view and record-page interaction quality, but surface FSM execution state, owner, SLA, risk, exception, and next action;
- borrow Twenty's Workflow Builder canvas, but keep workflows Agent-managed, human-governed, Runtime-owned, and Command-driven;
- borrow Windmill's retry and run diagnostics, but do not introduce a general user-script execution path;
- borrow Frappe and Odoo module-lifecycle lessons, but preserve Official Module, Industry Pack, and Managed Workspace Extension ownership;
- borrow Directus and NocoBase metadata composition patterns, but do not turn v1.0 into a general-purpose low-code platform.

## 6. Limit Structural Change Per Version

A version should normally contain no more than **two or three externally inspired structural changes**.

A structural change means a new shared platform abstraction, runtime contract, cross-module lifecycle, or foundational Product Surface model—not a small component improvement.

For example, the bounded v0.8 structural set is:

1. convergence of the existing View Definition and shared action surface;
2. minimum customer-access authorization and presentation boundary;
3. business-readable Workflow Overview/Run projection over existing Workflow V2.

Agent-generated official MPT, a full Workflow Builder, and broad Local
deployment automation are deliberately outside this set.

Additional large platform initiatives should be deferred unless one replaces or simplifies an item above.

This limit is a planning guardrail rather than an absolute numeric law. Exceeding it requires an explicit architecture and delivery review showing that the changes form one coherent implementation rather than several independent platforms.

## 7. FSM-first Until the Roadmap Changes

Through v1.0, platform engineering must support the canonical Reactive Repair / Callout FSM product.

Therefore:

- Object View work must be proven first on Customer, Work Order, and a commercial FSM object;
- Workflow Builder work must visualize and govern real FSM Commands and approvals;
- Manifest and Pack work must first support repeatable FSM implementation;
- Agent capability work must first support real FSM configuration and operation;
- Local deployment work must first support maintained FSM reference solutions.

A generic capability is justified only when it is the simplest shared foundation for these bounded FSM outcomes.

## 8. Complexity Budget

Every adoption proposal must state its complexity impact in five areas:

| Area | Required assessment |
| --- | --- |
| Runtime | New services, state, contracts, concurrency, failure, and recovery behavior |
| Data | New schemas, identifiers, migrations, compatibility, and repair implications |
| UX | New concepts users must understand and new interaction states to maintain |
| Delivery | Installation, configuration, deployment, support, and upgrade burden |
| Ecosystem | Dependency, licensing, security, and upstream-change exposure |

A capability should not be adopted merely because its initial implementation is easy. The decision must account for long-term ownership.

## 9. Simplification Test

An externally inspired capability should ideally reduce total system complexity by doing at least one of the following:

- replacing multiple page-specific implementations with one shared model;
- eliminating customer-specific Core changes;
- reducing Agent context, calls, or ambiguity;
- making failure diagnosis and repair safer;
- making upgrades and compatibility machine-checkable;
- unifying terminology and behavior across desktop, mobile, voice, payment, and Agent access.

If it only adds a new surface without retiring duplication or strengthening a milestone guarantee, it is usually not ready for adoption.

## 10. Decision Classification

Every observed capability must be classified:

- **Adopt** — use substantially as an established pattern;
- **Adapt** — keep the core idea but redesign for Runory contracts;
- **Defer** — valuable, but not required now;
- **Reject** — conflicts with Runory's product boundary or architecture.

The default is not Adopt. The default is to understand the pattern, then decide deliberately.

## 11. Required Decision Record

```text
Reference platform:
Observed capability:
Current Runory problem solved:
Cost of not doing it now:
Existing Runory model reused:
New long-term complexity introduced:
Simplification or duplication removed:
Classification: Adopt / Adapt / Defer / Reject
Target version:
Architecture owner:
Product/UX owner:
Acceptance evidence:
Migration and compatibility impact:
License and dependency impact:
```

## 12. Release Review

Before accepting an externally inspired structural capability into a release, reviewers must confirm:

- it supports the current milestone rather than a hypothetical future platform;
- it maps to one canonical Runory model;
- it does not bypass Business Commands or governance boundaries;
- it has bounded minimum scope;
- deferred portions are written explicitly;
- it includes acceptance evidence and an operational owner;
- its maintenance cost is acceptable;
- it does not push the version beyond a manageable structural-change budget.

## 13. Final Rule

```text
One version, one primary product outcome.
One problem, one shared Runory model.
External patterns must pass explicit selection.
Platform capability must serve the active FSM roadmap.
New abstraction should reduce total complexity, not merely add sophistication.
```

> **Runory should study broadly, choose narrowly, and implement coherently.**
