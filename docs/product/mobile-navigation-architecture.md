# Mobile Navigation Architecture

Status: v0.5.1 implemented, v0.6/v0.7 evolution defined
Last updated: 2026-07-09

## Product principle

Runory mobile is not a responsive version of the desktop workspace. It is a dedicated execution shell for field workers, sales reps, and SMB operators.

Desktop `/w/...` is the management console. Mobile `/m/...` is the execution console. They share objects, APIs, permissions, audit trails, and pack metadata, but they must not share navigation behavior.

## Why bottom tabs cannot grow with packs

If every installed Pack contributes directly to bottom navigation, the mobile app breaks as soon as a workspace installs CRM, Sales Quote, FSM, Customer Service, Inventory, Billing, or AI packs together.

The scalable model is:

1. Packs contribute mobile capabilities.
2. The platform composes a small mobile shell.
3. Overflow capabilities go into Explore.
4. Future releases rank or pin capabilities by role and workspace policy.

## v0.5.1 behavior

v0.5.1 introduces `mobileNavigation` in Pack manifests.

Example:

```yaml
mobileNavigation:
  - key: quotes
    label: Quotes
    route: /quotes
    icon: file-text
    order: 30
```

Implemented pack contributions:

| Pack | Mobile capabilities |
| --- | --- |
| CRM Lite | Today, Customers |
| Sales Quote | Today, Customers, Quotes |
| FSM | Today, Schedule, Work Orders |

The mobile shell composes installed pack contributions with these rules:

- Deduplicate by `key`.
- Sort by `order`.
- Keep a bounded bottom navigation.
- Put overflow capabilities in `/m/w/:workspaceId/explore`.
- Always keep `Me` as the account/profile entry.
- Keep core mobile execution routes inside `/m/...`; do not link normal field-work flow into `/w/...`.

Current bottom navigation shape:

```text
Today / up to two primary business tabs / Explore / Me
```

For a workspace with CRM + Sales Quote + FSM installed, the bottom bar is expected to stay bounded while Explore exposes the full set:

- Customers
- Quotes
- Schedule
- Work Orders

## v0.6 evolution: role-aware mobile navigation

v0.6 should add role-aware ranking.

The same installed packs should produce different primary tabs for different users:

| User role | Likely primary tabs |
| --- | --- |
| Field Technician | Today, Schedule, Work Orders, Me |
| Dispatcher | Today, Schedule, Work Orders, Explore, Me |
| Sales Representative | Today, Customers, Quotes, Explore, Me |
| Owner / Manager | Today, Customers, Explore, Me |

This requires extending `mobileNavigation` with audience/ranking semantics:

```yaml
mobileNavigation:
  - key: work-orders
    label: Work Orders
    route: /work-orders
    icon: clipboard-list
    order: 50
    audience: [dispatcher, field_technician, service_supervisor]
    placement: primary
```

The platform should rank entries by:

1. Current user permission groups.
2. Workspace template / industry.
3. Explicit pack `order`.
4. Recent usage.
5. Admin-pinned mobile shortcuts.

## v0.7 evolution: configurable mobile workbench

v0.7 should allow workspace admins and users to tune the mobile shell without custom code.

Recommended capabilities:

- Admin-level default mobile tab policy per workspace.
- User-level pin/unpin of mobile apps.
- Role-specific mobile profiles.
- Pack-provided recommended mobile layouts.
- Usage analytics to suggest better tab placement.
- Optional “More” or “Explore” grouping by domain.

At this stage, Pack authors should still contribute capabilities, not directly own the shell.

## Guardrails

- Bottom navigation must remain bounded.
- Pack installation must not create uncontrolled mobile tab growth.
- Mobile routes must be first-class `/m/...` routes.
- A desktop escape hatch can exist in Account, but normal mobile task flow must not jump to desktop pages.
- Pack contributions must be declarative so future AI agents, MCP tools, and workspace policies can reason about mobile capabilities.
