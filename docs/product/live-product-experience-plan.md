# Runory Live Product Experience Plan

| Metadata | Value |
| --- | --- |
| Status | `proposed` |
| Topic | `product` |
| Applies to | Website and public demo experience, v0.5+ |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-16 |
| Supersedes | — |
| Superseded by | — |

## Purpose

Runory should not rely on static screenshots and a single demo video to establish product credibility. The website should let visitors experience a controlled version of the real product and understand, within seconds, how a business request becomes governed field-service execution.

This initiative turns the website's product-proof section into a dedicated **Runory Live Experience**.

It supports the canonical [Product Definition](product-definition.md) and demonstrates the existing product, demo data, FSM scenarios, Agent interface, and governed execution model. It does not redefine the core product boundary.

## Product principle

> The strongest proof of Runory is not that a system exists. It is that a visitor can express an operational intent and see Runory create controlled business results.

The experience should show real product surfaces and realistic business data. Marketing animation may guide the experience, but it must not imply capabilities that the product cannot perform.

## Desired visitor outcome

Within 30–60 seconds, a visitor should be able to understand or experience the following sequence:

1. A customer request enters through voice, messaging, web, or an Agent prompt.
2. Runory identifies or creates the customer and service request.
3. A governed command creates a work order or follow-up task.
4. The system schedules, assigns, or requests approval as required.
5. The relevant workspace and mobile views reflect the change.
6. The visitor can see the audit trail and resulting business state.

The experience should answer three questions directly:

- Is this a real operational product?
- Can it run an end-to-end field-service workflow?
- Can external Super Agents safely configure and operate it?

## Website experience structure

### 1. Interactive hero

The first screen should contain a lightweight Agent input rather than a passive product image.

Suggested headline:

> Tell Runory what needs to happen.

Suggested example prompts:

- Create a work order for a leaking roof.
- Schedule an inspection for tomorrow morning.
- Show overdue quotes that need follow-up.
- Add a site-inspection step before quotation.

The initial implementation may use a bounded set of supported intents. The visible response should use real Runory UI components and show an execution sequence such as:

```text
Understanding request
→ Customer found
→ Work order created
→ Inspection scheduled
→ Customer notified
```

The first release does not need unrestricted natural-language execution. Reliability, speed, and truthful representation are more important than prompt breadth.

### 2. Scenario-based interactive demos

The website should provide three primary scenarios.

#### Voice Intake

A customer calls, the request is understood, customer and site data are captured, and a work order is created or routed for confirmation.

#### Quote to Dispatch

A quote is accepted, a work order is scheduled, the appropriate field resource is assigned, and the customer is notified.

#### Agent Follow-up

Runory identifies an overdue or unaccepted quote, applies the configured condition, creates a follow-up action, and either executes it or requests approval.

Each scenario should be completable in approximately 60–90 seconds. A guided interactive walkthrough is preferred to a long linear video.

### 3. Real product surfaces

The website should show three authentic product surfaces.

#### Operations Workspace

Representative content:

- Leads and customers
- Quotes and contracts
- Work orders and visits
- Scheduling and dispatch
- Invoice, payment, and completion state

#### Mobile Execution

Representative content:

- Assigned visit
- Customer and site context
- Inspection forms
- Photos and evidence
- Completion and customer confirmation

#### Agent Interaction

Representative content:

- Natural-language request
- Interpreted plan
- Proposed commands
- Permission or approval state
- Execution result and audit record

Each surface should include a real full-product view, two or three meaningful state transitions, a concise outcome statement, and a clear entry to the relevant demo scenario.

### 4. Supporting video and screenshots

Screenshots and videos remain useful, but they are supporting evidence rather than the primary experience.

Recommended assets:

- Three 20–40 second scenario clips
- One two-minute end-to-end overview
- High-resolution screenshots of each primary surface
- Optional annotated clips for security, audit, and rollback behavior

All assets should use the same seeded workspace and scenario data so the website, videos, sales demos, and documentation remain consistent.

## Demo workspace design

A dedicated public demo environment should be created at a separate domain or subdomain, for example `demo.runory.com`.

### Required characteristics

- Dedicated demo organization and workspace
- Seeded customers, sites, quotes, work orders, visits, invoices, and audit history
- Anonymous or low-friction visitor sessions
- Session-level data isolation where writes are allowed
- Automatic reset on a fixed schedule or after each session
- Disabled exports, destructive administration, credential changes, and external integrations
- Rate limits and abuse controls
- Clear visual indication that the visitor is in a demo workspace
- Synthetic data only

### Demo data model

The first dataset should represent one coherent home-service company rather than disconnected examples. It should contain:

- 20–30 customers and service sites
- Multiple lead sources
- Quotes in draft, sent, accepted, rejected, and overdue states
- Work orders across scheduling, field execution, completion, and follow-up
- A small dispatcher and technician roster
- Realistic activity history and audit events
- At least one exception, escalation, and approval-required action

### Reset model

The preferred model is:

1. Start from an immutable seed snapshot.
2. Create a session-scoped workspace or data overlay.
3. Allow only approved demo commands.
4. Destroy or reset the session automatically.

A simpler shared workspace with scheduled resets may be used for the first release, provided concurrent visitors cannot meaningfully interfere with one another.

## Interaction and execution boundary

