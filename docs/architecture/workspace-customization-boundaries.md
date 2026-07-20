# Workspace Customization Boundaries

| Metadata | Value |
| --- | --- |
| Status | `canonical` |
| Topic | `customization` |
| Applies to | `v0.6+` |
| Owner | Product / Engineering |
| Last reviewed | 2026-07-20 |
| Supersedes | — |
| Superseded by | — |

This document is the concise decision guide for choosing the smallest safe
customization mechanism. The detailed persistence and merge model remains in
[Workspace Extension Architecture](workspace-extension-architecture.md).

## Three tiers

| Tier | Use it for | Boundary |
| --- | --- | --- |
| Workspace Metadata and presentation | Fields, relations, views, forms, navigation, terminology, and small custom objects | Declarative, Workspace-owned, versioned, and never edits an official manifest |
| Configurable process composition | Steps, assignees, conditions, required forms, SLA, notifications, and orchestration | Workflow invokes existing governed Commands at authoritative business boundaries |
| Governed extension development | New core invariants, authoritative Commands, or cross-aggregate atomic facts | Requires an Extension Module, Command Contract, compatible Provider, tests, and Catalog review |

The first two tiers are the default. A request moves to governed extension
development because of its business semantics, not because it was proposed by
an Agent.

## Agent operation lifecycle

Built-in Agents, external Agents, MCP, UI, and SDK clients use the same
governed lifecycle:

```text
discover → draft plan → validate → impact preview → approve → publish
                                              ↘ audit → version history → rollback
```

The existing API mapping is:

| Operation | API |
| --- | --- |
| Discover objects, fields, Commands, effects, and limits | Deferred until the Agent customization product has a concrete consumer |
| Validate a draft plan | `POST /api/workspaces/{id}/agent/plan` |
| Preview impact and risk | `POST /api/workspaces/{id}/agent/preview` |
| Publish an approved version | `POST /api/workspaces/{id}/agent/apply` |
| Read version history | `GET /api/workspaces/{id}/extensions/{extensionId}/versions` |
| Roll back through a new audited version | `POST /api/workspaces/{id}/agent/rollback` |

Discovery remains a documented product boundary only. A Runtime response
shape will be introduced when an Agent customization workflow consumes it;
until then, Runtime permission, actor, state, and expected-version checks stay
inside the existing governed Command path.

## Safe small custom object

A small Workspace-owned object may use fields, relations, generic CRUD,
permissions, views, search, audit, forms, and Workflow association.

It does not receive physical SQL, an unrestricted status mutation, permission
to override official fields, or cross-aggregate atomic writes. Those semantics
cross into governed extension development.

## Workflow and lifecycle decision

Configurable Workflow may change process composition, but it cannot directly
change a protected lifecycle field. At a governed boundary it must invoke the
named Command declared by the owning Module or Platform Service.

A separate versioned Custom Object State Machine Runtime is **deferred**. There
is not yet enough product evidence to justify a second lifecycle kernel.
User-defined lifecycles should compose versioned Workflow and existing
Commands. Runory must not introduce one unrestricted
`update_any_object_status` Command as a shortcut.

## Upgrade protection

Official metadata and Workspace metadata retain distinct ownership. Before a
future Module-upgrade mutation is allowed to publish, extension compatibility
preflight must reject:

- removal of an extension's target object;
- an official Module claiming a Workspace-owned field key;
- disabling an extension point still in use;
- newly reserved field keys or incompatible field types.

Compatible Workspace fields remain separate and are recomposed after the
official metadata changes. There is currently no general-purpose Module
upgrade mutation API; the preflight is implemented now so that a future API
cannot silently invent different behavior.

## Practical rule

If a change only describes data or presentation, use Workspace Metadata. If it
coordinates existing work, use Workflow. If it changes what must be true in an
authoritative transaction, use a governed Extension.
