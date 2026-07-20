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

Runory should not rely on static screenshots and a single demo video to establish product credibility. The website should let visitors experience a controlled version of the real product and understand, within seconds, how an external Agent turns business intent into governed field-service execution.

This initiative turns the website's product-proof section into a dedicated **Runory Live Experience**.

It supports the canonical [Product Definition](product-definition.md) and demonstrates the existing product, demo data, FSM scenarios, Agent interface, and governed execution model. It does not redefine the core product boundary.

## Product principle

> The strongest proof of Runory is that an external Agent can act on real business state while Runory remains the authoritative, governed execution layer.

The experience should show one useful business result before explaining the underlying platform. Real product surfaces, realistic business data, an explicit actor, permission checks, confirmation, and audit should appear as evidence inside the same execution rather than as separate feature claims.

The first meaningful result should be visible within 10–15 seconds. Marketing animation may guide the experience, but it must not imply capabilities that the product cannot perform.

The experience must preserve Runory's external-Agent-first boundary. It should not present a proprietary Runory chat assistant as the center of the product. The visitor may interact through a neutral external-Agent frame, a supported Agent integration, or a guided representation of an external Agent calling Runory through MCP, Skills, or SDKs.

## Reference research and product patterns

The following references were reviewed against their current official product and documentation material on 2026-07-16. They solve different parts of the problem; none is a template for Runory as a whole.