The public experience must execute through the same governed Command boundary used by Runory. It must not write directly to business tables.

Recommended flow:

```text
Visitor input
→ Supported-intent resolver
→ Demo command plan
→ Validation and permission check
→ Optional confirmation
→ Runory command execution
→ Workspace state update
→ Audit and result display
```

The experience should begin with allow-listed commands and entities. Unsupported prompts should produce a useful explanation and present supported examples rather than attempt unrestricted execution.

## Safety and trust requirements

The demo must reinforce Runory's governed execution model.

- No production customer data or credentials
- No unrestricted database access
- No arbitrary external HTTP calls
- No real phone calls, SMS, email, or payments without an explicit isolated test provider
- High-impact operations disabled or simulated
- Permission checks applied to every command
- Human confirmation visible for approval-required actions
- Every state change recorded in the audit trail
- Reset and rollback behavior tested before public release

The demo should visibly distinguish between an Agent proposal, an approved command, and a completed business action.

## Delivery phases

### Phase 1 — Product proof foundation

Target: 1–2 weeks.

Deliverables:

- Replace placeholder marketing imagery with real product screenshots
- Produce three short scenario videos
- Build two or three guided interactive demos using a dedicated demo tool or a lightweight in-house walkthrough
- Add a simulated hero prompt with supported examples and deterministic outcomes
- Establish the first canonical demo dataset

Acceptance criteria:

- Visitors can reach a real product interaction from the homepage without registration
- Every demonstrated state exists in the current product
- The experience works on desktop and mobile web
- No production systems or data are exposed

### Phase 2 — Live demo workspace

Target: 2–4 weeks after Phase 1.

Deliverables:

- Deploy `demo.runory.com` or equivalent
- Add anonymous sessions and isolated demo data
- Implement reset, rate limits, and restricted permissions
- Connect the scenario entry points to the real Runory workspace
- Add product analytics for scenario start, completion, abandonment, and CTA conversion

Acceptance criteria:

- A visitor can create or modify approved demo records safely
- One visitor cannot materially disrupt another visitor's session
- The environment resets automatically
- All mutations use governed commands and produce audit events

### Phase 3 — Prompt-to-operation experience

Deliverables:

- Connect the hero prompt to Runory Runtime
- Interpret a bounded set of natural-language operational intents
- Show command planning, validation, confirmation, execution, and resulting UI state
- Add graceful handling for unsupported or ambiguous requests

Acceptance criteria:

- Supported prompts produce deterministic and auditable outcomes
- Ambiguous or high-impact requests require clarification or confirmation
- Median time to visible result is suitable for a homepage experience
- The visitor can open the affected customer, quote, work order, or schedule record

## Initial implementation scope

The first public implementation should remain deliberately narrow.

### Supported commands

- Create a customer or select an existing demo customer
- Create a service request or work order
- Schedule an inspection or visit
- Assign a demo technician
- List overdue quotes
- Create or execute a follow-up task
- Add one configured workflow step in a sandboxed scenario

### Deferred capabilities

- Arbitrary module installation
- Unrestricted workspace configuration
- Real external communications
- Live payments
- Customer-provided data uploads
- Cross-workspace operations
- Open-ended Agent tool access

## Website information architecture

Recommended homepage sequence:

1. Hero with interactive Agent input
2. Product-value statement and governed execution explanation
3. Three end-to-end scenario cards
4. Live product surfaces: Operations, Mobile, and Agent
5. Safety, permissions, audit, and rollback proof
6. Customer or pilot evidence when available
7. Final CTA: `Open Live Demo` or `Start with a Scenario`

The existing product explanation should remain concise. The live experience is responsible for proving the claims visually and operationally.

## Metrics

The initiative should be evaluated using product-experience metrics rather than page views alone.

Primary metrics:

- Hero interaction rate
- Scenario start rate
- Scenario completion rate
- Time to first meaningful product state
- Live-demo entry rate
- Demo-to-contact or demo-to-sign-up conversion

Diagnostic metrics:

- Unsupported prompt rate
- Failure or reset rate
- Scenario abandonment step
- Mobile versus desktop completion
- Repeated demo use within one session

## Ownership

- Product: scenarios, messages, visitor journey, acceptance criteria
- Design: homepage composition, transition design, responsive behavior
- Frontend: embedded experience, state presentation, analytics
- Platform Engineering: demo tenancy, reset model, permissions, command boundary
- FSM Engineering: scenario data and end-to-end workflow correctness
- Marketing / Sales: supporting videos, screenshots, and conversion paths

## Definition of done

The initiative is successful when a first-time visitor can complete one realistic Runory scenario without sales assistance and leave with a correct understanding of the product:

> Runory receives business intent, applies governed rules and commands, and turns it into observable field-service execution.

## Related documents

- [Product Definition](product-definition.md)
- [FSM Canonical Execution Product Architecture](fsm-canonical-execution-product-architecture.md)
- [Voice Intake Product Definition](voice-intake-product-definition.md)
- [Voice Intake Technical Specification](voice-intake-technical-spec.md)
- [Contract-driven Command Architecture](../architecture/contract-driven-command-architecture.md)
- [Thin FSM and Agent Runtime Architecture](../architecture/thin-fsm-agent-runtime.md)
- [Agent Operations](../agent-operations.md)