| Reference | What it actually proves | What Runory should borrow | What Runory should not copy |
| --- | --- | --- | --- |
| [ServiceTitan Dispatch](https://www.servicetitan.com/features/dispatch-software) | A serious FSM dispatch decision uses skills, zones, shifts, capacity, current schedule, location, and job context | Make scheduling recommendations explainable from operational constraints; keep the dispatch board as the authoritative result surface | Its breadth, setup density, and incumbent-enterprise complexity |
| [Retool Agents](https://retool.com/blog/how-agents-in-retool-solves-hard-parts-of-agent-development) | Agents can inherit user permissions, require review per tool call, and expose detailed run and audit history | Treat identity, permission, approval, execution, and observability as one continuous run | Making Runory an Agent builder or proprietary orchestration studio |
| [Attio Workflows](https://attio.com/platform/workflows) | Agent and workflow actions run over a coherent context layer; runs expose what was read, decided, and done | Let real product state carry the story; show the plan and resulting records together; make a run inspectable and replayable | CRM-oriented visual language or a collection of named built-in Agents |
| [Intercom Fin Procedures](https://www.intercom.com/help/en/articles/12599391-quick-start-create-a-fin-procedure) | Natural-language guidance is combined with deterministic procedures, explicit outcomes, and human handoff | Define successful business outcomes and escalation states, not merely successful tool calls | A proprietary conversational Agent as Runory's primary entry point |
| [WaniWani](https://www.waniwani.ai/) | Products are distributed through ChatGPT, Claude, and Gemini with cross-platform monitoring and compliance checks | Design the Runory experience to work consistently across external Agent channels; test tool behavior across clients | Treating an embedded website prompt as the long-term Agent experience |
| [Pipedream Connect](https://pipedream.com/docs/connect) and [Composio](https://docs.composio.dev/docs/authentication) | External Agents act for a specific connected user through managed authentication, scoped access, and isolated accounts | Make Agent connection, delegated identity, scope, expiry, and Workspace selection explicit | Becoming a generic integration marketplace unrelated to FSM execution |
| [ChatGPT MCP apps](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta) and [Claude remote MCP](https://support.anthropic.com/en/articles/11503834-building-custom-integrations-via-remote-mcp-servers) | Remote MCP products are installed, authorized, reviewed, and selectively enabled inside the user's chosen Agent | Make Runory a first-class remote MCP product with OAuth, tool metadata, and client-appropriate confirmations | Depending on one Agent vendor's UI or approval behavior |
| [Navattic](https://www.navattic.com/) and [Supademo](https://supademo.com/features/conditional-branching) | Ungated, short, persona-oriented demos reduce evaluation friction and expose completion and drop-off | Use guided capture for the earliest proof, supporting scenarios, reuse, and analytics | Confusing a recorded product tour with the final live product experience |

### What Runory should borrow

- Immediate interaction above the fold
- Real product UI rather than conceptual illustrations
- A visible input-to-result sequence
- Short, scenario-based walkthroughs
- Clear transitions between business states
- Low-friction access without mandatory registration
- Reusable demo assets across the website, sales, and documentation

### What Runory should not copy

- Another product's visual system or information architecture
- Open-ended prompts that exceed current product capability
- Simulated outcomes that cannot be reproduced in the real system
- Generic AI-chat demonstrations disconnected from FSM execution
- Long product tours that delay the first meaningful result

The benchmark for Runory is not visual similarity to these products. The benchmark is whether a visitor can understand and trust the product faster because the experience makes real business execution visible.

### Conclusions from the research

Runory should not compete on having the most impressive chat interface. External Agents already own that surface. Runory's distinctive product proof is the transition from an Agent's intent to an authoritative operational state, with the data, authority, constraints, and result all visible.

The experience therefore has three connected surfaces:

```text
Agent channel
The user's chosen place to express intent

→ Runory Action Card
Actor, data used, proposed commands, reasons, conflicts, permission, approval

→ Operational state
Schedule, assignments, work orders, mobile work, event, and audit receipt
```

The **Runory Action Card** is the central experience concept. It is not a transcript of hidden reasoning. It is a structured, portable business artifact that states:

- who or which delegated Agent is acting;
- which Workspace and role are in effect;
- which records and operational constraints were used;
- which named commands are proposed;
- what will change and what will not change;
- which conflicts or approvals remain;
- where to open the resulting records after execution.

After execution, the same artifact becomes an **Execution Receipt** with command IDs, affected records, status, audit link, and any supported recovery action. The Action Card and Execution Receipt should be renderable on the Runory website and, where supported, inside external Agent clients.

## Desired visitor outcome

Within 10–15 seconds, a visitor should see the first meaningful result. Within 30–60 seconds, the visitor should understand the complete proof sequence:

1. A business user asks an external Agent to schedule tomorrow's highest-priority visits.
2. The Agent reads the relevant work orders, sites, technician context, and current schedule through Runory.
3. The Agent proposes assignments and a schedule rather than mutating business state directly.
4. Runory applies the actor's permissions, detects a conflict, and presents the bounded plan for confirmation.
5. After confirmation, governed commands update the assignments and schedule.
6. The Operations Workspace, mobile view, and audit trail reflect the same resulting business state.

The experience should answer one primary question directly:

> Can my Agent safely operate real field-service work without bypassing my data, permissions, or business rules?

The answer should be demonstrated, not explained: the Agent reads real FSM context, proposes an allowed operation, Runory validates and executes it, and the resulting Workspace state and audit record become visible.

## Website experience structure

### 1. Canonical interactive hero

The first screen should present one composed experience: an external-Agent interaction beside the affected Runory Workspace. It should not be an isolated chat box or a passive product image.

Suggested headline:

> Tell your Agent what needs to happen. Runory handles the execution.

Suggested Chinese headline:

> 告诉你的 Agent 要达成什么，Runory 负责安全执行。

Suggested supporting statement:

> Runory gives external Agents authoritative FSM data, explicit permissions, governed commands, and a complete audit trail.

The canonical first prompt is:

> Schedule tomorrow's highest-priority visits.

This scenario should start from a visible, coherent business state:

- Five work orders need scheduling.
- Three technicians have different skills, regions, and availability.
- One proposed allocation has a schedule conflict.
- The external Agent is acting with the `dispatcher` permission group.

The visible sequence should be short and deterministic:

```text
External Agent request
→ Read work orders, sites, technician skills, and availability
→ Propose assignments and schedule
→ Runory checks permissions and conflicts
→ Visitor confirms the bounded plan
→ Assignments and schedule are updated
→ Audit record appears
```

The result must be visible in the Workspace rather than only reported in chat. The schedule should change, the affected visits should show their assigned technicians, and an audit entry should identify the actor, entry point, commands, and result.

A compact trust line may expose the execution boundary without interrupting the task:

```text
Acting as Dispatcher · 3 permitted actions · 1 confirmation · Audit recorded
```

The first release should use a bounded, allow-listed intent and deterministic plan. Prompt breadth is not a launch requirement.

### 2. Supporting scenario-based demos

The website may provide additional scenarios after the canonical hero is working reliably. These scenarios support the core proof; they are not parallel hero experiences.

#### Voice Intake

A customer calls, the request is understood, customer and site data are captured, and a work order is created or routed for confirmation.

#### Quote to Dispatch

A quote is accepted, a work order is scheduled, the appropriate field resource is assigned, and the customer is notified.

#### Agent Follow-up

Runory identifies an overdue or unaccepted quote, applies the configured condition, creates a follow-up action, and either executes it or requests approval.

Each supporting scenario should be completable in approximately 60–90 seconds. A guided interactive walkthrough is preferred to a long linear video. Phase 1 does not require all three scenarios.

### 3. One state, multiple product surfaces

The website should not present Operations, Mobile, and Agent as three disconnected products. They are views of the same authoritative business state.

#### Operations Workspace

Representative content:

- Contacts and Companies across Lead/customer lifecycle stages
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

The canonical experience should lead with Operations Workspace and Agent Interaction in one composition. Mobile Execution may appear after confirmation to show that the assigned technician receives the same updated visit state. Each visible transition must correspond to a real business-state change.

### 4. Supporting video and screenshots

Screenshots and videos remain useful, but they are supporting evidence rather than the primary experience.

Recommended assets:

- Three 20–40 second scenario clips
- One two-minute end-to-end overview
- High-resolution screenshots of each primary surface
- Optional annotated clips for security, audit, and rollback behavior

All assets should use the same seeded workspace and scenario data so the website, videos, sales demos, and documentation remain consistent.

## Current product truth and target capability

The public experience must distinguish between capabilities available in the current product and the target external-Agent experience.

### Available now

- FSM records for customers, sites, technicians, work orders, visits, assignments, and schedule entries
- Seeded technician skills, region, availability, assignments, schedules, and a known schedule conflict
- Operations and Planning Workspace surfaces plus mobile work views
- Named HTTP commands for work-order, assignment, schedule, form, quote, and other domain transitions
- Schedule planning and overlap detection in the Platform Core
- Workspace roles and Pack-defined business permission groups, including `dispatcher`, `field_technician`, and `service_supervisor`
- Audit events and command history
- A 21-tool stdio MCP surface for Workspace, Pack, schema, Extension, audit, and generic record operations
- Workspace API-key authentication for external MCP clients

### Not yet available as a complete external-Agent path

- Named FSM Command tools such as `schedule.plan`, Assignment commands, and governed transition commands on the MCP surface
- Permission-filtered capability discovery for an external Agent session
- A production Remote MCP endpoint with OAuth and incremental scopes
- A delegated Agent session that explicitly binds user, Agent client, Workspace, role, scopes, and expiry
- Portable Action Cards, approval requests, and Execution Receipts
- A public anonymous demo tenant with session isolation and automatic reset
- Rich scheduling capacity based on technician shifts, job requirements, travel time, parts readiness, and configurable optimization objectives
- Custom roles, field-level ACL, and record-level ACL

Until the named operational Commands are exposed through the external-Agent interface, Phase 1 must be described as a **guided product proof**, not as a live external Agent independently operating Runory. It may use real Runory components, real seeded states, and the same deterministic command results, but it must label the interaction honestly.

### Capability gate for the `Live` label

The canonical scenario may be called `Live` only when all of the following are true:

1. The external Agent discovers permission-filtered, named Runory Commands.
2. The Agent operates through a scoped identity bound to the demo Workspace.
3. The schedule and assignment mutations execute through the governed Command boundary.
4. The visible Workspace state is read back after execution rather than inferred by the presentation layer.
5. The Execution Receipt links to real command and audit records.
6. The session is isolated and reset safely.

Before this gate is met, use `Interactive Product Proof`, `Guided Scenario`, or `See Runory Execute` rather than `Live Agent`.

## North-star experience: Bring Your Own Agent

The long-term experience should begin in the user's preferred Agent, not on the Runory homepage:

```text
Connect Runory in ChatGPT, Claude, Codex, or another approved Agent
→ Choose Organization and Workspace
→ Review requested role and scopes
→ Ask for a business outcome
→ Receive a Runory Action Card
→ Confirm when policy requires it
→ Runory executes named Commands
→ Open the Execution Receipt and resulting Workspace state
```

### Delegated Agent Session

Every external-Agent run should bind and display:

- the human principal;
- the Agent client and connection;
- the Organization and Workspace;
- the effective Workspace role and business permission groups;
- granted scopes and permitted command families;
- session expiry and revocation state.

Long-lived Workspace API keys remain useful for server integrations, but the default human-to-Agent experience should evolve toward Remote MCP with OAuth, short-lived tokens, scope minimization, and step-up authorization.

### Permission-filtered capability discovery

The Agent should not receive every Runory tool and then fail after planning. Runory should return a capability manifest filtered by the effective actor, installed Packs, current business state, and client context. Each tool should carry risk metadata such as read-only, mutating, destructive, idempotent, open-world, confirmation policy, and required permission.

### Autonomy policy

Runory should support an explicit autonomy ladder per command family:

1. **Suggest** — read and recommend only.
2. **Prepare** — create a complete Action Card but do not mutate state.
3. **Confirm** — execute after a human approves the bounded change.
4. **Policy auto-execute** — execute low-risk operations inside a configured policy and surface the receipt.

Autonomy should never be a single global Agent toggle. It should depend on actor, command, impact, amount or volume, business state, and Workspace policy.

### Approval independent of Agent channel

Approval must remain a Runory business object or work item rather than a transient chat confirmation. A request started in one Agent client should be reviewable in the Runory Workspace and, where supported, another approved channel. This preserves authority and audit even when the external Agent session ends.

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

The first dataset should represent one coherent home-service company rather than disconnected examples. It should be designed around the canonical scheduling scenario first, then reused by supporting scenarios. It should contain:

- 20–30 customers and service sites
- Multiple acquisition sources on Lead-stage Contact/Company records
- Quotes in draft, sent, accepted, rejected, and overdue states
- Work orders across scheduling, field execution, completion, and follow-up
- A small dispatcher and technician roster
- Technician skills, regions, availability, and existing schedule sufficient to explain a scheduling result
- Five clearly identifiable work orders that need scheduling tomorrow
- At least one schedule conflict that can be resolved or explicitly overridden
- Realistic activity history and audit events
- At least one exception, escalation, and approval-required action

The hero should use a stable subset of this dataset. Visitors should be able to understand why the proposed schedule is reasonable without inspecting raw tables or configuration.

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

### Evidence model

The canonical interaction should expose the following evidence in context:

| Product layer | Visible proof |
| --- | --- |
| Business data | Work orders, sites, technician skills, availability, and existing schedule contribute to the plan |
| Identity | The external Agent is connected to a named demo actor and Workspace |
| Permission | The actor is visibly operating as `dispatcher`; only permitted commands can proceed |
| Business rules | A conflict is detected and cannot be silently ignored |
| Command execution | The experience distinguishes plan, validation, confirmation, and completion |
| Authoritative state | Schedule, assignments, Workspace, and mobile views reflect the same result |
| Audit | Actor, entry point, affected records, commands, and outcome are recorded |

The experience may include one secondary denied action after the successful result, for example asking the Dispatcher to approve a quote. The denial should explain that the current actor lacks `quote.approve` and may request approval from an authorized role. This is supporting trust evidence, not part of the primary path.

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

### Phase 1 — Guided product proof

Target: 1–2 weeks.

Deliverables:

- Replace placeholder marketing imagery with real product screenshots
- Build the canonical scheduling experience with a clearly labeled guided Agent frame and Runory Workspace shown together
- Use real Runory components and a stable snapshot of the canonical demo data
- Implement a bounded deterministic request, Runory Action Card, permission and conflict checks, confirmation, state transition, and Execution Receipt
- Produce one short canonical scenario clip from the same experience
- Add supporting screenshots only where they reinforce the canonical result
- Establish the first canonical demo dataset

Acceptance criteria:

- Visitors can reach a real product interaction from the homepage without registration
- A first meaningful result is visible within 10–15 seconds
- Every demonstrated entity, permission, command, and state exists in the current product
- The experience is explicitly labeled as guided and does not imply that the current MCP surface already executes the scheduling Commands
- The visitor can identify the request, actor, confirmation, changed business state, and audit result without reading platform documentation
- The experience works on desktop and mobile web
- No production systems or data are exposed

### Phase 2 — Operational external-Agent foundation

This phase is a product prerequisite for the live claim, not merely a website project.

Deliverables:

- Add permission-filtered capability discovery
- Expose the canonical FSM reads and named schedule and Assignment Commands through the Agent interface
- Add structured risk metadata and confirmation policy to operational tools
- Define the Runory Action Card and Execution Receipt contracts
- Bind every Agent execution to an effective actor, Workspace, permissions, request ID, command IDs, and audit events
- Add integration tests proving that MCP and Cloud UI operations produce the same governed result
- Introduce a production Remote MCP and OAuth path, or explicitly document a narrower interim connection path

Acceptance criteria:

- A supported external Agent can complete the canonical scenario without generic record mutation
- An unauthorized command is excluded from discovery or rejected consistently before mutation
- Every write returns an Execution Receipt backed by command and audit records
- Revoking the delegated connection prevents the next operation
- The path is tested in at least two external Agent clients before it becomes the homepage's canonical live claim

### Phase 3 — Isolated live demo workspace

Target: after the Phase 2 capability gate is met.

Deliverables:

- Deploy `demo.runory.com` or equivalent
- Add anonymous sessions and isolated demo data
- Implement reset, rate limits, and restricted permissions
- Connect the scenario entry points to the real Runory workspace
- Add product analytics for scenario start, completion, abandonment, and CTA conversion
- Add supporting Voice Intake or Quote to Dispatch walkthroughs only after the canonical scenario meets its acceptance criteria

Acceptance criteria:

- A visitor can create or modify approved demo records safely
- One visitor cannot materially disrupt another visitor's session
- The environment resets automatically
- All mutations use governed commands and produce audit events

### Phase 4 — Bring Your Own Agent

Deliverables:

- Publish a stable Remote MCP connection flow for supported external Agents
- Let users select a Workspace and review requested scopes during authorization
- Render or link the Action Card and Execution Receipt in supported Agent clients
- Interpret a bounded set of operational intents, beginning with scheduling variations
- Add graceful handling for unsupported, ambiguous, unauthorized, and approval-required requests
- Measure the same outcome consistently across Agent clients

Acceptance criteria:

- Supported prompts produce deterministic and auditable outcomes
- Ambiguous or high-impact requests require clarification or confirmation
- The same effective identity and permission policy applies across supported clients
- Median time to visible result is suitable for an Agent interaction
- The visitor can open the affected customer, quote, work order, or schedule record

## First live implementation scope

The first implementation that passes the `Live` capability gate should remain deliberately narrow. Phase 1 may represent this scope as a guided product proof before the operational Agent foundation is complete.

### Supported commands

- Read work orders that require scheduling
- Read service sites, technician skills, regions, availability, and current schedule
- Propose assignments and a schedule
- Detect and explain a schedule conflict
- Confirm and apply approved assignments and schedule entries
- Open the affected work orders, visits, and schedule
- Display the resulting audit events
- Demonstrate one permission-denied action without changing state

### Deferred capabilities

- Creating customers, service requests, or work orders from an open-ended hero prompt
- Voice Intake, Quote to Dispatch, and Agent Follow-up as equally weighted hero scenarios
- Workspace schema or workflow customization from the public hero
- Arbitrary module installation
- Unrestricted workspace configuration
- Real external communications
- Live payments
- Customer-provided data uploads
- Cross-workspace operations
- Open-ended Agent tool access

## Website information architecture

Recommended homepage sequence:

1. Canonical hero: external-Agent request and Runory Workspace result in one composition
2. Concise value statement: external Agents provide intelligence; Runory provides governed execution and truth
3. Evidence from the completed action: data used, actor, permission, conflict handling, confirmation, and audit
4. The same business state in Operations and Mobile views
5. Supporting scenarios: Voice Intake, Quote to Dispatch, and Agent Follow-up
6. Customer or pilot evidence when available
7. Final CTA: `See the Guided Scenario` before the capability gate; `Try the Live Scenario` or `Connect Your Agent` after it; `Start a Pilot` for commercial intent

The homepage should not repeat the same value through separate feature-card sections. The interactive experience is responsible for proving the claims visually and operationally; supporting copy should name what the visitor has already seen.

## Metrics

The initiative should be evaluated using product-experience metrics rather than page views alone.

Primary metrics:

- Hero interaction rate
- Canonical scenario start rate
- Canonical scenario completion rate
- Time to first meaningful product state
- Confirmation rate
- Live-demo entry rate
- Demo-to-contact or demo-to-sign-up conversion

Diagnostic metrics:

- Unsupported prompt rate
- Failure or reset rate
- Canonical scenario abandonment step
- Permission or conflict-check abandonment
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

The initiative is successful when a first-time visitor can see, within 15 seconds and without sales assistance, an external Agent use real FSM context to propose an operation, pass through Runory permissions and business rules, execute after confirmation, and produce a verifiable Workspace state and audit record.

The visitor should leave with one correct understanding of the product:

> External Agents provide intelligence and orchestration. Runory gives them authoritative business data and turns their intent into controlled, observable field-service execution.

## Related documents

- [Product Definition](product-definition.md)
- [FSM Canonical Execution Product Architecture](fsm-canonical-execution-product-architecture.md)
- [Voice Intake Product Definition](voice-intake-product-definition.md)
- [Voice Intake Technical Specification](voice-intake-technical-spec.md)
- [Contract-driven Command Architecture](../architecture/contract-driven-command-architecture.md)
- [Thin FSM and Agent Runtime Architecture](../architecture/thin-fsm-agent-runtime.md)
- [Agent Operations](../agent-operations.md)
